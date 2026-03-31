import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Upload, BookOpen, Trash2, FileText } from "lucide-react";
import toast from "react-hot-toast";
import { importantQuestionsApi, subjectsApi } from "@/lib/api";

export default function ImportantQuestionsPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [text, setText] = useState("");
  const [moduleNumber, setModuleNumber] = useState(0);
  const [activeTab, setActiveTab] = useState<"text" | "pdf">("text");
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects"],
    queryFn: () => subjectsApi.list().then((r) => r.data),
  });
  const subject = subjects.find((s) => s.id === subjectId);

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ["important-questions", subjectId],
    queryFn: () => importantQuestionsApi.list(subjectId!).then((r) => r.data),
    enabled: !!subjectId,
  });

  const deleteMutation = useMutation({
    mutationFn: (questionId: string) => importantQuestionsApi.delete(subjectId!, questionId),
    onSuccess: () => {
      toast.success("Question deleted");
      queryClient.invalidateQueries({ queryKey: ["important-questions", subjectId] });
    },
    onError: () => toast.error("Delete failed"),
  });

  const uploadMutation = useMutation({
    mutationFn: () => importantQuestionsApi.upload(subjectId!, text, moduleNumber),
    onSuccess: (res) => {
      toast.success(`Saved ${res.data.count} questions`);
      setText("");
      queryClient.invalidateQueries({ queryKey: ["important-questions", subjectId] });
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.detail ?? "Upload failed"),
  });

  const pdfMutation = useMutation({
    mutationFn: (file: File) => importantQuestionsApi.uploadPdf(subjectId!, file, moduleNumber),
    onSuccess: (res) => {
      toast.success(`Extracted ${res.data.count} questions from PDF`);
      if (fileRef.current) fileRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["important-questions", subjectId] });
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.detail ?? "PDF upload failed"),
  });

  const grouped = questions.reduce<Record<number, typeof questions>>((acc, q) => {
    (acc[q.module_number] ??= []).push(q);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-black/80 backdrop-blur-md border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/dashboard")}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold truncate">
            {subject?.name ?? "Subject"} — Important Questions
          </h1>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
            Professor's Notes
          </p>
        </div>
        <BookOpen size={20} className="text-amber-500" />
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Upload section */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          {/* Tab switcher */}
          <div className="flex border-b border-zinc-800">
            <button
              onClick={() => setActiveTab("text")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold transition-colors ${
                activeTab === "text"
                  ? "bg-zinc-800 text-amber-400 border-b-2 border-amber-500"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Upload size={13} /> Paste Text
            </button>
            <button
              onClick={() => setActiveTab("pdf")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold transition-colors ${
                activeTab === "pdf"
                  ? "bg-zinc-800 text-amber-400 border-b-2 border-amber-500"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <FileText size={13} /> Upload PDF
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Module selector — shared */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-400">Module:</label>
              <select
                value={moduleNumber}
                onChange={(e) => setModuleNumber(Number(e.target.value))}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-amber-500"
              >
                <option value={0}>All / General</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>Module {n}</option>
                ))}
              </select>
            </div>

            {activeTab === "text" ? (
              <>
                <p className="text-xs text-zinc-500">
                  One question per line or numbered list (1. 2. 3.) — questions are extracted automatically.
                </p>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={"1. What is machine learning?\n2. Explain supervised learning.\n3. Define overfitting."}
                  rows={6}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 resize-none outline-none focus:border-amber-500 focus:shadow-[0_0_0_2px_rgba(245,158,11,0.15)] transition-all"
                />
                <button
                  onClick={() => uploadMutation.mutate()}
                  disabled={!text.trim() || uploadMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-black font-semibold text-sm hover:bg-amber-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Upload size={15} />
                  {uploadMutation.isPending ? "Saving…" : "Save Questions"}
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-zinc-500">
                  Upload a typed PDF (notes, question bank, textbook chapter). Questions will be extracted automatically.
                  <span className="block mt-1 text-zinc-600">Handwritten PDFs are not supported — text must be digital/typed.</span>
                </p>
                <label className="block w-full cursor-pointer">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) pdfMutation.mutate(file);
                    }}
                  />
                  <div className={`w-full flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl py-8 transition-colors ${
                    pdfMutation.isPending
                      ? "border-amber-500/50 bg-amber-500/5"
                      : "border-zinc-700 hover:border-amber-500/50 hover:bg-zinc-800"
                  }`}>
                    <FileText size={28} className={pdfMutation.isPending ? "text-amber-500 animate-pulse" : "text-zinc-500"} />
                    <div className="text-center">
                      <p className="text-sm font-semibold text-zinc-300">
                        {pdfMutation.isPending ? "Processing PDF…" : "Click to choose PDF"}
                      </p>
                      <p className="text-xs text-zinc-600 mt-1">Max 20 MB</p>
                    </div>
                  </div>
                </label>
              </>
            )}
          </div>
        </div>

        {/* Question list */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest">
            Saved Questions ({questions.length})
          </h2>

          {isLoading ? (
            <p className="text-zinc-600 text-sm">Loading…</p>
          ) : questions.length === 0 ? (
            <p className="text-zinc-600 text-sm text-center py-8">
              No questions saved yet. Paste some above!
            </p>
          ) : (
            Object.entries(grouped)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([mod, qs]) => (
                <div key={mod} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
                  <p className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-3">
                    {Number(mod) === 0 ? "General / All Modules" : `Module ${mod}`}
                  </p>
                  {qs.map((q, i) => (
                    <div
                      key={q.id}
                      className="flex gap-3 items-start py-2 border-b border-zinc-800 last:border-0"
                    >
                      <span className="text-xs text-zinc-600 font-mono mt-0.5 w-5 shrink-0">
                        {i + 1}.
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-200 leading-relaxed">{q.question}</p>
                        <p className="text-[10px] text-zinc-600 mt-1">
                          {new Date(q.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() =>
                            navigate(
                              `/chat/${subjectId}/${q.module_number || 1}?topicTitle=${encodeURIComponent(q.question)}`
                            )
                          }
                          className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors whitespace-nowrap"
                        >
                          Study This
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(q.id)}
                          disabled={deleteMutation.isPending}
                          className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Delete question"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}
