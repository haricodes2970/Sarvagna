# Data Flow

Step-by-step walkthroughs of every major operation in Sarvagna.

---

## 1. Student Registers

```
Frontend (LoginPage)
  → POST /api/v1/auth/register { email, name, password }
  → Backend: bcrypt hash password, store as google_id="local:<hash>"
  → INSERT INTO users (id, email, name, google_id, xp=0, level=1, streak=0)
  → Generate JWT (30 days expiry)
  → Return { access_token }

Frontend
  → Store token in localStorage + Zustand
  → Navigate to /dashboard
```

---

## 2. Student Adds a Subject

```
Frontend (DashboardPage)
  → Select: Scheme=2022, Branch=AIML, Semester=6
  → GET /subjects/catalog?branch=AIML&semester=6
  → Receive: ["Natural Language Processing", "Machine Learning", ...]
  → Student clicks "Natural Language Processing"
  → POST /api/v1/subjects/add { name: "NLP", branch: "AIML", semester: 6 }

Backend
  → Check: user has < 10 subjects
  → INSERT INTO subjects (id, user_id, name, branch, semester, modules_scraped=0)
  → Launch background task: asyncio.gather(_scrape_module_1, _scrape_module_2, ..._5)
  → Return subject row immediately (scraping runs in background)

Background (for each module 1–5, in parallel):
  → scrape_subject("NLP", module_number, "AIML", 6)
      → Get module title from syllabus_loader ("Introduction to NLP and Text Processing")
      → Build query: "VTU Natural Language Processing Introduction to NLP notes"
      → Try Wikipedia API → fetch 2 articles → combine text
      → Also try DDG → fetch 3 pages → extract text + images
      → Return (text, image_urls)
  → chunk_and_store(text, "NLP", module_number, image_urls)
      → Split into 512-token chunks (50-token overlap)
      → For each chunk: embed via Ollama → 768-dim vector
      → Upsert to Qdrant: "natural_language_processing_module_1"
      → Store image_urls in first chunk payload
  → UPDATE subjects SET modules_scraped = modules_scraped + 1 WHERE id = '{id}'

Frontend
  → Polls GET /subjects every 8 seconds
  → Shows amber banner: "Scraping content… 3/5 modules done"
  → Turns green: "Textbook content ready — 5/5 modules scraped"
```

---

## 3. Student Opens Chat for a Topic

```
Frontend (ImportantQuestionsPage or ModuleMapPage)
  → Student clicks "Study This" on question "Explain POS Tagging"
  → Navigate to: /chat/{subjectId}/1?topicTitle=Explain+POS+Tagging

Frontend (ChatPage loads)
  → GET /chat/{subjectId}/1?page=1
  → Receives chat history (may have prior messages)
  → useEffect detects topicTitle in URL params
  → Auto-sends: "Teach me this topic: Explain POS Tagging"
  → POST /chat/{subjectId}/1 { content: "Teach me this topic: Explain POS Tagging" }

Backend (chat route)
  → Validate JWT → get current user
  → INSERT ChatMessage (role="user", content="Teach me this topic: Explain POS Tagging")
  → Fetch last 20 messages from DB (context window)
  → Call teach_module("NLP", 1, "Teach me...", history, user_id, subject_id)

teach_module():
  → Embed message via Ollama → 768-dim vector
  → Search Qdrant: "natural_language_processing_module_1"
      limit=8, score_threshold=0.5
  → Also search: "important_{subject_id}"
      limit=5, score_threshold=0.6
  → Collect image_urls from payload of matching chunks
  → Build system_prompt:
      [Sarvagna teaching format prompt]
      ---
      CURRENT SESSION CONTEXT
      Subject: Natural Language Processing
      Module: 1
      TEXTBOOK CONTENT:
      [chunk 1 text]
      ---
      [chunk 2 text]
      ---
      [chunk 3 text]
      ---
      PROFESSOR'S IMPORTANT QUESTIONS:
      ⚠️ PROFESSOR MARKED THIS AS IMPORTANT: Explain POS Tagging
  → Build messages array:
      [system_prompt, ...chat_history, user_message]
  → Call Groq llama-3.3-70b:
      temperature=0.4, max_tokens=2048
  → Receive markdown response:
      "## 📘 Topic: POS Tagging\n\n> 🎯 **Exam Weightage:**..."
  → Append images:
      "\n\n<!-- SARVAGNA_IMAGES -->\nhttps://img1.jpg\n<!-- /SARVAGNA_IMAGES -->"
  → Return full response string

Backend
  → INSERT ChatMessage (role="assistant", content=<response>)
  → Return { user_message, assistant_message }

Frontend
  → Parse response: strip <!-- SARVAGNA_IMAGES --> block, extract URLs
  → Render text with ReactMarkdown
      → ASCII code blocks → monospace
      → Mermaid code blocks → MermaidDiagram component
  → Render images in 2-column grid below text
```

