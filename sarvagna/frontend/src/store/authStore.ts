import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  xp: number;
  level: number;
  streak: number;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  setUser: (user: AuthUser) => void;
  setToken: (token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,

      setUser: (user) => set({ user }),

      setToken: (token) => {
        localStorage.setItem("sarvagna_token", token);
        set({ token });
      },

      logout: () => {
        localStorage.removeItem("sarvagna_token");
        set({ user: null, token: null });
      },
    }),
    {
      name: "sarvagna_auth",
      // Only persist token; user is re-fetched on load
      partialize: (state) => ({ token: state.token }),
    }
  )
);
