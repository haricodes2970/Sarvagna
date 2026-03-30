import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { subjectsApi, type Subject } from "../lib/api";
import { useAuthStore } from "../store/authStore";

export default function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", branch: "", semester: 1 });

  const { data: subjects = [], isLoading } = useQuery({
    queryKey: ["subjects"],
    queryFn: () => subjectsApi.list().then((r) => r.data),
  });

  const addMutation = useMutation({
    mutationFn: () => subjectsApi.add(form.name, form.branch, form.semester),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      setForm({ name: "", branch: "", semester: 1 });
      setShowForm(false);
      toast.success("Subject added!");
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.detail ?? "Failed to add subject"),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => subjectsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subjects"] });
      toast.success("Subject removed");
    },
    onError: () => toast.error("Failed to remove subject"),
  });

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const slotUsed = subjects.length;
  const slotMax = 10;

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.greeting}>Welcome, {user?.name ?? "Student"} 👋</h2>
          <p style={styles.meta}>
            Level {user?.level} · {user?.xp} XP · {user?.streak} day streak
          </p>
        </div>
        <div style={styles.headerRight}>
          <button style={styles.outlineBtn} onClick={() => navigate("/progress")}>
            Progress
          </button>
          <button style={styles.outlineBtn} onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      {/* Slot bar */}
      <div style={styles.slotBar}>
        <span style={styles.slotText}>
          Subject slots: <strong>{slotUsed}/{slotMax}</strong>
        </span>
        <div style={styles.slotTrack}>
          <div style={{ ...styles.slotFill, width: `${(slotUsed / slotMax) * 100}%` }} />
        </div>
      </div>

      {/* Add button */}
      <div style={styles.toolbar}>
        <h3 style={styles.sectionTitle}>My Subjects</h3>
        {slotUsed < slotMax && (
          <button style={styles.primaryBtn} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "+ Add Subject"}
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div style={styles.formCard}>
          <input
            style={styles.input}
            placeholder="Subject name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
          <input
            style={styles.input}
            placeholder="Branch (e.g. CSE)"
            value={form.branch}
            onChange={(e) => setForm((p) => ({ ...p, branch: e.target.value }))}
          />
          <input
            style={styles.input}
            type="number"
            min={1}
            max={8}
            placeholder="Semester"
            value={form.semester}
            onChange={(e) => setForm((p) => ({ ...p, semester: Number(e.target.value) }))}
          />
          <button
            style={styles.primaryBtn}
            onClick={() => addMutation.mutate()}
            disabled={addMutation.isPending || !form.name || !form.branch}
          >
            {addMutation.isPending ? "Adding…" : "Add Subject"}
          </button>
        </div>
      )}

      {/* Subject list */}
      {isLoading ? (
        <div style={styles.grid}>
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : subjects.length === 0 ? (
        <p style={styles.empty}>No subjects yet. Add one to get started!</p>
      ) : (
        <div style={styles.grid}>
          {subjects.map((s: Subject) => (
            <SubjectCard
              key={s.id}
              subject={s}
              onOpen={() => navigate(`/subject/${s.id}`)}
              onRoadmap={() => navigate(`/map/${s.id}`)}
              onRemove={() => removeMutation.mutate(s.id)}
              onMainChat={() => navigate(`/chat/${s.id}/0`)}
              onImportantQs={() => navigate(`/important-questions/${s.id}`)}
              removing={removeMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SubjectCard({
  subject,
  onOpen,
  onRoadmap,
  onRemove,
  onMainChat,
  onImportantQs,
  removing,
}: {
  subject: Subject;
  onOpen: () => void;
  onRoadmap: () => void;
  onRemove: () => void;
  onMainChat: () => void;
  onImportantQs: () => void;
  removing: boolean;
}) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <h4 style={styles.cardTitle}>{subject.name}</h4>
        <button
          style={styles.dangerBtn}
          onClick={onRemove}
          disabled={removing}
          title="Remove subject"
        >
          ✕
        </button>
      </div>
      <p style={styles.cardMeta}>
        {subject.branch} · Sem {subject.semester}
      </p>
      <p style={styles.cardMeta}>{subject.modules_scraped} modules scraped</p>
      <div style={styles.cardActions}>
        <button style={styles.primaryBtn} onClick={onOpen}>
          Ask Questions
        </button>
        <button style={styles.outlineBtn} onClick={onRoadmap}>
          Open Map
        </button>
      </div>
      <div style={{ ...styles.cardActions, marginTop: "0.4rem" }}>
        <button style={styles.tealBtn} onClick={onMainChat}>
          💬 Main Chat
        </button>
        <button style={styles.amberBtn} onClick={onImportantQs}>
          📝 Important Qs
        </button>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div style={{ ...skeletonStyles.card, animation: "pulse 1.5s ease-in-out infinite" }}>
      <div style={skeletonStyles.line} />
      <div style={{ ...skeletonStyles.line, width: "60%", marginTop: "0.5rem" }} />
      <div style={{ ...skeletonStyles.line, width: "40%", marginTop: "0.75rem" }} />
      <div style={skeletonStyles.btnRow}>
        <div style={skeletonStyles.btn} />
        <div style={skeletonStyles.btn} />
      </div>
    </div>
  );
}

const skeletonStyles: Record<string, React.CSSProperties> = {
  card: { background: "#1a1a2e", borderRadius: 12, padding: "1.25rem" },
  line: { height: 14, borderRadius: 6, background: "#2e2e42", width: "80%" },
  btnRow: { display: "flex", gap: "0.5rem", marginTop: "1rem" },
  btn: { height: 34, width: 100, borderRadius: 8, background: "#2e2e42" },
};

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#0f0f1a", color: "#f3f4f6", padding: "2rem" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" },
  greeting: { margin: 0, fontSize: "1.5rem", color: "#a78bfa" },
  meta: { margin: "0.25rem 0 0", color: "#6b7280", fontSize: "0.9rem" },
  headerRight: { display: "flex", gap: "0.5rem" },
  slotBar: { marginBottom: "1.5rem" },
  slotText: { fontSize: "0.85rem", color: "#9ca3af" },
  slotTrack: { marginTop: "0.4rem", height: 6, background: "#1f2937", borderRadius: 4, overflow: "hidden" },
  slotFill: { height: "100%", background: "#7c3aed", borderRadius: 4, transition: "width 0.3s" },
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" },
  sectionTitle: { margin: 0, color: "#e5e7eb" },
  formCard: { background: "#1a1a2e", borderRadius: 12, padding: "1.25rem", marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" },
  input: { padding: "0.65rem 1rem", borderRadius: 8, border: "1px solid #374151", background: "#0f0f1a", color: "#f3f4f6", fontSize: "0.95rem", outline: "none" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "1rem" },
  card: { background: "#1a1a2e", borderRadius: 12, padding: "1.25rem" },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { margin: 0, color: "#e5e7eb", fontSize: "1.05rem" },
  cardMeta: { margin: "0.3rem 0 0", color: "#6b7280", fontSize: "0.85rem" },
  cardActions: { display: "flex", gap: "0.5rem", marginTop: "1rem" },
  primaryBtn: { padding: "0.5rem 1rem", borderRadius: 8, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: "0.9rem" },
  outlineBtn: { padding: "0.5rem 1rem", borderRadius: 8, border: "1px solid #374151", background: "transparent", color: "#d1d5db", cursor: "pointer", fontSize: "0.9rem" },
  dangerBtn: { padding: "0.3rem 0.6rem", borderRadius: 6, border: "none", background: "#3b1e1e", color: "#ef4444", cursor: "pointer" },
  tealBtn: { flex: 1, padding: "0.5rem 0.75rem", borderRadius: 8, border: "none", background: "#0d3d3d", color: "#2dd4bf", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" },
  amberBtn: { flex: 1, padding: "0.5rem 0.75rem", borderRadius: 8, border: "none", background: "#3d2e0a", color: "#fbbf24", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" },
  empty: { color: "#6b7280", textAlign: "center", marginTop: "3rem" },
};
