"""Utility functions for loading branch-wise VTU syllabus data."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List


_SYLLABUS_DIR = Path(__file__).resolve().parents[1] / "data" / "syllabus"

_BRANCH_FILE_MAP = {
    "CS": "cs_syllabus.json",
    "AIML": "aiml_syllabus.json",
    "ECE": "ece_syllabus.json",
    "ME": "me_syllabus.json",
    "CV": "civil_syllabus.json",
    "CIVIL": "civil_syllabus.json",
    "IS": "is_syllabus.json",
}


def _normalize_branch(branch: str) -> str:
    return branch.strip().upper()


def _get_branch_file(branch: str) -> Path:
    key = _normalize_branch(branch)
    filename = _BRANCH_FILE_MAP.get(key)
    if not filename:
        filename = f"{key.lower()}_syllabus.json"
    return _SYLLABUS_DIR / filename


def get_syllabus(branch: str) -> Dict[str, Any]:
    """Load a branch syllabus JSON file by branch name.

    Returns an empty dict if the file does not exist.
    """
    path = _get_branch_file(branch)
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def _get_semester_block(syllabus: Dict[str, Any], semester: int) -> Any:
    if not syllabus:
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

    # Fallback: some schemas may store semester blocks at top-level
    return syllabus.get(semester) or syllabus.get(sem_key)


def _extract_subjects(semester_block: Any) -> List[str]:
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


def _find_subject_block(semester_block: Any, subject: str) -> Any:
    if not isinstance(semester_block, dict):
        return None

    subjects = semester_block.get("subjects")
    if isinstance(subjects, dict):
        for key, value in subjects.items():
            if isinstance(key, str) and key.strip().lower() == subject.strip().lower():
                return value
        return None

    if isinstance(subjects, list):
        for item in subjects:
            if isinstance(item, dict):
                name = item.get("name") or item.get("subject")
                if isinstance(name, str) and name.strip().lower() == subject.strip().lower():
                    return item
    return None


def get_subjects(branch: str, semester: int) -> List[str]:
    """Return a list of subjects for a given branch and semester."""
    syllabus = get_syllabus(branch)
    semester_block = _get_semester_block(syllabus, semester)
    return _extract_subjects(semester_block)


def get_modules(branch: str, semester: int, subject: str) -> List[str]:
    """Return a list of modules for a given branch, semester, and subject."""
    syllabus = get_syllabus(branch)
    semester_block = _get_semester_block(syllabus, semester)
    subject_block = _find_subject_block(semester_block, subject)

    if isinstance(subject_block, dict):
        modules = subject_block.get("modules")
        if isinstance(modules, list):
            return [m for m in modules if isinstance(m, str)]
        if isinstance(modules, dict):
            return list(modules.keys())
    return []
