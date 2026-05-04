"""
Seed VTU CS branch subject templates.
Run from backend/: python seed_subjects.py
"""
import asyncio
import sys

sys.path.insert(0, ".")

from sqlalchemy import select

from core.database import AsyncSessionLocal, Base, engine
from models.db_models import Module, Subject

SUBJECTS = [
    # Semester 3
    {
        "code": "BCS301",
        "name": "Mathematics III",
        "semester": 3,
        "modules": [
            "Fourier Series",
            "Laplace Transform",
            "Z-Transform",
            "Numerical Methods",
            "Statistics",
        ],
    },
    {
        "code": "BCS302",
        "name": "Digital Design",
        "semester": 3,
        "modules": [
            "Number Systems",
            "Boolean Algebra",
            "Combinational Circuits",
            "Sequential Circuits",
            "Memory & PLDs",
        ],
    },
    {
        "code": "BCS303",
        "name": "Discrete Math",
        "semester": 3,
        "modules": [
            "Set Theory",
            "Graph Theory",
            "Trees",
            "Logic",
            "Combinatorics",
        ],
    },
    # Semester 4
    {
        "code": "BCS401",
        "name": "Analysis of Algorithms",
        "semester": 4,
        "modules": [
            "Intro & Complexity",
            "Divide & Conquer",
            "Greedy",
            "Dynamic Programming",
            "Backtracking",
        ],
    },
    {
        "code": "BCS402",
        "name": "Computer Organization",
        "semester": 4,
        "modules": [
            "Basic Structure",
            "Arithmetic",
            "Processing Unit",
            "Memory",
            "IO Organization",
        ],
    },
    # Semester 5
    {
        "code": "BCS501",
        "name": "DAA",
        "semester": 5,
        "modules": [
            "Asymptotic Notation",
            "Divide & Conquer",
            "Greedy Method",
            "Dynamic Programming",
            "Branch & Bound",
        ],
    },
    {
        "code": "BCS502",
        "name": "DBMS",
        "semester": 5,
        "modules": [
            "ER Model",
            "Relational Algebra",
            "SQL",
            "Normalization",
            "Transactions",
        ],
    },
    {
        "code": "BCS503",
        "name": "Computer Networks",
        "semester": 5,
        "modules": [
            "Network Models",
            "Data Link",
            "Network Layer",
            "Transport Layer",
            "Application Layer",
        ],
    },
]


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        inserted = 0
        skipped = 0

        for subj_data in SUBJECTS:
            existing = await db.execute(
                select(Subject).where(
                    Subject.code == subj_data["code"],
                    Subject.branch_template == True,  # noqa: E712
                )
            )
            if existing.scalar_one_or_none():
                print(f"  SKIP  {subj_data['code']} {subj_data['name']} (already exists)")
                skipped += 1
                continue

            subject = Subject(
                user_id=None,
                code=subj_data["code"],
                name=subj_data["name"],
                branch="CS",
                semester=subj_data["semester"],
                status="template",
                branch_template=True,
            )
            db.add(subject)
            await db.flush()

            for idx, module_title in enumerate(subj_data["modules"], start=1):
                module = Module(
                    subject_id=subject.id,
                    number=idx,
                    title=module_title,
                    topics=[],
                    status="locked",
                )
                db.add(module)

            print(f"  INSERT {subj_data['code']} {subj_data['name']} (sem {subj_data['semester']}, {len(subj_data['modules'])} modules)")
            inserted += 1

        await db.commit()
        print(f"\nDone. Inserted: {inserted}, Skipped: {skipped}")


if __name__ == "__main__":
    asyncio.run(seed())
