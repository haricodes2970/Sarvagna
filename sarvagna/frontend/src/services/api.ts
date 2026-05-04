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
};

export { api };
