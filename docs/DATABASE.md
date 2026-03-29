# Database Schema

The backend uses PostgreSQL with SQLAlchemy models defined in backend/models/db_models.py.

## users
Columns:
- id (UUID, primary key)
- email (string, unique, required)
- name (string, required)
- google_id (string, unique, nullable, also used for local password hash)
- xp (int, default 0)
- level (int, default 1)
- streak (int, default 0)
- last_login (timestamp with timezone, nullable)
- created_at (timestamp with timezone, default now)

## subjects
Columns:
- id (UUID, primary key)
- user_id (UUID, foreign key to users.id, required)
- name (string, required)
- branch (string, required)
- semester (int, required)
- modules_scraped (int, default 0)
- is_completed (bool, default false)
- added_at (timestamp with timezone, default now)

## queries
Columns:
- id (UUID, primary key)
- user_id (UUID, foreign key to users.id, required)
- subject_id (UUID, foreign key to subjects.id, required)
- question (text, required)
- exact_answer (text, nullable)
- simplified_answer (text, nullable)
- real_world_example (text, nullable)
- created_at (timestamp with timezone, default now)

## progress
Columns:
- id (UUID, primary key)
- user_id (UUID, foreign key to users.id, required)
- subject_id (UUID, foreign key to subjects.id, required)
- module_number (int, required)
- is_completed (bool, default false)
- completed_at (timestamp with timezone, nullable)

## Relationships
- User has many Subjects, Queries, and Progress records.
- Subject has many Queries and Progress records.
- Deleting a user or subject cascades to related rows.
