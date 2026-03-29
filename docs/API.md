# API

Base URL: /api/v1

Auth: All endpoints except /health and /auth require a Bearer token.
Header: Authorization: Bearer <token>

## Auth

### POST /api/v1/auth/register
Request body:
```
{
  "email": "student@example.com",
  "name": "Student Name",
  "password": "password"
}
```
Response:
```
{
  "access_token": "<jwt>",
  "token_type": "bearer"
}
```

### POST /api/v1/auth/login
Request body:
```
{
  "email": "student@example.com",
  "password": "password"
}
```
Response:
```
{
  "access_token": "<jwt>",
  "token_type": "bearer"
}
```

### GET /api/v1/auth/me
Response:
```
{
  "id": "<uuid>",
  "email": "student@example.com",
  "name": "Student Name",
  "xp": 0,
  "level": 1,
  "streak": 0,
  "created_at": "2026-03-30T00:00:00Z"
}
```

### GET /api/v1/auth/google
Redirects to Google OAuth.

### GET /api/v1/auth/google/callback?code=...
Response:
```
{
  "access_token": "<jwt>",
  "token_type": "bearer"
}
```

## Subjects

### GET /api/v1/subjects
Response:
```
[
  {
    "id": "<uuid>",
    "name": "Operating Systems",
    "branch": "CSE",
    "semester": 4,
    "modules_scraped": 3,
    "is_completed": false,
    "added_at": "2026-03-30T00:00:00Z"
  }
]
```

### POST /api/v1/subjects/add
Request body:
```
{
  "name": "Operating Systems",
  "branch": "CSE",
  "semester": 4
}
```
Response: Same shape as GET /subjects item.

### DELETE /api/v1/subjects/{subject_id}
Response: 204 No Content

### POST /api/v1/subjects/{subject_id}/scrape
Response:
```
{
  "task_id": "<celery_task_id>",
  "message": "Scraping started for 'Operating Systems' module 1"
}
```

## Query

### POST /api/v1/query
Request body:
```
{
  "question": "What is a process?",
  "subject_id": "<uuid>"
}
```
Response:
```
{
  "exact_answer": "...",
  "simplified_answer": "...",
  "real_world_example": "...",
  "xp_earned": 8,
  "new_xp": 108,
  "level": 2,
  "level_name": "Jigyasa",
  "leveled_up": false,
  "badges_unlocked": ["first_question"],
  "cached": false
}
```

### GET /api/v1/query/history
Response:
```
[
  {
    "id": "<uuid>",
    "question": "What is a process?",
    "exact_answer": "...",
    "simplified_answer": "...",
    "real_world_example": "...",
    "subject_name": "Operating Systems",
    "created_at": "2026-03-30T00:00:00Z"
  }
]
```

## Progress

### GET /api/v1/progress
Response:
```
{
  "user_id": "<uuid>",
  "xp": 120,
  "level": 2,
  "level_name": "Jigyasa",
  "xp_to_next_level": 180,
  "streak": 3,
  "badges": [
    { "id": "first_login", "name": "First Step", "condition": "Complete first login" }
  ]
}
```

### GET /api/v1/progress/roadmap/{subject_id}
Response:
```
{
  "subject_id": "<uuid>",
  "subject_name": "Operating Systems",
  "total_modules": 5,
  "completed_modules": 2,
  "completion_percentage": 40.0,
  "modules": [
    { "module_number": 1, "is_completed": true, "completed_at": "2026-03-30T00:00:00Z" }
  ]
}
```

### POST /api/v1/progress/module/complete
Request body:
```
{
  "subject_id": "<uuid>",
  "module_number": 1
}
```
Response:
```
{
  "xp_earned": 50,
  "new_xp": 150,
  "level": 2,
  "level_name": "Jigyasa",
  "leveled_up": false,
  "module_number": 1,
  "subject_id": "<uuid>"
}
```

## Health

### GET /health
Response:
```
{ "status": "ok" }
```
