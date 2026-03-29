import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { progressApi, type Badge } from "../lib/api";

export default function ProgressPage() {
  const navigate = useNavigate();

  const { data: overview, isLoading } = useQuery({
    queryKey: ["progress"],
    queryFn: () => progressApi.overview().then((r) => r.data),
  });

  if (isLoading || !overview) {
    return (
      <div style={styles.page}>
        <p style={styles.loading}>Loading progress…</p>
      </div>
    );
  }

  const xpCurrent = overview.xp;
  const xpToNext = overview.xp_to_next_level;
  const xpPct = xpToNext != null ? Math.min((xpCurrent / (xpCurrent + xpToNext)) * 100, 100) : 100;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate("/dashboard")}>
          ← Dashboard
        </button>
        <h2 style={styles.title}>My Progress</h2>
      </div>

      {/* Level card */}
      <div style={styles.levelCard}>
        <div style={styles.levelBadge}>Lv {overview.level}</div>
        <div style={styles.levelInfo}>
          <p style={styles.levelName}>{overview.level_name}</p>
          <div style={styles.xpRow}>
            <span style={styles.xpValue}>{overview.xp.toLocaleString()} XP</span>
            {xpToNext != null && (
              <span style={styles.xpNext}>{xpToNext.toLocaleString()} to next level</span>
            )}
          </div>
          <div style={styles.xpTrack}>
            <div style={{ ...styles.xpFill, width: `${xpPct}%` }} />
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={styles.statsRow}>
        <StatCard label="Current Streak" value={`${overview.streak} days 🔥`} />
        <StatCard label="Badges Earned" value={`${overview.badges.length}`} />
        <StatCard label="Level" value={`${overview.level} / 10`} />
      </div>

      {/* Badges */}
      <h3 style={styles.sectionTitle}>Badges</h3>
      {overview.badges.length === 0 ? (
        <p style={styles.empty}>No badges yet — keep learning!</p>
      ) : (
        <div style={styles.badgeGrid}>
          {overview.badges.map((badge: Badge) => (
            <BadgeCard key={badge.id} badge={badge} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.statCard}>
      <p style={styles.statValue}>{value}</p>
      <p style={styles.statLabel}>{label}</p>
    </div>
  );
}

function BadgeCard({ badge }: { badge: Badge }) {
  return (
    <div style={styles.badgeCard} title={badge.condition}>
      <span style={styles.badgeIcon}>🏅</span>
      <p style={styles.badgeName}>{badge.name}</p>
      <p style={styles.badgeCondition}>{badge.condition}</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#0f0f1a", color: "#f3f4f6", padding: "2rem" },
  loading: { color: "#6b7280", textAlign: "center", marginTop: "4rem" },
  header: { display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" },
  backBtn: { padding: "0.4rem 0.8rem", borderRadius: 8, border: "1px solid #374151", background: "transparent", color: "#9ca3af", cursor: "pointer" },
  title: { margin: 0, color: "#a78bfa", fontSize: "1.4rem" },
  levelCard: { background: "#1a1a2e", borderRadius: 14, padding: "1.5rem", display: "flex", gap: "1.25rem", alignItems: "center", marginBottom: "1.25rem" },
  levelBadge: { minWidth: 64, height: 64, borderRadius: "50%", background: "#4c1d95", color: "#e9d5ff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "1.1rem" },
  levelInfo: { flex: 1 },
  levelName: { margin: "0 0 0.3rem", color: "#e9d5ff", fontWeight: 700, fontSize: "1.1rem" },
  xpRow: { display: "flex", gap: "1rem", alignItems: "baseline", marginBottom: "0.5rem" },
  xpValue: { color: "#a78bfa", fontWeight: 700 },
  xpNext: { color: "#6b7280", fontSize: "0.8rem" },
  xpTrack: { height: 8, background: "#0f0f1a", borderRadius: 4, overflow: "hidden" },
  xpFill: { height: "100%", background: "linear-gradient(90deg, #7c3aed, #a78bfa)", borderRadius: 4, transition: "width 0.4s ease" },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "2rem" },
  statCard: { background: "#1a1a2e", borderRadius: 12, padding: "1rem", textAlign: "center" },
  statValue: { margin: "0 0 0.25rem", fontSize: "1.2rem", fontWeight: 700, color: "#e5e7eb" },
  statLabel: { margin: 0, color: "#6b7280", fontSize: "0.8rem" },
  sectionTitle: { margin: "0 0 1rem", color: "#e5e7eb" },
  empty: { color: "#6b7280" },
  badgeGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "0.75rem" },
  badgeCard: { background: "#1a1a2e", borderRadius: 10, padding: "1rem", textAlign: "center", border: "1px solid #4c1d95" },
  badgeIcon: { fontSize: "1.8rem" },
  badgeName: { margin: "0.4rem 0 0.2rem", fontWeight: 700, color: "#e9d5ff", fontSize: "0.85rem" },
  badgeCondition: { margin: 0, color: "#6b7280", fontSize: "0.75rem" },
};
