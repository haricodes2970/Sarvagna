# Frontend

React single-page app for the Sarvagna student interface.

---

## Tech Stack

| Library | Purpose |
|---------|---------|
| React 19 | UI framework |
| TypeScript | Type safety |
| Vite | Build tool + dev server |
| React Router v6 | Client-side routing |
| TanStack Query (React Query) | Server state, caching, polling |
| Zustand | Auth state (persisted to localStorage) |
| Axios | HTTP client |
| Tailwind CSS | Styling |
| Framer Motion | Animations |
| ReactMarkdown | Render AI markdown responses |
| Mermaid.js | Diagram rendering (fallback for any mermaid code blocks) |
| Lucide React | Icons |
| react-hot-toast | Toast notifications |

---

## File: `frontend/src/`

---

## Routing (`App.tsx`)

```
/login                          → LoginPage (public)
/dashboard                      → DashboardPage (auth required)
/subject/:id                    → SubjectPage
/roadmap/:subject_id            → RoadmapPage
/progress                       → ProgressPage
/map/:subjectId                 → MapPage
/lobby/:subjectId/:moduleNumber → MapLobbyPage
/modulemap/:subjectId/:moduleNumber → ModuleMapPage
/chat/:subjectId/:moduleNumber  → ChatPage
/important-questions/:subjectId → ImportantQuestionsPage
```

Auth guard: if no token in localStorage → redirect to `/login`.

---

## Pages

### `LoginPage.tsx`
- Email + password login/register toggle
- Google OAuth button → redirects to `{API_URL}/auth/google`
- On success: stores token in Zustand + localStorage, navigates to `/dashboard`

---

### `DashboardPage.tsx`
The main hub. Shows all subjects and lets students manage them.

**Features:**
- Subject cards with scraping status banner
- Add subject form with **Scheme → Branch → Semester → Subject** dropdowns
  - Scheme/Branch/Semester are static dropdowns
  - Subject list fetched from `GET /subjects/catalog?branch=AIML&semester=6`
- Each subject card has two buttons:
  - 💬 **Main Chat** → `/chat/{id}/0` (module 0 = full-subject)
  - 📝 **Important Questions** → `/important-questions/{id}`
- Delete subject button

**Scraping banner polling:**
Polls `GET /subjects` every 8 seconds while any subject has `modules_scraped < 5`.
Stops polling when all subjects reach 5.

---

### `ChatPage.tsx`
The main teaching interface.

**URL:** `/chat/:subjectId/:moduleNumber?topicTitle=<encoded>`

**Features:**
- **Auto-send**: If `topicTitle` is in URL params, automatically sends "Teach me this topic: {topicTitle}" on page load, even if chat history exists
- **Scrape status banner:**
  - Amber (pulsing): "Scraping content… X/5 modules done — AI will teach from general knowledge"
  - Green: "Textbook content ready — X/5 modules scraped"
  - Banner disappears when module is fully scraped
- **Markdown rendering**: ReactMarkdown with custom code block handler
  - ASCII diagrams in `code` blocks render with monospace font
  - Mermaid code blocks render via `MermaidDiagram` component
- **Image rendering**: Parses `<!-- SARVAGNA_IMAGES -->` block from AI response, renders images in 2-column grid below the text
- Chat messages paginated (20 per page)
- Enter to send, Shift+Enter for new line

---

### `ImportantQuestionsPage.tsx`
Upload and manage professor's important questions.

**Features:**
- Textarea for bulk paste (numbered list, bullets, or plain)
- Module selector dropdown (All / Module 1–5)
- **Save Questions** → POST to `/important-questions/{subject_id}`
  - Backend parses numbered questions correctly (multi-line questions joined)
- Questions listed grouped by module
- Each question has:
  - **Study This** button → navigates to `/chat/{subjectId}/{module}?topicTitle={question}`
  - 🗑️ **Delete** button (red trash icon) → DELETE `/important-questions/{subject_id}/{question_id}`

---

### `MapPage.tsx` / `MapLobbyPage.tsx` / `ModuleMapPage.tsx`
Fantasy game map for navigating modules and topics.

- `MapPage`: Shows module nodes (completed/current/locked) with edges
- `MapLobbyPage`: Entry screen for a specific module, shows fantasy map image
- `ModuleMapPage`: Shows topic hierarchy within a module, clickable topics → navigate to chat with `topicTitle`

---

### `ProgressPage.tsx`
- Level name + XP bar
- Streak count
- Badges grid (earned badges highlighted)

---

### `RoadmapPage.tsx`
- Module list with completion checkmarks
- "Mark as Done" button for current module
- Progress percentage

---

## State Management

### Zustand Auth Store (`store/authStore.ts`)

```typescript
{
  token: string | null        // JWT
  user: {
    id, email, name, xp, level, streak
  } | null
  setToken(token): void
  setUser(user): void
  logout(): void              // clears both + localStorage
}
```

Persisted to `localStorage` using Zustand's persist middleware (token only).

---

## API Client (`lib/api.ts`)

Single Axios instance:
```typescript
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL  // from .env
})
```

**Request interceptor:** attaches `Authorization: Bearer {token}` header.
**Response interceptor:** on 401 → `logout()` + redirect to `/login`.

### API groups:

```typescript
authApi.register(email, name, password)
authApi.login(email, password)
authApi.me()

subjectsApi.list()
subjectsApi.add(name, branch, semester)
subjectsApi.remove(id)
subjectsApi.scrape(id)
subjectsApi.catalog(branch, semester)

chatApi.getHistory(subjectId, moduleNumber, page)
chatApi.sendMessage(subjectId, moduleNumber, content)

queryApi.ask(question, subject_id)
queryApi.history()

progressApi.overview()
progressApi.roadmap(subject_id)
progressApi.completeModule(subject_id, module_number)

mapApi.getMap(subject_id)
modulemapApi.getModuleMap(subject_id, module_number)
mapGraphApi.getMapGraph(subject_id, module_number)
mapSelectionApi.getSelectedMap(subject_id, module_number)
mapSelectionApi.saveSelectedMap(subject_id, module_number, map_id)

importantQuestionsApi.upload(subject_id, text, module_number)
importantQuestionsApi.list(subject_id)
importantQuestionsApi.delete(subject_id, question_id)
```

---

## Key Components

### `MermaidDiagram.tsx`
Renders mermaid diagram code blocks. Validates syntax before rendering to avoid error bombs. Falls back to plain code block on parse error. Cleans up any orphan DOM nodes mermaid injects.

### `GameMap.tsx`
Interactive SVG-based game map renderer for modules. Renders nodes + edges with completion status colors.

### `ModuleNode.tsx`
Individual map node. Handles completed/current/locked visual states.

### `SubjectSlotBar.tsx`
Shows subject slot usage (X/10 used) on dashboard.

### `XPToast.tsx`
Animated toast shown when XP is earned or level-up happens.

---

## Environment Variables

```bash
# frontend/.env
VITE_API_URL=http://localhost:8000/api/v1
```

For production:
```bash
VITE_API_URL=https://your-backend.railway.app/api/v1
```
