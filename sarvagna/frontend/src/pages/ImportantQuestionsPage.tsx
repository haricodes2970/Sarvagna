import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Upload, BookOpen } from "lucide-react";
import toast from "react-hot-toast";
import { importantQuestionsApi, subjectsApi } from "@/lib/api";

export default function ImportantQuestionsPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [text, setText] = useState("");
  const [moduleNumber, setModuleNumber] = useState(0);

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
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-300">
            Paste Professor's Questions
          </h2>
          <p className="text-xs text-zinc-500">
            One question per line, or numbered list (1. 2. 3.) — the AI will extract them automatically.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"1. What is machine learning?\n2. Explain supervised learning.\n3. Define overfitting."}
            rows={6}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 resize-none outline-none focus:border-amber-500 focus:shadow-[0_0_0_2px_rgba(245,158,11,0.15)] transition-all"
          />
          <div className="flex items-center gap-3">
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
            <button
              onClick={() => uploadMutation.mutate()}
              disabled={!text.trim() || uploadMutation.isPending}
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-black font-semibold text-sm hover:bg-amber-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Upload size={15} />
              {uploadMutation.isPending ? "Saving…" : "Save Questions"}
            </button>
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
                      <button
                        onClick={() =>
                          navigate(
                            `/chat/${subjectId}/${q.module_number || 1}?topicTitle=${encodeURIComponent(q.question)}`
                          )
                        }
                        className="shrink-0 text-[11px] px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors whitespace-nowrap"
                      >
                        Study This
                      </button>
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
