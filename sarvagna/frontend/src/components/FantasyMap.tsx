/**
 * FantasyMap — dark-fantasy SVG module map for Sarvagna.
 *
 * Layout:  1 centre castle (module) with topic towns radiating outward (hub-and-spoke).
 * Visual:  painted dark terrain, mountain ranges, forest patches, teal river paths,
 *          golden glow for completed areas, purple fog-of-war for locked ones.
 *
 * Data contract:
 *   topics[0]           → the module node  (rendered at centre, large castle)
 *   topics[0].subtopics → topic nodes       (rendered around centre, smaller towns)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

// ── Types ──────────────────────────────────────────────────────────────────

export type NodeStatus = "completed" | "current" | "locked";

export interface Subtopic {
  id: string;
  title: string;
  status: NodeStatus;
}

export interface Topic {
  id: string;
  title: string;
  status: NodeStatus;
  subtopics: Subtopic[];
}

export interface FantasyMapProps {
  topics: Topic[];
  onTopicClick: (topicId: string) => void;
  onStartStudying?: () => void;
  moduleTitle?: string;
  /** If provided, used as CSS background-image. SVG terrain is hidden. */
  backgroundUrl?: string;
}

// ── Virtual canvas ──────────────────────────────────────────────────────────

const W = 1800;
const H = 1100;
const CX = W / 2;
const CY = H / 2;

// ── Seeded RNG ──────────────────────────────────────────────────────────────

function sr(seed: string, idx: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  h = Math.imul(h ^ (idx * 2654435761), 1664525) >>> 0;
  return (h & 0xffff) / 0xffff;
}

// ── Layout: hub-and-spoke ───────────────────────────────────────────────────

interface PlacedTopic extends Subtopic {
  x: number;
  y: number;
}

function layoutTopics(topics: Subtopic[], seed: string): PlacedTopic[] {
  const n = topics.length;
  if (n === 0) return [];

  return topics.map((t, i) => {
    // Evenly distribute around centre, with a small seeded jitter
    const base = (i / n) * Math.PI * 2 - Math.PI / 2;
    const angle = base + (sr(seed + t.id, 0) - 0.5) * 0.35;
    // Radius varies slightly per node
    const radius = 300 + sr(seed + t.id, 1) * 90;
    return {
      ...t,
      x: CX + Math.cos(angle) * radius,
      y: CY + Math.sin(angle) * radius * 0.68, // flatten vertically
    };
  });
}

// ── Terrain helpers ─────────────────────────────────────────────────────────

interface MtnPeak { pts: string; opacity: number; }

function genMountains(seed: string): MtnPeak[] {
  // Clusters at canvas corners / edges — far from node area
  const clusters: [number, number][] = [
    [0.08 * W, 0.1 * H],  [0.5 * W, 0.04 * H],  [0.9 * W, 0.1 * H],
    [0.04 * W, 0.5 * H],  [0.94 * W, 0.5 * H],
    [0.08 * W, 0.88 * H], [0.5 * W, 0.93 * H],  [0.9 * W, 0.87 * H],
  ];

  const peaks: MtnPeak[] = [];
  clusters.forEach(([clx, cly], ci) => {
    const count = 4 + Math.floor(sr(seed + "mc", ci) * 4);
    for (let mi = 0; mi < count; mi++) {
      const ox = (sr(seed + "mx", ci * 10 + mi) - 0.5) * 160;
      const oy = (sr(seed + "my", ci * 10 + mi) - 0.5) * 80;
      const mx = clx + ox;
      const my = cly + oy;
      const pw = 28 + sr(seed + "mw", ci * 10 + mi) * 44;
      const ph = 22 + sr(seed + "mh", ci * 10 + mi) * 38;
      // Jagged peak shape using 5 points
      const pts = [
        `${mx},${my - ph}`,
        `${mx - pw * 0.22},${my - ph * 0.48}`,
        `${mx - pw * 0.5},${my}`,
        `${mx + pw * 0.5},${my}`,
        `${mx + pw * 0.22},${my - ph * 0.48}`,
      ].join(" ");
      peaks.push({ pts, opacity: 0.5 + sr(seed + "mo", ci * 10 + mi) * 0.4 });
    }
  });
  return peaks;
}

interface ForestDot { x: number; y: number; r: number; }

