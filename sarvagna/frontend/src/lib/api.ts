import axios, { type AxiosInstance } from "axios";

const API_PREFIX = "";

const ACTION_XP_MAP: Record<string, number> = {
  view_topic: 5,
  complete_module: 50,
  daily_login: 10,
  ask_question: 8,
  seven_day_streak: 100,
};

export type User = {
  id: number;
  email: string;
  name: string;
  branch: string;
  semester: number;
};

export type Subject = {
  id: number;
  code: string;
  name: string;
  branch: string;
  semester: number;
  status: string;
  slot_position: number | null;
};

export type Progress = {
  xp: number;
  level: number;
  streak_days: number;
  badges: string[];
};

export type XPResult = {
  new_xp: number;
  new_level: number;
  leveled_up: boolean;
  new_badges: string[];
};

export type SubjectCreateData = {
  code: string;
  name: string;
  branch: string;
  semester: number;
};

export const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:8080",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("sarvagna_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem("sarvagna_token");
      const path = globalThis.location?.pathname ?? "";
      if (!path.startsWith("/login")) {
        globalThis.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export const auth = {
  login: async (email: string, password: string) => {
    const res = await api.post<{ access_token: string }>(`${API_PREFIX}/auth/login`, { email, password });
    return res.data;
  },

  register: async (email: string, password: string, name: string, branch: string, semester: number) => {
    const res = await api.post<{ access_token: string }>(`${API_PREFIX}/auth/register`, {
      email,
      password,
      name,
      branch,
      semester,
    });
    return res.data;
  },

  me: async () => {
    const res = await api.get<User>(`${API_PREFIX}/auth/me`);
    return res.data;
  },
};

export const subjects = {
  list: async () => {
    const res = await api.get<Subject[]>(`${API_PREFIX}/subjects`);
    return res.data;
  },

  add: async (data: SubjectCreateData) => {
    const res = await api.post<Subject>(`${API_PREFIX}/subjects`, data);
    return res.data;
  },

  remove: async (id: number) => {
    await api.delete(`${API_PREFIX}/subjects/${id}`);
  },
};

export const progress = {
  get: async () => {
    const res = await api.get<Progress>(`${API_PREFIX}/progress`);
    return res.data;
  },

  // Backend expects { amount, action? }.
  // We map known action keys to XP amounts (mirrors backend ACTION_XP_MAP intent).
  addXP: async (action: string) => {
    const amount = ACTION_XP_MAP[action] ?? 0;
    const res = await api.post<XPResult>(`${API_PREFIX}/progress/xp`, { amount, action });
    return res.data;
  },
};
