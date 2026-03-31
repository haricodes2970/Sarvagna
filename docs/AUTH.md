# Authentication

How Sarvagna handles user identity, tokens, and sessions.

---

## Overview

Sarvagna uses **JWT (JSON Web Tokens)** for authentication. No server-side sessions.

```
Register/Login → Server returns JWT → Frontend stores in localStorage
Every API request → "Authorization: Bearer <token>" header
Server validates token → extracts user_id → fetches user from DB
```

---

## File: `backend/api/routes/auth.py`

---

## Email/Password Auth

### Registration

```python
POST /api/v1/auth/register
{ "email": "...", "name": "...", "password": "..." }
```

1. Check if email already exists in DB
2. Hash password with **bcrypt**
3. Store as `User.google_id = f"local:{bcrypt_hash}"` (password is stored in the google_id column — a design quirk that works)
4. Create user with `xp=0, level=1, streak=0`
5. Generate JWT, return it

### Login

```python
POST /api/v1/auth/login
{ "email": "...", "password": "..." }
```

1. Fetch user by email
2. Extract hash from `google_id` (split on `local:`)
3. Verify with `bcrypt.checkpw()`
4. If valid: generate and return JWT

---

## Google OAuth

### Flow

```
1. Frontend: GET /api/v1/auth/google
   → Backend redirects to Google OAuth consent screen

2. Student logs in with Google

3. Google redirects to: GET /api/v1/auth/google/callback?code=<code>
   → Backend exchanges code for access token
   → Backend fetches userinfo from Google (email, name, sub)
   → Upserts user: create if new, update name if existing
   → Generates JWT, returns it
```

### Config required in .env:
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/google/callback
```

---

## JWT Tokens

```python
import jwt

SECRET_KEY = settings.SECRET_KEY  # from .env
ALGORITHM = "HS256"
EXPIRY = 30 days

# Token payload:
{
  "sub": "<user_uuid>",  # subject = user ID
  "exp": <unix_timestamp>
}
```

Token is signed with SECRET_KEY. Tampering invalidates the signature.

---

## Token Validation (every protected route)

```python
async def current_user_dep(
  credentials: HTTPAuthorizationCredentials = Depends(bearer),
  db: AsyncSession = Depends(get_db)
) -> User:
  token = credentials.credentials
  payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
  user_id = payload["sub"]
  user = await db.execute(select(User).where(User.id == uuid(user_id)))
  if not user:
    raise HTTPException(401, "User not found")
  return user
```

All protected routes use `Depends(current_user_dep)`.

---

## Frontend Token Handling

**Storage:** `localStorage` (not a cookie — no CSRF risk, but XSS risk if any)

**Zustand auth store** (`src/store/authStore.ts`):
```typescript
interface AuthState {
  user: AuthUser | null
  token: string | null
  setUser(user: AuthUser): void
  setToken(token: string): void
  logout(): void  // clears user + token + localStorage
}
```

**Axios interceptor** (`src/lib/api.ts`):
```typescript
// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token")
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On 401: clear token + redirect to /login
api.interceptors.response.use(null, (error) => {
  if (error.response?.status === 401) {
    localStorage.removeItem("token")
    window.location.href = "/login"
  }
  return Promise.reject(error)
})
```

---

## Auth Guard (Frontend)

Routes in `App.tsx` check for token before rendering:

```tsx
function ProtectedRoute({ children }) {
  const token = useAuthStore(s => s.token)
  if (!token) return <Navigate to="/login" />
  return children
}
```

On app load, if token exists, `GET /auth/me` is called to restore user profile.

---

## Security Notes

| Topic | Status |
|-------|--------|
| Password hashing | bcrypt ✅ |
| JWT signing | HS256 with SECRET_KEY ✅ |
| HTTPS | Required in production (set HTTPS on Railway/Vercel) |
| Token expiry | 30 days |
| Password column | Stored in `google_id` column — works but should be a dedicated `password_hash` column eventually |
| Token refresh | Not implemented — on expiry, user must log in again |
