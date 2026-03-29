# Gamification

This document reflects the current configuration in backend/core/gamification.py and the logic in backend/agents/roadmap_agent.py.

## XP Table
- view_topic: 5 XP (not wired yet)
- complete_module: 50 XP
- daily_login: 10 XP (not wired yet)
- ask_question: 8 XP
- seven_day_streak: 100 XP bonus

## Levels
- Level 1: Prarambha (0 XP)
- Level 2: Jigyasa (100 XP)
- Level 3: Shravana (300 XP)
- Level 4: Manana (700 XP)
- Level 5: Abhyasa (1500 XP)
- Level 6: Viveka (3000 XP)
- Level 7: Vidyarthi (6000 XP)
- Level 8: Pandita (10000 XP)
- Level 9: Acharya (15000 XP)
- Level 10: Sarvagna (25000 XP)

## Badges (Configured)
- first_login: First Step, Complete first login
- first_topic: Curious Mind, View first topic
- first_module: Module Master, Complete first module
- 5_day_streak: Consistency I, Maintain 5-day streak
- 7_day_streak: Consistency II, Maintain 7-day streak
- 30_day_streak: Unstoppable, Maintain 30-day streak
- 100_topics: Explorer, View 100 topics
- 500_topics: Deep Explorer, View 500 topics
- 10_modules: Finisher I, Complete 10 modules
- 50_modules: Finisher II, Complete 50 modules
- first_question: Inquisitive, Ask first question
- 50_questions: Thinker, Ask 50 questions
- subject_complete: Subject Conqueror, Complete a subject
- all_slots_full: Maxed Out, Fill all subject slots
- level_10: Enlightened, Reach Level 10

## Badges (Currently Evaluated)
Roadmap Agent currently evaluates these conditions:
- first_login
- 5_day_streak
- 7_day_streak
- 30_day_streak
- 10_modules
- 50_modules
- subject_complete
- all_slots_full
- level_10

## Streak Rules
- Daily increment: 1
- Grace period: 24 hours
- Reset after miss: true
- Restore within hours: 12 (defined but not used yet)
- Bonus: 100 XP every 7 days

## Subject Slot Rules
- Max active subjects: 10
- Hard block on full: true
- Remove on completion: true (config only)
- Auto free slot on completion: true (config only)
- Completion reward XP: 200 (config only)

The API enforces the max active subjects limit when adding a subject. Subject completion is marked in the progress endpoint when all modules are completed.
