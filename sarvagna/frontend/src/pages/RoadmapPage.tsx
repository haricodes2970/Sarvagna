import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { progressApi, type ModuleNode } from "../lib/api";

export default function RoadmapPage() {
  const { subject_id } = useParams<{ subject_id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: roadmap, isLoading } = useQuery({
    queryKey: ["roadmap", subject_id],
    queryFn: () => progressApi.roadmap(subject_id!).then((r) => r.data),
    enabled: !!subject_id,
  });

  const completeMutation = useMutation({
    mutationFn: (module_number: number) =>
      progressApi.completeModule(subject_id!, module_number),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["roadmap", subject_id] });
      const d = res.data;
      toast.success(`+${d.xp_earned} XP · Module ${d.module_number} complete!`);
      if (d.leveled_up) {
        toast.success(`🎉 Level up! Level ${d.level} — ${d.level_name}`);
      }
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.detail ?? "Failed to complete module"),
  });

  if (isLoading) return <Loading />;
  if (!roadmap) return <p style={styles.empty}>Roadmap not found.</p>;

  const pct = roadmap.completion_percentage;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate("/dashboard")}>
          ← Dashboard
        </button>
        <div>
          <h2 style={styles.title}>{roadmap.subject_name}</h2>
          <p style={styles.meta}>
            {roadmap.completed_modules}/{roadmap.total_modules} modules · {pct}% complete
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div style={styles.progressTrack}>
        <div style={{ ...styles.progressFill, width: `${pct}%` }} />
      </div>

      {/* Module nodes */}
      <div style={styles.nodes}>
        {roadmap.modules.map((m: ModuleNode) => (
          <ModuleCard
            key={m.module_number}
            node={m}
            onComplete={() => completeMutation.mutate(m.module_number)}
            completing={completeMutation.isPending}
          />
        ))}
      </div>
    </div>
  );
}

function ModuleCard({
  node,
  onComplete,
  completing,
}: {
  node: ModuleNode;
  onComplete: () => void;
  completing: boolean;
}) {
  return (
    <div style={{ ...styles.node, ...(node.is_completed ? styles.nodeDone : {}) }}>
      <div style={styles.nodeHeader}>
        <span style={styles.nodeNumber}>Module {node.module_number}</span>
        {node.is_completed && <span style={styles.checkmark}>✓</span>}
      </div>
      {node.is_completed ? (
        <p style={styles.completedAt}>
          Completed {node.completed_at ? new Date(node.completed_at).toLocaleDateString() : ""}
        </p>
      ) : (
        <button
          style={styles.completeBtn}
          onClick={onComplete}
          disabled={completing}
        >
          {completing ? "Saving…" : "Mark Complete (+50 XP)"}
        </button>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "#6b7280" }}>Loading roadmap…</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#0f0f1a", color: "#f3f4f6", padding: "2rem" },
  header: { display: "flex", alignItems: "flex-start", gap: "1rem", marginBottom: "1.25rem" },
  backBtn: { padding: "0.4rem 0.8rem", borderRadius: 8, border: "1px solid #374151", background: "transparent", color: "#9ca3af", cursor: "pointer", marginTop: "0.25rem" },
  title: { margin: 0, color: "#a78bfa", fontSize: "1.4rem" },
  meta: { margin: "0.3rem 0 0", color: "#6b7280", fontSize: "0.85rem" },
  progressTrack: { height: 8, background: "#1f2937", borderRadius: 4, overflow: "hidden", marginBottom: "2rem" },
  progressFill: { height: "100%", background: "linear-gradient(90deg, #7c3aed, #a78bfa)", borderRadius: 4, transition: "width 0.4s ease" },
  nodes: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" },
  node: { background: "#1a1a2e", borderRadius: 12, padding: "1.25rem", border: "1px solid #1f2937" },
  nodeDone: { border: "1px solid #4c1d95", background: "#1c1438" },
  nodeHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" },
  nodeNumber: { fontWeight: 700, color: "#e5e7eb" },
  checkmark: { color: "#a78bfa", fontWeight: 700, fontSize: "1.1rem" },
  completedAt: { margin: 0, color: "#6b7280", fontSize: "0.8rem" },
  completeBtn: { width: "100%", padding: "0.55rem 0", borderRadius: 8, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" },
  empty: { color: "#6b7280", textAlign: "center", marginTop: "4rem" },
};
