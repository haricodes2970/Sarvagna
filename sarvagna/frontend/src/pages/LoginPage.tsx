import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Lock, Mail, User } from "lucide-react";

import { auth, progress } from "../lib/api";
import { useUserStore } from "../store/userStore";

export default function LoginPage() {
  const navigate = useNavigate();
  const { setUser } = useUserStore();

  const [mode, setMode] = useState<"login" | "register">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [semester, setSemester] = useState<number>(1);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const title = useMemo(() => (mode === "login" ? "Welcome back" : "Create your account"), [mode]);

  const setProgress = useUserStore((s) => s.setProgress);

  const syncProgressIntoStore = async () => {
    try {
      const p = await progress.get();
      setProgress({
        xp: p.xp,
        level: p.level,
        streak_days: p.streak_days,
        badges: Array.isArray(p.badges) ? p.badges : [],
      });
    } catch {
      // Progress is optional for login UX; ignore if missing.
    }
  };

  const handleLogin = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const { access_token } = await auth.login(email.trim(), password);
      localStorage.setItem("sarvagna_token", access_token);

      const me = await auth.me();
      setUser(me);
      await syncProgressIntoStore();

      navigate("/dashboard");
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? String((e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail ?? "Login failed")
          : "Login failed";
      setError(msg);
      setToast(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const { access_token } = await auth.register(email.trim(), password, name.trim(), branch.trim(), semester);
      localStorage.setItem("sarvagna_token", access_token);

      const me = await auth.me();
      setUser(me);
      await syncProgressIntoStore();

      navigate("/dashboard");
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? String((e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail ?? "Registration failed")
          : "Registration failed";
      setError(msg);
      setToast(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-4">
      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-50 w-[min(520px,calc(100vw-2rem))] -translate-x-1/2">
          <div className="rounded-2xl border border-red-500/30 bg-red-950/80 px-4 py-3 text-sm text-red-100 shadow-lg backdrop-blur-md">
            {toast}
          </div>
        </div>
      ) : null}

      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950/70 backdrop-blur-md shadow-[0_0_0_1px_rgba(255,255,255,0.03)] p-8">
          <div className="text-center mb-8">
            <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10">
              <BookOpen className="h-6 w-6 text-amber-400" />
            </div>
            <h1 className="text-4xl font-black tracking-tight">Sarvagna</h1>
            <p className="mt-2 text-sm text-zinc-400">The one who knows everything</p>
          </div>

          <div className="mb-6 flex items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-black/30 p-1">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${
                mode === "login" ? "bg-zinc-900 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
              }}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold transition ${
                mode === "register" ? "bg-zinc-900 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Register
            </button>
          </div>

          <div className="mb-6">
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="mt-1 text-xs text-zinc-500">
              {mode === "login" ? "Sign in to continue your journey." : "Create an account to start learning."}
            </p>
          </div>

          {error ? (
            <div
              role="status"
              className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
            >
              {error}
            </div>
          ) : null}

          <div className="space-y-4">
            {mode === "register" ? (
              <>
                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Name</span>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-2xl border border-zinc-800 bg-black/40 py-3 pl-10 pr-4 text-sm text-zinc-100 outline-none ring-0 placeholder:text-zinc-600 focus:border-amber-500/60"
                      placeholder="Your name"
                      autoComplete="name"
                    />
                  </div>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Branch</span>
                    <input
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      className="w-full rounded-2xl border border-zinc-800 bg-black/40 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-amber-500/60"
                      placeholder="AIML"
                      autoComplete="off"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Semester</span>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={semester}
                      onChange={(e) => setSemester(Number(e.target.value))}
                      className="w-full rounded-2xl border border-zinc-800 bg-black/40 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-amber-500/60"
                    />
                  </label>
                </div>

              </>
            ) : null}

            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Email</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-zinc-800 bg-black/40 py-3 pl-10 pr-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-500/60"
                  placeholder="you@university.edu"
                  autoComplete="email"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500">Password</span>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-zinc-800 bg-black/40 py-3 pl-10 pr-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-500/60"
                  placeholder="••••••••"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
              </div>
            </label>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                if (mode === "login") void handleLogin();
                else void handleRegister();
              }}
              className="mt-2 w-full rounded-2xl bg-amber-500 px-4 py-3 text-sm font-black text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Please wait…" : mode === "login" ? "Login" : "Create account"}
            </button>
          </div>

          <p className="mt-6 text-center text-[11px] text-zinc-600">
            By continuing, you agree this is a learning companion — not a replacement for your coursework judgment.
          </p>
        </div>
      </div>
    </div>
  );
}
