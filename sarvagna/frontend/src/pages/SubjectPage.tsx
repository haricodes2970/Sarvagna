import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { subjectsApi, queryApi, type QueryResponse } from "../lib/api";

type Tab = "exact" | "simplified" | "example";

export default function SubjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<QueryResponse | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("exact");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [scraping, setScraping] = useState(false);

  // Fetch the subject info to show its name
  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects"],
    queryFn: () => subjectsApi.list().then((r) => r.data),
  });
  const subject = subjects.find((s) => s.id === id);

  const queryMutation = useMutation({
    mutationFn: () => queryApi.ask(question, id!),
    onSuccess: (res) => {
      setAnswer(res.data);
      setActiveTab("exact");
      if (res.data.xp_earned > 0) {
        toast.success(`+${res.data.xp_earned} XP earned!`);
      }
      if (res.data.badges_unlocked.length > 0) {
        res.data.badges_unlocked.forEach((b) => toast(`🏅 Badge unlocked: ${b}`));
      }
      if (res.data.leveled_up) {
        toast.success(`🎉 Level up! You're now level ${res.data.level} (${res.data.level_name})`);
      }
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.detail ?? "Query failed"),
  });

  const handleScrape = async () => {
    if (!id) return;
    setScraping(true);
    try {
      const res = await subjectsApi.scrape(id);
      setTaskId(res.data.task_id);
      toast.success(res.data.message);
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Scrape failed");
    } finally {
      setScraping(false);
    }
  };

  const tabContent: Record<Tab, string> = {
    exact: answer?.exact_answer ?? "",
    simplified: answer?.simplified_answer ?? "",
    example: answer?.real_world_example ?? "",
  };

  const tabLabels: Record<Tab, string> = {
    exact: "Exact Answer",
    simplified: "Simplified",
    example: "Real World Example",
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate("/dashboard")}>
          ← Dashboard
        </button>
        <h2 style={styles.title}>{subject?.name ?? "Subject"}</h2>
        <button
          style={styles.scrapeBtn}
          onClick={handleScrape}
          disabled={scraping}
          title="Scrape latest notes for this subject"
        >
          {scraping ? "Scraping…" : "📥 Scrape Notes"}
        </button>
      </div>

      {/* Task ID banner */}
      {taskId && (
        <div style={styles.taskBanner}>
          Scraping in progress · Task ID: <code>{taskId}</code>
        </div>
      )}

      {/* Question input */}
      <div style={styles.queryBox}>
        <textarea
          style={styles.textarea}
          placeholder="Ask anything about this subject…"
          value={question}
          rows={3}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (question.trim()) queryMutation.mutate();
            }
          }}
        />
        <button
          style={styles.askBtn}
          onClick={() => queryMutation.mutate()}
          disabled={queryMutation.isPending || !question.trim()}
        >
          {queryMutation.isPending ? "Thinking…" : "Ask"}
        </button>
      </div>

      {/* Answer card */}
      {answer && (
        <div style={styles.answerCard}>
          {/* XP / badge row */}
          <div style={styles.rewardRow}>
            {answer.cached ? (
              <span style={styles.cachedBadge}>⚡ Cached</span>
            ) : (
              <span style={styles.xpBadge}>+{answer.xp_earned} XP</span>
            )}
            <span style={styles.levelText}>
              Level {answer.level} · {answer.level_name}
            </span>
          </div>

          {/* Tabs */}
          <div style={styles.tabs}>
            {(["exact", "simplified", "example"] as Tab[]).map((t) => (
              <button
                key={t}
                style={{ ...styles.tab, ...(activeTab === t ? styles.activeTab : {}) }}
                onClick={() => setActiveTab(t)}
              >
                {tabLabels[t]}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={styles.tabContent}>{tabContent[activeTab]}</div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#0f0f1a", color: "#f3f4f6", padding: "2rem" },
  header: { display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" },
  backBtn: { padding: "0.4rem 0.8rem", borderRadius: 8, border: "1px solid #374151", background: "transparent", color: "#9ca3af", cursor: "pointer" },
  title: { margin: 0, color: "#a78bfa", flex: 1, fontSize: "1.4rem" },
  scrapeBtn: { padding: "0.5rem 1rem", borderRadius: 8, border: "none", background: "#1f2937", color: "#d1d5db", cursor: "pointer" },
  taskBanner: { background: "#1f2937", border: "1px solid #374151", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.85rem", color: "#9ca3af" },
  queryBox: { display: "flex", gap: "0.75rem", marginBottom: "1.5rem", alignItems: "flex-end" },
  textarea: { flex: 1, padding: "0.75rem 1rem", borderRadius: 10, border: "1px solid #374151", background: "#1a1a2e", color: "#f3f4f6", fontSize: "1rem", outline: "none", resize: "none", lineHeight: 1.5 },
  askBtn: { padding: "0.75rem 1.5rem", borderRadius: 10, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "1rem" },
  answerCard: { background: "#1a1a2e", borderRadius: 14, padding: "1.5rem" },
  rewardRow: { display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" },
  xpBadge: { background: "#4c1d95", color: "#c4b5fd", padding: "0.25rem 0.6rem", borderRadius: 6, fontSize: "0.8rem", fontWeight: 700 },
  cachedBadge: { background: "#1f2937", color: "#6b7280", padding: "0.25rem 0.6rem", borderRadius: 6, fontSize: "0.8rem" },
  levelText: { color: "#6b7280", fontSize: "0.85rem" },
  tabs: { display: "flex", gap: "0.5rem", marginBottom: "1rem", borderBottom: "1px solid #374151", paddingBottom: "0.5rem" },
  tab: { padding: "0.4rem 0.9rem", borderRadius: 6, border: "none", background: "transparent", color: "#6b7280", cursor: "pointer", fontSize: "0.9rem" },
  activeTab: { background: "#4c1d95", color: "#e9d5ff" },
  tabContent: { color: "#e5e7eb", lineHeight: 1.7, whiteSpace: "pre-wrap", fontSize: "0.95rem" },
};
