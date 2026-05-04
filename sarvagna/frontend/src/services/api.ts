import { api as axiosInstance } from "../lib/api";

export type ModuleStatus = {
  module_number: number;
  title: string;
  status: string;
  topics: string[];
  xp_earned: number;
  unlocked_at: string | null;
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
      created_at: string;
    }>;
  },

  deleteUploadedFile: async (fileId: number) => {
    await axiosInstance.delete(`/upload/files/${fileId}`);
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
};

export { api };