---

## 4. Student Asks a Q&A Question

```
Frontend (SubjectPage or DashboardPage Q&A panel)
  → POST /api/v1/query { question: "What is tokenization?", subject_id: "uuid" }

Backend (query route)
  → Check rate limit: Redis key "rate:{user_id}:{date}" < 10
  → Call orchestrator.handle_query("What is tokenization?", "NLP", user_id)

orchestrator.handle_query():
  → key = sha256("NLP::What is tokenization?")
  → GET Redis: "sarvagna:answer:{key}"
  → CACHE HIT: return cached answer immediately

  → CACHE MISS:
      → Call teacher_agent.answer_question()
          → Embed question via Ollama
          → Search Qdrant across all NLP collections (all modules)
          → Build JSON prompt with context
          → Call Groq → parse JSON response
          → { exact_answer, simplified_answer, real_world_example }
      → Award 8 XP: roadmap_agent.award_xp("ask_question")
          → UPDATE users SET xp = xp + 8
          → Recalculate level
      → Update streak: roadmap_agent.update_streak()
          → Check last_login vs now
          → Increment or reset streak
          → If streak % 7 == 0: award 100 XP bonus
      → Check badges: roadmap_agent.check_badges()
          → Evaluate all badge conditions
          → Return list of newly earned badge IDs
      → Cache result for 24 hours
      → Return combined response

Backend
  → INSERT INTO queries (question, exact_answer, ...)
  → Return { exact_answer, simplified_answer, real_world_example,
             xp_earned, new_xp, level, leveled_up, badges_unlocked, cached }

Frontend
  → Show answer in 3 tabs
  → Show XP animation (XPToast)
  → Show badge toast for each new badge
```

---

## 5. Student Uploads Important Questions

```
Frontend (ImportantQuestionsPage)
  → Student pastes:
      "1. Explain POS tagging.\n
       2. Apply the bigram model for the test sentence\n
          and estimate the probability.\n
       3. Explain CYK algorithm."
  → Select Module: 1
  → Click "Save Questions"
  → POST /important-questions/{subject_id}
       { text: "...", module_number: 1 }

Backend (_parse_questions):
  → Scan lines for numbered pattern: r"^\s*(?:Q|q)?(\d+)[.)]\s+"
  → Line "1. Explain POS tagging." → start new question
  → Line "2. Apply the bigram model for the test sentence" → start new question
  → Line "   and estimate the probability." → continuation, join to Q2
  → Line "3. Explain CYK algorithm." → start new question
  → Result: 3 questions (not 5 lines)

For each question:
  → Embed via Ollama → 768-dim vector
  → Upsert to Qdrant: "important_{subject_id}"
  → INSERT INTO important_questions (user_id, subject_id, question, module_number)

→ Return { count: 3, questions: [...] }

Frontend
  → Toast: "Saved 3 questions"
  → Refetch question list
```

---

## 6. Student Completes a Module

```
Frontend (RoadmapPage or ChatPage)
  → POST /api/v1/progress/module/complete
       { subject_id: "uuid", module_number: 1 }

Backend
  → Check if Progress record exists for (user_id, subject_id, module=1)
  → If not: INSERT new record
  → UPDATE progress SET is_completed=True, completed_at=now
  → Check: are ALL 5 modules now completed for this subject?
      → If yes: UPDATE subjects SET is_completed=True
  → Award 50 XP: roadmap_agent.award_xp("complete_module")
  → Recalculate level
  → Check badges (module-count badges, subject_complete)
  → Return { xp_earned: 50, new_xp, level, leveled_up }

Frontend
  → Show XP toast
  → Update roadmap (module node turns green)
  → If leveled_up: show level-up banner
```

---

## 7. Fantasy Map Generation

```
Frontend (MapLobbyPage or ModuleMapPage)
  → GET /mapgraph/{subject_id}/{module_number}

Backend
  → Check Redis: "mapgraph:{subject_id}:{module}"
  → CACHE HIT: return stored layout

  → CACHE MISS:
      → Load topics + subtopics from syllabus_loader
      → Call groq_map_placer.generate_map_layout(topics, subtopics)
          → Prompt Groq: "Design a fantasy map with capital/cities/villages"
          → Returns JSON: { capital, cities, villages, roads }
          → FALLBACK if Groq fails: deterministic spiral layout
      → Determine selected_map: (module_number - 1) % 6 + 1 → "map3"
          (or use stored preference from module_images table)
      → Cache result in Redis for 24 hours
  → Return { layout, selected_map, map_image: "/maps/map3.jpg" }

Frontend (GameMap.tsx)
  → Render SVG with capital (large node), cities (medium), villages (small)
  → Draw roads as SVG lines
  → Clicking a node → navigate to chat with that topic
```
