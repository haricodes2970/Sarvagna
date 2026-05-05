import { api as axiosInstance } from "../lib/api";

export type FlashcardOut = {
  id: number;
  front: string;
  back: string;
  topic: string;
  subject_id: number | null;
  easiness_factor: number;
  interval: number;
  repetitions: number;
  next_review_date: string;
  created_at: string;
};

export type QuizQuestion = {
  id: string;
  type: 'MCQ' | 'BLANK' | 'SHORT';
  question: string;
  options: string[];
  correct_answer: string;
  explanation: string;
};

export type QuizAnswer = {
  question_id: string;
  user_answer: string;
  is_correct: boolean;
};

export type QuizResult = {
  session_id: number;
  score: number;
  total: number;
  percentage: number;
  xp_awarded: number;
  mastery_badge: boolean;
  new_badges: string[];
};

export type AnalyticsDashboard = {
  mastery: Array<{
    subject_id: number;
    subject_name: string;
    roadmap_pct: number;
    quiz_pct: number;
    srs_pct: number;
    mastery_score: number;
  }>;
  heatmap: Array<{ topic: string; score_pct: number; quiz_count: number; color: string }>;
  weak_areas: Array<{ topic: string; score_pct: number; quiz_count: number; color: string }>;
  srs_due: number;
  progress: { xp: number; level: number; streak_days: number; badges: string[] };
};

export type QuizSessionSummary = {
  id: number;
  topic: string;
  subject_id: number | null;
  score: number | null;
  total: number;
  percentage: number;
  xp_awarded: number;
  mastery_badge: boolean;
  completed_at: string | null;
  created_at: string;
};

export type SourceChunk = {
  filename: string;
  page: string | number;
  section: string;
  score: number;
};

export type TutorReply = {
  session_id: number;
  exact: string;
  simple: string;
  example: string;
  checkpoint: string;
  spoken_text: string;
  checkpoint_validated: boolean | null;
  sources: SourceChunk[];
};

