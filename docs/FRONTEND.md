# Frontend

The frontend is a React SPA built with Vite. It uses React Router for navigation, TanStack Query for server state, and Zustand for auth state.

## Routing
Routes are defined in src/App.tsx.
- /login: LoginPage
- /dashboard: DashboardPage (auth required)
- /subject/:id: SubjectPage (auth required)
- /roadmap/:subject_id: RoadmapPage (auth required)
- /progress: ProgressPage (auth required)

## Pages
LoginPage:
- Email and password login.
- Register flow toggled by UI.
- Google OAuth redirect uses VITE_API_URL/auth/google.

DashboardPage:
- Lists active subjects.
- Add subject form.
- Remove subject.
- Links to Subject and Roadmap pages.

SubjectPage:
- Ask questions and view answers in three tabs.
- Shows XP, badges, and level up toasts.
- Trigger scraping for the next module.

RoadmapPage:
- Visual module roadmap with completion status.
- Progress header and completion CTA.
- Uses progressApi.roadmap and progressApi.completeModule.

ProgressPage:
- Displays level, XP progress, streak, and badges.

## State Management
- React Query handles API data fetching and caching.
- Zustand store holds auth token and user profile.
- Token is persisted in localStorage and attached to axios requests.

## API Client
src/lib/api.ts:
- Axios instance with baseURL from VITE_API_URL.
- Attaches Authorization header from localStorage.
- On 401, clears token and redirects to /login.
