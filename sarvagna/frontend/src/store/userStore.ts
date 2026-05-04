import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UserInfo = {
  id: number | null;
  email: string;
  name: string;
  branch: string;
  semester: number;
  level: number;
  xp: number;
  streak: number;
};

export type Subject = {
  id: string;
  name: string;
  currentModule: string;
  modulesCompleted: number;
  streak: number;
};

type ProgressData = {
  xp: number;
  level: number;
  streak_days: number;
  badges: string[];
};

type UserStoreState = {
  user: UserInfo;
  subjects: Subject[];
  currentSubject: Subject | null;
  badges: string[];
  isAuthenticated: boolean;

  setUser: (user: Partial<UserInfo> & { id: number; email: string; name: string }) => void;
  setSubjects: (subjects: Subject[]) => void;
  setProgress: (progress: ProgressData) => void;
  setCurrentSubject: (subject: Subject | null) => void;
  addXP: (amount: number, newLevel: number) => void;
  addBadge: (badge: string) => void;
  logout: () => void;
};

const DEFAULT_USER: UserInfo = {
  id: null,
  email: "",
  name: "",
  branch: "",
  semester: 0,
  level: 1,
  xp: 0,
  streak: 0,
};

export const useUserStore = create<UserStoreState>()(
  persist(
    (set, get) => ({
      user: DEFAULT_USER,
      subjects: [],
      currentSubject: null,
      badges: [],
      isAuthenticated: false,

      setUser: (userInfo) =>
        set((s) => ({
          user: { ...s.user, ...userInfo },
          isAuthenticated: true,
        })),

      setSubjects: (subjects) => set({ subjects }),

      setProgress: (progress) =>
        set((s) => ({
          user: {
            ...s.user,
            xp: progress.xp,
            level: progress.level,
            streak: progress.streak_days,
          },
          badges: progress.badges,
        })),

      setCurrentSubject: (subject) => set({ currentSubject: subject }),

      addXP: (amount, newLevel) =>
        set((s) => ({
          user: { ...s.user, xp: s.user.xp + amount, level: newLevel },
        })),

      addBadge: (badge) => {
        const badges = get().badges;
        if (badges.includes(badge)) return;
        set({ badges: [...badges, badge] });
      },

      logout: () => {
        localStorage.removeItem("sarvagna_token");
        set({
          user: DEFAULT_USER,
          subjects: [],
          currentSubject: null,
          badges: [],
          isAuthenticated: false,
        });
      },
    }),
    {
      name: "sarvagna-user-store",
      partialize: (s) => ({
        user: s.user,
        subjects: s.subjects,
        currentSubject: s.currentSubject,
        badges: s.badges,
        isAuthenticated: s.isAuthenticated,
      }),
    }
  )
);