export type SessionSummary = {
  id: number;
  topic: string;
  subject_id: number | null;
  message_count: number;
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ModuleStatus = {
  module_number: number;
  title: string;
  status: string;
  topics: string[];
  xp_earned: number;
  unlocked_at: string | null;
};

export type RoadmapModule = {
  id: number;
  module_number: number;
  title: string;
  sections: string[];
  core_concepts: string[];
  estimated_minutes: number;
  yield_score: "high" | "medium" | "low";
  is_core: boolean;
  generated_at: string;
};

const api = {
  getSubjects: async () => {
    const res = await axiosInstance.get("/subjects");
    return res.data;
  },

  postSubject: async (data: { name: string; subject: string; branch: string; semester: string }) => {
    const res = await axiosInstance.post("/subjects", {
      name: data.name,
      code: data.subject || undefined,
      branch: data.branch || undefined,
      semester: data.semester ? parseInt(data.semester) : undefined,
    });
    return res.data;
  },

  deleteSubject: async (id: string | number) => {
    await axiosInstance.delete(`/subjects/${id}`);
  },

  getProgress: async () => {
    const res = await axiosInstance.get("/progress");
    return res.data;
  },

  postQuery: async (data: {
    subjectId?: number | null;
    query: string;
    actionType?: string;
  }) => {
    const res = await axiosInstance.post("/query", {
      question: data.query,
      subject_id: data.subjectId,
      action_type: data.actionType ?? "ask",
    });
    return {
      response:
        res.data?.data?.simplified_answer ??
        res.data?.data?.exact_answer ??
        JSON.stringify(res.data?.data ?? res.data),
      moduleCompleted: false,
    };
  },

  getRoadmap: async (subjectId: number): Promise<ModuleStatus[]> => {
    const res = await axiosInstance.post("/query/roadmap", {
      subject_id: subjectId,
    });
    return res.data;
  },

  uploadFile: async (file: File, subjectId?: number) => {
    const form = new FormData();
    form.append("file", file);
    if (subjectId != null) form.append("subject_id", String(subjectId));
    const res = await axiosInstance.post("/upload/pdf", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data as { filename: string; chunk_count: number; status: string };
  },

  uploadUrl: async (url: string, subjectId?: number) => {
    const res = await axiosInstance.post("/upload/url", { url, subject_id: subjectId ?? null });
    return res.data as { filename: string; chunk_count: number; status: string };
  },

  getUploadedFiles: async () => {
    const res = await axiosInstance.get("/upload/files");
    return res.data as Array<{
      id: number;
      filename: string;
      file_type: string;
      chunk_count: number;
      subject_id: number | null;
      storage_url: string | null;
      created_at: string;
    }>;
  },

  deleteUploadedFile: async (fileId: number) => {
    await axiosInstance.delete(`/upload/files/${fileId}`);
  },

  scrapeLinks: async (url: string): Promise<Array<{ title: string; url: string }>> => {
    const res = await axiosInstance.get("/upload/scrape-links", { params: { url } });
    return res.data;
  },

  confirmSelection: async (url: string, subjectId?: number) => {
    const res = await axiosInstance.post("/upload/confirm-selection", {
      url,
      subject_id: subjectId ?? null,
    });
    return res.data as { filename: string; chunk_count: number; status: string };
  },

  analyzeQP: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await axiosInstance.post("/qp/analyze", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data as {
      questions: Array<{ question: string; marks: number; topic: string; unit: string }>;
      repeated_topics: Array<{ topic: string; frequency: number }>;
      high_weightage: string[];
      predictions: string[];
    };
  },

  savePredictions: async (body: {
    topics: string[];
    subject_id?: number;
    source_filename?: string;
  }) => {
    const res = await axiosInstance.post("/qp/predictions", body);
    return res.data as { id: number; topic_count: number; status: string };
  },

  generateRoadmap: async (subjectId: number, subjectName: string) => {
    const res = await axiosInstance.post("/roadmap/generate", {
      subject_id: subjectId,
      subject_name: subjectName,
    });
    return res.data as RoadmapModule[];
  },

  getRoadmapEntries: async (subjectId: number) => {
    const res = await axiosInstance.get(`/roadmap/${subjectId}`);
    return res.data as RoadmapModule[];
  },

  getCrunchModules: async (subjectId: number) => {
    const res = await axiosInstance.get(`/roadmap/${subjectId}/crunch`);
    return res.data as RoadmapModule[];
  },

  teachSession: async (body: {
    topic: string;
    message: string;
    subject_id?: number;
    session_id?: number;
    history: ChatMessage[];
  }) => {
    const res = await axiosInstance.post('/teach/session', body);
    return res.data as TutorReply;
  },

  listTeachSessions: async (subjectId: number) => {
    const res = await axiosInstance.get(`/teach/sessions/${subjectId}`);
    return res.data as SessionSummary[];
  },

  exportTeachSessions: async (subjectId: number) => {
    const res = await axiosInstance.get(`/teach/export/${subjectId}`);
    return res.data as object[];
  },

  // Flashcards
  createFlashcard: async (body: { front: string; back: string; topic?: string; subject_id?: number }) => {
    const res = await axiosInstance.post('/flashcards', body);
    return res.data as FlashcardOut;
  },

  getFlashcards: async (subjectId?: number) => {
    const res = await axiosInstance.get('/flashcards', { params: subjectId ? { subject_id: subjectId } : {} });
    return res.data as FlashcardOut[];
  },

  getReviewCards: async (subjectId?: number) => {
    const res = await axiosInstance.get('/flashcards/review', { params: subjectId ? { subject_id: subjectId } : {} });
    return res.data as FlashcardOut[];
  },

  rateFlashcard: async (cardId: number, rating: number) => {
    const res = await axiosInstance.post('/flashcards/rate', { card_id: cardId, rating });
    return res.data as FlashcardOut;
  },

  deleteFlashcard: async (cardId: number) => {
    await axiosInstance.delete(`/flashcards/${cardId}`);
  },

  // Quiz
  generateQuiz: async (topic: string, subjectId?: number, count = 5) => {
    const res = await axiosInstance.post('/quiz/generate', { topic, subject_id: subjectId, count });
    return res.data as { session_id: number; topic: string; questions: QuizQuestion[] };
  },

  submitQuiz: async (sessionId: number, answers: QuizAnswer[], isHighYield = false) => {
    const res = await axiosInstance.post('/quiz/submit', {
      session_id: sessionId,
      answers,
      is_high_yield: isHighYield,
    });
    return res.data as QuizResult;
  },

  getQuizSessions: async (subjectId?: number) => {
    const res = await axiosInstance.get('/quiz/sessions', { params: subjectId ? { subject_id: subjectId } : {} });
    return res.data as QuizSessionSummary[];
  },

  getAnalyticsDashboard: async () => {
    const res = await axiosInstance.get('/analytics/dashboard');
    return res.data as AnalyticsDashboard;
  },

  exportStudyReport: async () => {
    const res = await axiosInstance.get('/analytics/export', { responseType: 'text' });
    return res.data as string;
  },
};

export { api };