function genForests(seed: string, avoid: { x: number; y: number }[]): ForestDot[] {
  const trees: ForestDot[] = [];
  for (let i = 0; i < 90; i++) {
    const angle = sr(seed + "fa", i) * Math.PI * 2;
    const dist  = 260 + sr(seed + "fd", i) * 650;
    const x = CX + Math.cos(angle) * dist;
    const y = CY + Math.sin(angle) * dist * 0.65;
    if (x < 40 || x > W - 40 || y < 40 || y > H - 40) continue;
    if (avoid.some((n) => Math.hypot(n.x - x, n.y - y) < 85)) continue;
    trees.push({ x, y, r: 6 + sr(seed + "fr", i) * 10 });
  }
  return trees;
}

// ── Castle icon builder ─────────────────────────────────────────────────────

function CastleIcon({ stroke, glow, isLarge }: { size?: number; stroke: string; glow: string; isLarge: boolean }) {
  const s = isLarge ? 1.4 : 1;
  return (
    <g>
      {/* Main body */}
      <rect x={-10 * s} y={-14 * s} width={20 * s} height={18 * s} rx={1.5}
        fill="#1c1000" stroke={stroke} strokeWidth={1.4} />
      {/* Battlements */}
      {([-9, -4, 1, 6].map((bx) => bx * s) as number[]).map((bx) => (
        <rect key={bx} x={bx} y={-20 * s} width={4 * s} height={7 * s} rx={0.5}
          fill="#1c1000" stroke={stroke} strokeWidth={1} />
      ))}
      {/* Gate arch */}
      <path d={`M ${-6 * s} 4 L ${-6 * s} -3 Q 0 ${-9 * s} ${6 * s} -3 L ${6 * s} 4 Z`}
        fill={glow} opacity={0.75} />
      {/* Left tower */}
      <rect x={-19 * s} y={-9 * s} width={10 * s} height={13 * s} rx={1}
        fill="#1c1000" stroke={stroke} strokeWidth={1} />
      <rect x={-18 * s} y={-15 * s} width={4 * s} height={7 * s} rx={0.5}
        fill="#1c1000" stroke={stroke} strokeWidth={1} />
      {/* Right tower */}
      <rect x={9 * s} y={-9 * s} width={10 * s} height={13 * s} rx={1}
        fill="#1c1000" stroke={stroke} strokeWidth={1} />
      <rect x={14 * s} y={-15 * s} width={4 * s} height={7 * s} rx={0.5}
        fill="#1c1000" stroke={stroke} strokeWidth={1} />
      {/* Windows */}
      {([[0, -5], [-14, -4], [14, -4]] as [number, number][]).map(([wx, wy]) => (
        <circle key={`${wx}${wy}`} cx={wx * s} cy={wy * s} r={2.8 * s}
          fill={glow} opacity={0.9} filter="url(#fgold)" />
      ))}
    </g>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function FantasyMap({
  topics,
  onTopicClick,
  onStartStudying,
  backgroundUrl,
}: FantasyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef       = useRef<SVGSVGElement>(null);

  // Extract module node and its topic children
  const moduleNode   = topics[0] ?? null;
  const rawTopics    = moduleNode?.subtopics ?? [];
  const seed         = moduleNode?.id ?? "default";

  const placed       = useMemo(() => layoutTopics(rawTopics, seed), [rawTopics, seed]);
  const mountains    = useMemo(() => genMountains(seed), [seed]);
  const avoidList    = useMemo(
    () => [{ x: CX, y: CY }, ...placed.map((p) => ({ x: p.x, y: p.y }))],
    [placed],
  );
  const forests      = useMemo(() => genForests(seed, avoidList), [seed, avoidList]);

  // ── Pan / zoom ──────────────────────────────────────────────────────────
  const [tf, setTf]  = useState({ x: 0, y: 0, scale: 1 });
  const tfRef        = useRef(tf);
  tfRef.current      = tf;
  const drag         = useRef<{ sx: number; sy: number; tx: number; ty: number } | null>(null);

  const centreView = useCallback(() => {
    if (!containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    const scale = Math.min(width / W, height / H) * 0.92;
    setTf({ scale, x: (width - W * scale) / 2, y: (height - H * scale) / 2 });
  }, []);

  useEffect(() => { centreView(); }, [centreView]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.12 : 0.9;
      const c = tfRef.current;
      const s = Math.max(0.25, Math.min(c.scale * f, 3.5));
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const r  = s / c.scale;
      setTf({ scale: s, x: mx - (mx - c.x) * r, y: my - (my - c.y) * r });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onMD = (e: React.MouseEvent) =>
    (drag.current = { sx: e.clientX, sy: e.clientY, tx: tfRef.current.x, ty: tfRef.current.y });
  const onMM = (e: React.MouseEvent) => {
    const d = drag.current;
    if (!d) return;
    const cx = e.clientX;
    const cy = e.clientY;
    setTf((p) => ({ ...p, x: d.tx + (cx - d.sx), y: d.ty + (cy - d.sy) }));
  };
  const onMU = () => (drag.current = null);

  const handleTopicClick = (t: PlacedTopic, e: React.MouseEvent) => {
    e.stopPropagation();
    if (t.status === "locked") {
      toast("🔒 Complete previous topics first", { style: { background: "#1a1a2e", color: "#f3f4f6" } });
      return;
    }
    onTopicClick(t.id);
  };

  // ── Colours ────────────────────────────────────────────────────────────
  const nodeColor = (s: NodeStatus) =>
    s === "completed" ? { stroke: "#c8860a", glow: "#f5a623", text: "#fde68a" }
    : s === "current"   ? { stroke: "#f59e0b", glow: "#fbbf24", text: "#fef3c7" }
    :                     { stroke: "#3a4560", glow: "#475569", text: "#64748b" };

  const modC = nodeColor(moduleNode?.status ?? "locked");

  if (!moduleNode) return null;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={
        backgroundUrl
          ? { backgroundImage: `url(${backgroundUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
          : { background: "#04060d" }
      }
    >
      {/* ── HUD ─────────────────────────────────────────────── */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <div
          className="pointer-events-auto rounded-2xl border px-4 py-3 flex flex-col gap-2"
          style={{ background: "rgba(4,6,13,0.9)", border: "1px solid rgba(13,211,197,0.2)", backdropFilter: "blur(8px)" }}
        >
          <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: "#0dd3c5" }}>
            Module Realm
          </p>
          <p className="text-[10px] text-slate-500">Drag · Scroll to zoom</p>
          <button
            onClick={centreView}
            className="mt-1 px-3 py-1.5 rounded-lg text-[11px] font-bold"
            style={{ background: "rgba(13,211,197,0.08)", color: "#0dd3c5", border: "1px solid rgba(13,211,197,0.22)" }}
          >
            Reset View
          </button>
        </div>
      </div>

      {/* ── Legend ──────────────────────────────────────────── */}
      <div
        className="absolute bottom-20 left-4 z-10 rounded-2xl border px-3 py-2 flex flex-col gap-1.5"
        style={{ background: "rgba(4,6,13,0.9)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        {[{ c: "#c8860a", l: "Completed" }, { c: "#f59e0b", l: "Current" }, { c: "#3a4560", l: "Locked" }].map(({ c, l }) => (
          <div key={l} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
            <span className="text-[10px] text-slate-400">{l}</span>
          </div>
        ))}
      </div>

      {/* ── Let's Start ─────────────────────────────────────── */}
      {onStartStudying && (
        <button
          onClick={onStartStudying}
          className="absolute bottom-4 right-4 z-30 px-6 py-3.5 rounded-2xl font-black text-sm transition-all shadow-lg hover:scale-105"
          style={{ background: "#f59e0b", color: "#000", boxShadow: "0 0 24px rgba(245,158,11,0.4)" }}
        >
          Let's Start
        </button>
      )}

      <svg
        ref={svgRef}
        className="w-full h-full touch-none outline-none"
        style={{ cursor: drag.current ? "grabbing" : "grab" }}
        onMouseDown={onMD}
        onMouseMove={onMM}
        onMouseUp={onMU}
        onMouseLeave={onMU}
      >
        <defs>
          {/* Background radial */}
          <radialGradient id="bg" cx="50%" cy="48%" r="58%">
            <stop offset="0%"   stopColor="#0d1220" />
            <stop offset="70%"  stopColor="#070a14" />
            <stop offset="100%" stopColor="#030509" />
          </radialGradient>

          {/* Centre terrain glow — warm lit area around module */}
          <radialGradient id="terrain-warm" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#1e1608" stopOpacity="0.7" />
            <stop offset="55%"  stopColor="#0e1006" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#040609" stopOpacity="0" />
          </radialGradient>

          {/* Completed-area warm glow (per-node) */}
          <radialGradient id="warm-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#4a2800" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#4a2800" stopOpacity="0" />
          </radialGradient>

          {/* Locked fog gradient */}
          <radialGradient id="fog-grad" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#0e0820" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#0e0820" stopOpacity="0" />
          </radialGradient>

          {/* Golden glow filter */}
          <filter id="fgold" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="b" />
            <feComposite in="SourceGraphic" in2="b" operator="over" />
          </filter>

          {/* Amber pulse filter */}
          <filter id="famber" x="-90%" y="-90%" width="280%" height="280%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="22" result="b" />
            <feComposite in="SourceGraphic" in2="b" operator="over" />
          </filter>

          {/* Teal path glow */}
          <filter id="fteal" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="b" />
            <feComposite in="SourceGraphic" in2="b" operator="over" />
          </filter>

          {/* Fog blur */}
          <filter id="ffog" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="38" />
          </filter>

          {/* Subtle mountain blur base */}
          <filter id="fmtn" x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b" />
            <feComposite in="SourceGraphic" in2="b" operator="over" />
          </filter>

          {/* Fog-of-war mask — clear areas around unlocked nodes */}
          <mask id="fog-mask">
            <rect x="-5000" y="-5000" width="15000" height="15000" fill="white" />
            {/* Module clear zone */}
            {moduleNode.status !== "locked" && (() => {
              const r = moduleNode.status === "current" ? 480 : 380;
              return (
                <>
                  <radialGradient id="rgmod" cx="50%" cy="50%" r="50%">
                    <stop offset="0%"  stopColor="black" stopOpacity="1" />
                    <stop offset="58%" stopColor="black" stopOpacity="0.92" />
                    <stop offset="100%" stopColor="white" stopOpacity="1" />
                  </radialGradient>
                  <circle cx={CX} cy={CY} r={r} fill="url(#rgmod)" />
                </>
              );
            })()}
            {/* Topic clear zones */}
            {placed.map((p) => {
              if (p.status === "locked") return null;
              const r = p.status === "current" ? 300 : 240;
              return (
                <React.Fragment key={`rgf-${p.id}`}>
                  <radialGradient id={`rg-${p.id}`} cx="50%" cy="50%" r="50%">
                    <stop offset="0%"  stopColor="black" stopOpacity="1" />
                    <stop offset="55%" stopColor="black" stopOpacity="0.88" />
                    <stop offset="100%" stopColor="white" stopOpacity="1" />
                  </radialGradient>
                  <circle cx={p.x} cy={p.y} r={r} fill={`url(#rg-${p.id})`} />
                </React.Fragment>
              );
            })}
          </mask>

          <style>{`
            @keyframes rp1 { 0%,100%{r:58px;opacity:.8} 65%{r:90px;opacity:0} }
            @keyframes rp2 { 0%{r:58px;opacity:.45} 100%{r:110px;opacity:0} }
            @keyframes tp1 { 0%,100%{r:36px;opacity:.7} 65%{r:58px;opacity:0} }
            @keyframes cbob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
            .modpulse1{animation:rp1 2.6s ease-out infinite}
            .modpulse2{animation:rp2 2.6s ease-out .9s infinite}
            .toppulse1{animation:tp1 2.2s ease-out infinite}
            .cbob{animation:cbob 3.2s ease-in-out infinite}
          `}</style>
        </defs>

        <g transform={`translate(${tf.x},${tf.y}) scale(${tf.scale})`}>

          {/* ── BACKGROUND + TERRAIN (SVG mode only) ──────── */}
          {!backgroundUrl && (
            <>
              <rect x="-5000" y="-5000" width="15000" height="15000" fill="url(#bg)" />
              <ellipse cx={CX} cy={CY} rx={700} ry={460} fill="url(#terrain-warm)" />
              {mountains.map((m, i) => {
                const [topStr] = m.pts.split(" ");
                const [tx, ty] = topStr.split(",").map(Number);
                return (
                  <g key={`mb-${i}`} filter="url(#fmtn)">
                    <polygon points={m.pts} fill="#16162a" opacity={m.opacity * 0.7} />
                    <circle cx={tx} cy={ty} r={3.5} fill="#2a2850" opacity={m.opacity * 0.5} />
                  </g>
                );
              })}
              {mountains.map((m, i) => (
                <polygon key={`ms-${i}`} points={m.pts}
                  fill="#1b1930" stroke="#252348" strokeWidth="0.6" opacity={m.opacity * 0.9} />
              ))}
              {forests.map((t, i) => (
                <g key={`tr-${i}`}>
                  <circle cx={t.x} cy={t.y} r={t.r * 1.3} fill="#0a1a0e" opacity={0.45} />
                  <circle cx={t.x} cy={t.y} r={t.r} fill="#0d2214" stroke="#122818"
                    strokeWidth="0.8" opacity={0.65} />
                </g>
              ))}
            </>
          )}

          {/* ── RIVER PATHS (centre → each topic) ─────────── */}
          {placed.map((t) => {
            const active = t.status !== "locked";
            // Organic bezier: control point offset perpendicular to path
            const dx = t.x - CX;
            const dy = t.y - CY;
            const len = Math.hypot(dx, dy);
            const perp = { x: -dy / len, y: dx / len };
            const bend = (sr(seed + t.id, 7) - 0.5) * 120;
            const cpx = (CX + t.x) / 2 + perp.x * bend;
            const cpy = (CY + t.y) / 2 + perp.y * bend;
            const d = `M ${CX} ${CY} Q ${cpx} ${cpy} ${t.x} ${t.y}`;

            return (
              <g key={`path-${t.id}`}>
                {/* Wide dark underlay */}
                <path d={d} fill="none" stroke="#061818" strokeWidth="16" />
                {active ? (
                  <>
                    {/* Glowing teal river */}
                    <path d={d} fill="none" stroke="#0dd3c5" strokeWidth="3.5"
                      filter="url(#fteal)" opacity="0.88" />
                    {/* Bright core */}
                    <path d={d} fill="none" stroke="#6efff6" strokeWidth="1.2" opacity="0.35" />
                  </>
                ) : (
                  /* Dim dashed locked path */
                  <path d={d} fill="none" stroke="#1e3a3a" strokeWidth="2"
                    strokeDasharray="10 8" opacity="0.3" />
                )}
              </g>
            );
          })}

          {/* ── FOG OF WAR ────────────────────────────────── */}
          {/* Per-node fog blobs for locked topics */}
          {placed.filter((p) => p.status === "locked").map((p) => (
            <g key={`fog-${p.id}`}>
              <circle cx={p.x} cy={p.y} r={340} fill="#130820"
                filter="url(#ffog)" opacity="0.7" />
              <circle cx={p.x} cy={p.y} r={200} fill="#1c0a30"
                filter="url(#ffog)" opacity="0.5" />
            </g>
          ))}
          {/* Dark uniform fog over entire canvas, punched out around unlocked nodes */}
          <rect x="-5000" y="-5000" width="15000" height="15000"
            fill="rgba(4,3,12,0.86)" mask="url(#fog-mask)" pointerEvents="none" />

          {/* ── WARM GLOW under completed/current nodes ──── */}
          {placed.map((t) => t.status !== "locked" && (
            <ellipse key={`wg-${t.id}`} cx={t.x} cy={t.y} rx={180} ry={140}
              fill="url(#warm-glow)" />
          ))}
          {moduleNode.status !== "locked" && (
            <ellipse cx={CX} cy={CY} rx={320} ry={240} fill="url(#warm-glow)" />
          )}

          {/* ── TOPIC NODES (towns) ────────────────────────── */}
          {placed.map((t) => {
            const c   = nodeColor(t.status);
            const isC = t.status === "completed";
            const isA = t.status === "current";
            const isL = t.status === "locked";

            return (
              <g key={t.id} transform={`translate(${t.x},${t.y})`}
                style={{ cursor: isL ? "default" : "pointer" }}
                onClick={(e) => handleTopicClick(t, e)}>

                {/* Pulse ring */}
                {isA && (
                  <circle cx="0" cy="0" r="36" fill="none"
                    stroke="#f59e0b" strokeWidth="2" className="toppulse1" />
                )}

                {/* Outer glow */}
                {!isL && (
                  <circle r={isC ? 38 : 34} fill={c.glow}
                    filter={isA ? "url(#famber)" : "url(#fgold)"}
                    opacity={isA ? 0.3 : 0.18} />
                )}

                {/* Base circle */}
                <circle r={28} fill={isC ? "#1a1000" : isA ? "#120d00" : "#090c18"}
                  stroke={c.stroke}
                  strokeWidth={isA ? 3.5 : isC ? 3 : 1.8}
                  filter={!isL ? (isA ? "url(#famber)" : "url(#fgold)") : "none"}
                  opacity={isL ? 0.45 : 1} />

                {/* Inner ring */}
                <circle r={18} fill="none" stroke={c.stroke} strokeWidth={1}
                  strokeDasharray={isL ? "3 4" : "none"} opacity={isL ? 0.2 : 0.45} />

                {/* Icon */}
                {!isL ? (
                  <g className={isC ? "cbob" : ""}>
                    <CastleIcon size={28} stroke={c.stroke} glow={c.glow} isLarge={false} />
                  </g>
                ) : (
                  <g opacity={0.38}>
                    <rect x={-6} y={-3} width={12} height={9} rx={2}
                      fill="#141a2e" stroke="#3a4560" strokeWidth={1.4} />
                    <path d="M -3.5 -3 Q -3.5 -10 0 -10 Q 3.5 -10 3.5 -3"
                      fill="none" stroke="#3a4560" strokeWidth={1.8} />
                    <circle cx={0} cy={2} r={2} fill="#3a4560" />
                  </g>
                )}

                {/* Label */}
                <text y={isL ? 36 : 38} textAnchor="middle"
                  fill={c.text} fontSize={12} fontWeight={700}
                  opacity={isL ? 0.38 : 1}
                  style={{ paintOrder: "stroke fill", stroke: "#04060d", strokeWidth: 4, strokeLinejoin: "round" }}>
                  {t.title.length > 20 ? t.title.slice(0, 19) + "…" : t.title}
                </text>
              </g>
            );
          })}

          {/* ── MODULE NODE (capital castle, centre) ──────── */}
          {(() => {
            const isC = moduleNode.status === "completed";
            const isA = moduleNode.status === "current";
            const isL = moduleNode.status === "locked";

            return (
              <g transform={`translate(${CX},${CY})`}
                style={{ cursor: isL ? "default" : "pointer" }}
                onClick={(e) => { e.stopPropagation(); if (!isL) onTopicClick(moduleNode.id); }}>

                {/* Pulse rings */}
                {isA && (
                  <>
                    <circle cx="0" cy="0" r="58" fill="none"
                      stroke="#f59e0b" strokeWidth="3" className="modpulse1" />
                    <circle cx="0" cy="0" r="58" fill="none"
                      stroke="#fbbf24" strokeWidth="1.8" className="modpulse2" />
                  </>
                )}

                {/* Outer glow disc */}
                {!isL && (
                  <circle r={isC ? 72 : 65} fill={modC.glow}
                    filter={isA ? "url(#famber)" : "url(#fgold)"}
                    opacity={isA ? 0.4 : 0.25} />
                )}

                {/* Base */}
                <circle r={52}
                  fill={isC ? "#1a1000" : isA ? "#120d00" : "#090c18"}
                  stroke={modC.stroke}
                  strokeWidth={isA ? 5 : isC ? 4.5 : 2.5}
                  filter={!isL ? (isA ? "url(#famber)" : "url(#fgold)") : "none"}
                  opacity={isL ? 0.4 : 1} />

                {/* Inner ring */}
                <circle r={36} fill="none" stroke={modC.stroke} strokeWidth={1.4}
                  strokeDasharray={isL ? "5 5" : "none"} opacity={isL ? 0.22 : 0.5} />

                {/* Castle */}
                {!isL ? (
                  <g className={isC ? "cbob" : ""}>
                    <CastleIcon size={52} stroke={modC.stroke} glow={modC.glow} isLarge={true} />
                  </g>
                ) : (
                  <g opacity={0.38}>
                    <rect x={-9} y={-5} width={18} height={14} rx={2}
                      fill="#141a2e" stroke="#3a4560" strokeWidth={2} />
                    <path d="M -5 -5 Q -5 -16 0 -16 Q 5 -16 5 -5"
                      fill="none" stroke="#3a4560" strokeWidth={2.5} />
                    <circle cx={0} cy={3} r={3} fill="#3a4560" />
                  </g>
                )}

                {/* Module title above */}
                <text y={-62} textAnchor="middle"
                  fill={isL ? "#3a4560" : "#0dd3c5"}
                  fontSize={10} fontWeight={800} letterSpacing="0.18em"
                  opacity={isL ? 0.35 : 0.88}
                  style={{ paintOrder: "stroke fill", stroke: "#04060d", strokeWidth: 2.5 }}>
                  CAPITAL
                </text>

                {/* Module title below */}
                <text y={70} textAnchor="middle"
                  fill={modC.text} fontSize={15} fontWeight={800}
                  opacity={isL ? 0.35 : 1}
                  style={{ paintOrder: "stroke fill", stroke: "#04060d", strokeWidth: 5, strokeLinejoin: "round" }}>
                  {moduleNode.title.length > 24 ? moduleNode.title.slice(0, 23) + "…" : moduleNode.title}
                </text>
              </g>
            );
          })()}

        </g>
      </svg>
    </div>
  );
}

export type { Topic as FantasyTopic };
