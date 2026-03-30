import axios from "axios";
import { API_URL } from "./env";

const api = axios.create({
  baseURL: API_URL,
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("sarvagna_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401 → clear token and redirect to login
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("sarvagna_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;

// ─── Auth ────────────────────────────────────────────────────────────────────

export const authApi = {
  register: (email: string, name: string, password: string) =>
    api.post<{ access_token: string }>("/auth/register", { email, name, password }),

  login: (email: string, password: string) =>
    api.post<{ access_token: string }>("/auth/login", { email, password }),

  me: () =>
    api.get<{
      id: string;
      email: string;
      name: string;
      xp: number;
      level: number;
      streak: number;
      created_at: string;
    }>("/auth/me"),
};

// ─── Subjects ────────────────────────────────────────────────────────────────

export interface Subject {
  id: string;
  name: string;
  branch: string;
  semester: number;
  modules_scraped: number;
  is_completed: boolean;
  added_at: string;
}

export const subjectsApi = {
  list: () => api.get<Subject[]>("/subjects"),

  add: (name: string, branch: string, semester: number) =>
    api.post<Subject>("/subjects/add", { name, branch, semester }),

  remove: (id: string) => api.delete(`/subjects/${id}`),

  scrape: (id: string) =>
    api.post<{ task_id: string; message: string }>(`/subjects/${id}/scrape`),

  catalog: (branch: string, semester: number) =>
    api.get<{ branch: string; semester: number; subjects: string[] }>(
      `/subjects/catalog?branch=${encodeURIComponent(branch)}&semester=${semester}`
    ),
};

// ─── Query ───────────────────────────────────────────────────────────────────

export interface QueryResponse {
  exact_answer: string;
  simplified_answer: string;
  real_world_example: string;
  xp_earned: number;
  new_xp: number;
  level: number;
  level_name: string;
  leveled_up: boolean;
  badges_unlocked: string[];
  cached: boolean;
}

export interface QueryHistoryItem {
  id: string;
  question: string;
  exact_answer: string | null;
  simplified_answer: string | null;
  real_world_example: string | null;
  subject_name: string;
  created_at: string;
}

export const queryApi = {
  ask: (question: string, subject_id: string) =>
    api.post<QueryResponse>("/query", { question, subject_id }),

  history: () => api.get<QueryHistoryItem[]>("/query/history"),
};

// ─── Progress ────────────────────────────────────────────────────────────────

export interface Badge {
  id: string;
  name: string;
  condition: string;
}

export interface ProgressOverview {
  user_id: string;
  xp: number;
  level: number;
  level_name: string;
  xp_to_next_level: number | null;
  streak: number;
  badges: Badge[];
}

export interface ModuleNode {
  module_number: number;
  is_completed: boolean;
  completed_at: string | null;
}

export interface RoadmapResponse {
  subject_id: string;
  subject_name: string;
  total_modules: number;
  completed_modules: number;
  completion_percentage: number;
  modules: ModuleNode[];
}

export interface CompleteModuleResponse {
  xp_earned: number;
  new_xp: number;
  level: number;
  level_name: string;
  leveled_up: boolean;
  module_number: number;
  subject_id: string;
}

export const progressApi = {
  overview: () => api.get<ProgressOverview>("/progress"),

  roadmap: (subject_id: string) =>
    api.get<RoadmapResponse>(`/progress/roadmap/${subject_id}`),

  completeModule: (subject_id: string, module_number: number) =>
    api.post<CompleteModuleResponse>("/progress/module/complete", {
      subject_id,
      module_number,
    }),
};

// ─── Map ──────────────────────────────────────────────────────────────────────

export interface MapModuleNode {
  module_number: number;
  title: string;
  status: "completed" | "current" | "locked";
  xp: number;
  completion_date: string | null;
  connections: { from: number; to: number; type: string }[];
}

export interface MapResponse {
  subject_id: string;
  subject_name: string;
  total_modules: number;
  completed_modules: number;
  completion_percentage: number;
  modules: MapModuleNode[];
}

export const mapApi = {
  getMap: (subject_id: string) =>
    api.get<MapResponse>(`/map/${subject_id}`),
};

// ─── Module Map ─────────────────────────────────────────────────────────────────────
export type ModuleMapStatus = "completed" | "current" | "locked";

export interface ModuleMapSubtopic {
  id: string;
  title: string;
  status: ModuleMapStatus;
}

export interface ModuleMapTopic {
  id: string;
  title: string;
  status: ModuleMapStatus;
  subtopics: ModuleMapSubtopic[];
}

export interface ModuleMapResponse {
  subject_id: string;
  subject_name: string;
  module_number: number;
  module_title: string;
  topics: ModuleMapTopic[];
}

export const modulemapApi = {
  getModuleMap: (subject_id: string, module_number: number) =>
    api.get<ModuleMapResponse>(`/modulemap/${subject_id}/${module_number}`),
};

// ─── Map Selection ────────────────────────────────────────────────────────────

export interface MapSelectionResponse {
  subject_id: string;
  module_number: number;
  selected_map: string;
}

export const mapSelectionApi = {
  getSelectedMap: (subject_id: string, module_number: number) =>
    api.get<MapSelectionResponse>(`/mapselection/${subject_id}/${module_number}`),

  saveSelectedMap: (subject_id: string, module_number: number, map_id: string) =>
    api.post<MapSelectionResponse>(`/mapselection/${subject_id}/${module_number}`, { map_id }),
};

// ─── Map Graph (Groq layout) ──────────────────────────────────────────────────

export interface MapGraphNode {
  id: string;
  title: string;
  x: number;
  y: number;
  type: "capital" | "city" | "village";
  parent?: string;
}

export interface MapGraphRoad {
  from: string;
  to: string;
  type: "river" | "path" | "dotted";
}

export interface MapGraphLayout {
  capital: MapGraphNode;
  cities: MapGraphNode[];
  villages: MapGraphNode[];
  roads: MapGraphRoad[];
}

export interface MapGraphResponse {
  layout: MapGraphLayout;
  selected_map: string;
  map_image: string;
}

export const mapGraphApi = {
  getMapGraph: (subject_id: string, module_number: number) =>
    api.get<MapGraphResponse>(`/mapgraph/${subject_id}/${module_number}`),
};

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface ChatHistoryResponse {
  subject_id: string;
  module_number: number;
  messages: ChatMessage[];
  total: number;
  page: number;
}

export interface SendMessageResponse {
  user_message: ChatMessage;
  ai_message: ChatMessage;
}

export const chatApi = {
  getHistory: (subject_id: string, module_number: number, page = 1) =>
    api.get<ChatHistoryResponse>(`/chat/${subject_id}/${module_number}?page=${page}`),

  sendMessage: (subject_id: string, module_number: number, content: string) =>
    api.post<SendMessageResponse>(`/chat/${subject_id}/${module_number}`, { content }),
};

// ─── Important Questions ───────────────────────────────────────────────────

export interface ImportantQuestion {
  id: string;
  question: string;
  module_number: number;
  created_at: string;
}

export const importantQuestionsApi = {
  upload: (subject_id: string, text: string, module_number = 0) =>
    api.post<{ count: number; questions: string[] }>(`/important-questions/${subject_id}`, {
      text,
      module_number,
    }),

  list: (subject_id: string) =>
    api.get<ImportantQuestion[]>(`/important-questions/${subject_id}`),

  delete: (subject_id: string, question_id: string) =>
    api.delete(`/important-questions/${subject_id}/${question_id}`),
};
