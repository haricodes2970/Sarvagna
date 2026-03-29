import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { authApi } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { API_URL } from "../lib/env";

export default function LoginPage() {
  const navigate = useNavigate();
  const { setToken, setUser } = useAuthStore();

  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", password: "" });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = isRegister
        ? await authApi.register(form.email, form.name, form.password)
        : await authApi.login(form.email, form.password);

      const token = res.data.access_token;
      setToken(token);

      // Fetch profile immediately after login
      const profile = await authApi.me();
      setUser(profile.data);

      toast.success(isRegister ? "Account created!" : "Welcome back!");
      navigate("/dashboard");
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = `${API_URL}/auth/google`;
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Sarvagna</h1>
        <p style={styles.subtitle}>Your AI-powered study companion</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          {isRegister && (
            <input
              style={styles.input}
              name="name"
              placeholder="Full name"
              value={form.name}
              onChange={handleChange}
              required
            />
          )}
          <input
            style={styles.input}
            name="email"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={handleChange}
            required
          />
          <input
            style={styles.input}
            name="password"
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={handleChange}
            required
          />
          <button style={styles.btn} type="submit" disabled={loading}>
            {loading ? "Please wait…" : isRegister ? "Create Account" : "Login"}
          </button>
        </form>

        <button style={styles.googleBtn} onClick={handleGoogleLogin}>
          Continue with Google
        </button>

        <p style={styles.toggle}>
          {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
          <span style={styles.link} onClick={() => setIsRegister((v) => !v)}>
            {isRegister ? "Login" : "Register"}
          </span>
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f0f1a",
  },
  card: {
    background: "#1a1a2e",
    borderRadius: 16,
    padding: "2.5rem",
    width: "100%",
    maxWidth: 400,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  },
  title: { color: "#a78bfa", fontSize: "2rem", margin: 0, textAlign: "center" },
  subtitle: { color: "#6b7280", textAlign: "center", marginBottom: "1.5rem" },
  form: { display: "flex", flexDirection: "column", gap: "0.75rem" },
  input: {
    padding: "0.75rem 1rem",
    borderRadius: 8,
    border: "1px solid #374151",
    background: "#0f0f1a",
    color: "#f3f4f6",
    fontSize: "1rem",
    outline: "none",
  },
  btn: {
    padding: "0.75rem",
    borderRadius: 8,
    border: "none",
    background: "#7c3aed",
    color: "#fff",
    fontWeight: 600,
    fontSize: "1rem",
    cursor: "pointer",
    marginTop: "0.25rem",
  },
  googleBtn: {
    width: "100%",
    padding: "0.75rem",
    borderRadius: 8,
    border: "1px solid #374151",
    background: "transparent",
    color: "#d1d5db",
    fontSize: "1rem",
    cursor: "pointer",
    marginTop: "0.75rem",
  },
  toggle: { color: "#6b7280", textAlign: "center", marginTop: "1rem" },
  link: { color: "#a78bfa", cursor: "pointer" },
};
