# Gamification

How XP, levels, badges, and streaks work in Sarvagna.

---

## File: `backend/agents/roadmap_agent.py` + `backend/core/gamification.py`

---

## XP (Experience Points)

XP is awarded for study actions. Stored in `users.xp` column.

| Action | XP Earned | When triggered |
|--------|-----------|----------------|
| `ask_question` | 8 XP | After every Q&A query (POST /query) |
| `complete_module` | 50 XP | After POST /progress/module/complete |
| `seven_day_streak` | 100 XP bonus | When streak hits 7 days |
| `view_topic` | 5 XP | Config exists, not yet wired |
| `daily_login` | 10 XP | Config exists, not yet wired |

---

## Levels

10 levels total. Level is recalculated every time XP changes.

| Level | Name | XP Required |
|-------|------|-------------|
| 1 | Prarambha (Beginning) | 0 |
| 2 | Jigyasa (Curiosity) | 100 |
| 3 | Shravana (Listening) | 300 |
| 4 | Manana (Reflection) | 700 |
| 5 | Abhyasa (Practice) | 1,500 |
| 6 | Viveka (Discernment) | 3,000 |
| 7 | Vidyarthi (Student) | 6,000 |
| 8 | Pandita (Scholar) | 10,000 |
| 9 | Acharya (Teacher) | 15,000 |
| 10 | Sarvagna (All-knowing) | 25,000 |

```python
def calculate_level(xp: int) -> tuple[int, str]:
    for level_num, (name, threshold) in reversed(LEVELS.items()):
        if xp >= threshold:
            return level_num, name
    return 1, "Prarambha"
```

The API response always includes `xp_to_next_level` so the frontend can show a progress bar.

---

## Badges

15 badges configured. 9 are currently evaluated.

| Badge ID | Name | Condition | Evaluated? |
|----------|------|-----------|-----------|
| `first_login` | First Step | Complete first login | ✅ |
| `first_topic` | Curious Mind | View first topic | ❌ |
| `first_module` | Module Master | Complete first module | ❌ |
| `5_day_streak` | Consistency I | 5-day streak | ✅ |
| `7_day_streak` | Consistency II | 7-day streak | ✅ |
| `30_day_streak` | Unstoppable | 30-day streak | ✅ |
| `10_modules` | Finisher I | Complete 10 modules total | ✅ |
| `50_modules` | Finisher II | Complete 50 modules total | ✅ |
| `first_question` | Inquisitive | Ask first question | ❌ |
| `50_questions` | Thinker | Ask 50 questions | ❌ |
| `subject_complete` | Subject Conqueror | Complete a full subject | ✅ |
| `all_slots_full` | Maxed Out | Fill all 10 subject slots | ✅ |
| `level_10` | Enlightened | Reach Level 10 | ✅ |
| `100_topics` | Explorer | View 100 topics | ❌ |
| `500_topics` | Deep Explorer | View 500 topics | ❌ |

Badges are returned in the API response as `badges_unlocked: string[]`. The frontend shows a toast notification for each new badge.

---

## Streaks

A streak counts consecutive days the student has been active.

**Rules:**

| Rule | Value |
|------|-------|
| Grace period | 24 hours from last login |
| Reset condition | No activity for > 24 hours |
| Bonus trigger | Every 7 days |
| Bonus amount | 100 XP |

**Logic in `roadmap_agent.update_streak(user_id)`:**

```python
now = datetime.now(tz=utc)
last = user.last_login

if last is None:
    # First login
    user.streak = 1

elif (now - last).total_seconds() <= 86400:  # 24 hours
    # Within grace period — increment
    user.streak += 1
    if user.streak % 7 == 0:
        await award_xp(user_id, "seven_day_streak")  # +100 XP

else:
    # Missed a day — reset
    user.streak = 1

user.last_login = now
```

---

## Subject Slots

| Config | Value |
|--------|-------|
| Max active subjects | 10 |
| Hard block when full | Yes (returns 400 error) |
| Subject completion reward | 200 XP (configured, not wired yet) |

When a student tries to add an 11th subject:
```
400 Bad Request: "You have reached the maximum of 10 active subjects"
```

---

## Module Completion Flow

```
POST /progress/module/complete
  { "subject_id": "uuid", "module_number": 1 }

→ Create/update Progress record (is_completed=True, completed_at=now)
→ Check if ALL 5 modules for this subject are completed
   → If yes: UPDATE subjects SET is_completed=True
→ Award 50 XP via roadmap_agent.award_xp("complete_module")
→ Recalculate level
→ Check badges
→ Return { xp_earned, new_xp, level, level_name, leveled_up }
```

---

## XP Award Flow

```python
async def award_xp(user_id: str, action: str) -> dict:
    xp_gain = ACTION_XP_MAP[action]  # e.g. 50
    user.xp += xp_gain
    old_level = user.level
    user.level, level_name = calculate_level(user.xp)
    leveled_up = user.level > old_level
    await db.commit()
    return {
        "xp_earned": xp_gain,
        "new_xp": user.xp,
        "level": user.level,
        "level_name": level_name,
        "leveled_up": leveled_up
    }
```
