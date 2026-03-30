"""Utility functions for loading branch-wise VTU syllabus data.

Supports two JSON formats:
  - Flat list:  [ { "name", "semester", "branch", "modules": [{number, title, topics}] } ]
  - Legacy dict: { "semesters": { ... } }
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional


_SYLLABUS_DIR = Path(__file__).resolve().parents[1] / "data" / "syllabus"

_BRANCH_FILE_MAP = {
    "CS": "cs_syllabus.json",
    "CSE": "cs_syllabus.json",
    "AIML": "aiml_syllabus.json",
    "ECE": "ece_syllabus.json",
    "ME": "me_syllabus.json",
    "CV": "civil_syllabus.json",
    "CIVIL": "civil_syllabus.json",
    "IS": "is_syllabus.json",
}

_STOP_WORDS = frozenset(
    ["and", "or", "of", "the", "in", "to", "a", "an", "with", "for",
     "its", "their", "this", "that", "is", "are", "be", "by", "on",
     "from", "into", "using", "used", "based", "methods", "approach"]
)


def _normalize_branch(branch: str) -> str:
    return branch.strip().upper()


def _get_branch_file(branch: str) -> Path:
    key = _normalize_branch(branch)
    filename = _BRANCH_FILE_MAP.get(key)
    if not filename:
        filename = f"{key.lower()}_syllabus.json"
    return _SYLLABUS_DIR / filename


def get_syllabus(branch: str) -> Any:
    """Load the branch syllabus JSON.

    Returns a list (flat format) or dict (legacy format).
    Returns empty list/dict on missing file.
    Uses utf-8-sig to handle BOM-encoded files.
    """
    path = _get_branch_file(branch)
    try:
        with path.open("r", encoding="utf-8-sig") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


# ── Flat-list format helpers ───────────────────────────────────────────────

def _find_subject_entry(
    entries: List[Dict[str, Any]],
    semester: int,
    subject: str,
) -> Optional[Dict[str, Any]]:
    """Find a subject entry in a flat list by semester + fuzzy name match."""
    subject_lower = subject.strip().lower()
    # Exact match first
    for entry in entries:
        if entry.get("semester") == semester:
            if entry.get("name", "").strip().lower() == subject_lower:
                return entry
    # Partial match fallback
    for entry in entries:
        if entry.get("semester") == semester:
            name = entry.get("name", "").strip().lower()
            if subject_lower in name or name in subject_lower:
                return entry
    # Semester-agnostic partial match (last resort)
    for entry in entries:
        name = entry.get("name", "").strip().lower()
        if subject_lower in name or name in subject_lower:
            return entry
    return None


def _sorted_modules(entry: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Return the modules list sorted by module number."""
    return sorted(entry.get("modules", []), key=lambda m: m.get("number", 0))


# ── Legacy dict-format helpers ─────────────────────────────────────────────

def _get_semester_block(syllabus: Dict[str, Any], semester: int) -> Any:
    if not syllabus or not isinstance(syllabus, dict):
        return None
    sem_key = str(semester)
    semesters = syllabus.get("semesters")
    if isinstance(semesters, dict):
        return semesters.get(semester) or semesters.get(sem_key)
    if isinstance(semesters, list):
        for item in semesters:
            if not isinstance(item, dict):
                continue
            if item.get("semester") in (semester, sem_key):
                return item
            if item.get("number") in (semester, sem_key):
                return item
    return syllabus.get(semester) or syllabus.get(sem_key)


def _find_legacy_subject_block(semester_block: Any, subject: str) -> Any:
    if not isinstance(semester_block, dict):
        return None
    subjects = semester_block.get("subjects")
    subject_lower = subject.strip().lower()
    if isinstance(subjects, dict):
        for key, value in subjects.items():
            if isinstance(key, str) and key.strip().lower() == subject_lower:
                return value
        return None
    if isinstance(subjects, list):
        for item in subjects:
            if isinstance(item, dict):
                name = item.get("name") or item.get("subject")
                if isinstance(name, str) and name.strip().lower() == subject_lower:
                    return item
    return None


# ── Public API ─────────────────────────────────────────────────────────────

def get_subjects(branch: str, semester: int) -> List[str]:
    """Return a list of subject names for a given branch and semester."""
    data = get_syllabus(branch)
    if isinstance(data, list):
        return [e["name"] for e in data if e.get("semester") == semester and "name" in e]
    # Legacy dict format
    semester_block = _get_semester_block(data, semester)
    if not isinstance(semester_block, dict):
        return []
    subjects = semester_block.get("subjects")
    if isinstance(subjects, dict):
        return list(subjects.keys())
    if isinstance(subjects, list):
        names: List[str] = []
        for item in subjects:
            if isinstance(item, str):
                names.append(item)
            elif isinstance(item, dict):
                name = item.get("name") or item.get("subject")
                if isinstance(name, str):
                    names.append(name)
        return names
    return []


def get_modules(branch: str, semester: int, subject: str) -> List[str]:
    """Return module titles for a given branch, semester, and subject.

    Returns e.g. ["Differential Calculus-I", "Linear Algebra", ...]
    """
    data = get_syllabus(branch)

    if isinstance(data, list):
        entry = _find_subject_entry(data, semester, subject)
        if entry is None:
            return []
        return [
            m.get("title", f"Module {m.get('number', i + 1)}")
            for i, m in enumerate(_sorted_modules(entry))
        ]

    # Legacy dict format — modules were stored as plain strings
    semester_block = _get_semester_block(data, semester)
    subject_block = _find_legacy_subject_block(semester_block, subject)
    if isinstance(subject_block, dict):
        modules = subject_block.get("modules")
        if isinstance(modules, list):
            return [m for m in modules if isinstance(m, str)]
        if isinstance(modules, dict):
            return list(modules.keys())
    return []


def get_topic_keywords(
    branch: str, semester: int, subject: str, module_number: int
) -> List[str]:
    """Return meaningful keywords for a specific module (1-indexed).

    For flat-list JSON: extracts words from module title + topics list.
    For legacy JSON: tokenises the plain module string.
    """
    data = get_syllabus(branch)

    if isinstance(data, list):
        entry = _find_subject_entry(data, semester, subject)
        if entry is None:
            return []
        modules = _sorted_modules(entry)
        idx = module_number - 1
        if idx < 0 or idx >= len(modules):
            return []
        mod = modules[idx]
        text_parts = [mod.get("title", "")]
        text_parts.extend(mod.get("topics", []))
        text = " ".join(text_parts)
    else:
        # Legacy path
        module_list = get_modules(branch, semester, subject)
        idx = module_number - 1
        if idx < 0 or idx >= len(module_list):
            return []
        text = module_list[idx]

    tokens = (
        text.lower()
        .replace(",", " ").replace(":", " ").replace(";", " ")
        .replace("(", " ").replace(")", " ").replace("-", " ")
        .split()
    )
    return [t for t in tokens if len(t) > 3 and t not in _STOP_WORDS]
