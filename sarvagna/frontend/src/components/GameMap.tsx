/**
 * ModuleMap — dark-fantasy game world map for Sarvagna.
 *
 * Visual style: organic island with golden glowing castles for completed
 * modules, pulsing amber beacon for the current module, teal glowing river
 * paths between nodes, fog-of-war over locked territory.
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

export interface ModuleMapProps {
  topics: Topic[];
  onTopicClick: (topicId: string) => void;
  moduleTitle?: string;
}

// ── Layout constants ────────────────────────────────────────────────────────

const W = 2400;   // virtual canvas width
const H = 1600;   // virtual canvas height
const CX = W / 2; // center X
const CY = H / 2; // center Y

/** Deterministic pseudo-random from a seed string */
function seededRand(seed: string, index: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  h = Math.imul(h ^ (index * 2654435761), 1664525) >>> 0;
  return (h & 0xffff) / 0xffff;
}

interface PlacedTopic extends Topic {
  x: number;
  y: number;
  subtopics: (Subtopic & { x: number; y: number })[];
}

function layoutTopics(topics: Topic[]): PlacedTopic[] {
  const n = topics.length;
  if (n === 0) return [];

  // Arrange in a rough radial spiral so nodes feel organic, not grid-like
  const placed: PlacedTopic[] = topics.map((topic, i) => {
    // Evenly spread angle with a golden-ratio twist
    const angle = i * 2.399963 + seededRand(topic.id, 0) * 0.6 - 0.3;
    // Radius grows with index but wobbles
    const r = 180 + i * (Math.min(560, 80 * Math.sqrt(n))) / n
              + seededRand(topic.id, 1) * 120 - 60;

    const x = CX + Math.cos(angle) * r;
    const y = CY + Math.sin(angle) * r * 0.65; // flatten vertically

    // Subtopics fan around the parent
    const subs = topic.subtopics.map((sub, j) => {
      const sa = angle + (j - (topic.subtopics.length - 1) / 2) * 0.55 + 0.1;
      const sr = 95 + seededRand(sub.id, 0) * 30;
      return { ...sub, x: x + Math.cos(sa) * sr, y: y + Math.sin(sa) * sr };
    });

    return { ...topic, x, y, subtopics: subs };
  });

  return placed;
}

// ── Colour palette ──────────────────────────────────────────────────────────

const COLORS = {
  completed: { stroke: "#c8860a", glow: "#f5a623", fill: "#1a1000", text: "#fde68a", pathStroke: "#0dd3c5" },
  current:   { stroke: "#f59e0b", glow: "#fbbf24", fill: "#120d00", text: "#fef3c7", pathStroke: "#0dd3c5" },
  locked:    { stroke: "#334155", glow: "#475569", fill: "#080c14", text: "#64748b", pathStroke: "#1e3a3a" },
  sub: {
    completed: { stroke: "#0dd3c5", fill: "#001a18" },
    current:   { stroke: "#f59e0b", fill: "#120d00" },
    locked:    { stroke: "#1e3a3a", fill: "#06090f" },
  },
};

// ── Main component ──────────────────────────────────────────────────────────

export default function ModuleMap({ topics, onTopicClick, moduleTitle: _moduleTitle = "Module Map" }: ModuleMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const placed = useMemo(() => layoutTopics(topics), [topics]);

  const [tf, setTf] = useState({ x: 0, y: 0, scale: 1 });
  const tfRef = useRef(tf);
  tfRef.current = tf;

  const drag = useRef<{ startX: number; startY: number; tfX: number; tfY: number } | null>(null);

  // Centre on current (or first) node on mount
  const centreOnCurrent = useCallback(() => {
    const node = placed.find((p) => p.status === "current") ?? placed[0];
    if (!node || !containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    const scale = 0.85;
    setTf({ scale, x: width / 2 - node.x * scale, y: height / 2 - node.y * scale });
  }, [placed]);

  useEffect(() => { centreOnCurrent(); }, [centreOnCurrent]);

  // Wheel zoom toward cursor
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const cur = tfRef.current;
      const next = Math.max(0.25, Math.min(cur.scale * factor, 2.5));
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const ratio = next / cur.scale;
      setTf({ scale: next, x: mx - (mx - cur.x) * ratio, y: my - (my - cur.y) * ratio });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    drag.current = { startX: e.clientX, startY: e.clientY, tfX: tfRef.current.x, tfY: tfRef.current.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    setTf((prev) => ({
      ...prev,
      x: drag.current!.tfX + (e.clientX - drag.current!.startX),
      y: drag.current!.tfY + (e.clientY - drag.current!.startY),
    }));
  };
  const onMouseUp = () => { drag.current = null; };

  const handleTopicClick = (topic: PlacedTopic, e: React.MouseEvent) => {
    e.stopPropagation();
    if (topic.status === "locked") {
      toast("🔒 Complete previous topics first", { style: { background: "#1a1a2e", color: "#f3f4f6" } });
      return;
    }
    onTopicClick(topic.id);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ background: "#06080f" }}
    >
      {/* ── HUD ── */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <div
          className="pointer-events-auto rounded-2xl border px-4 py-3 flex flex-col gap-2"
          style={{ background: "rgba(6,8,15,0.85)", border: "1px solid rgba(13,211,197,0.2)", backdropFilter: "blur(8px)" }}
        >
          <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: "#0dd3c5" }}>
            Sarvagna Realm
          </p>
          <p className="text-xs text-slate-500">Drag · Scroll to zoom</p>
          <button
            onClick={centreOnCurrent}
            className="mt-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
            style={{ background: "rgba(13,211,197,0.1)", color: "#0dd3c5", border: "1px solid rgba(13,211,197,0.3)" }}
          >
            Locate Current
          </button>
        </div>
      </div>

      {/* ── Legend ── */}
      <div
        className="absolute bottom-4 right-4 z-10 rounded-2xl border px-3 py-2 flex flex-col gap-1.5"
        style={{ background: "rgba(6,8,15,0.85)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        {[
          { color: "#c8860a", label: "Completed" },
          { color: "#f59e0b", label: "Current" },
          { color: "#334155", label: "Locked" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            <span className="text-[10px]" style={{ color: "#94a3b8" }}>{label}</span>
          </div>
        ))}
      </div>

      <svg
        ref={svgRef}
        className="w-full h-full touch-none outline-none"
        style={{ cursor: drag.current ? "grabbing" : "grab" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <defs>
          {/* Parchment-grid background */}
          <pattern id="pg" width="60" height="60" patternUnits="userSpaceOnUse">
            <rect width="60" height="60" fill="#06080f" />
            <path d="M60 0H0V60" fill="none" stroke="rgba(13,211,197,0.04)" strokeWidth="0.8" />
          </pattern>

          {/* Golden glow — completed nodes */}
          <filter id="f-gold" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Amber pulse glow — current node */}
          <filter id="f-amber" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="18" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Teal glow — paths & subtopic nodes */}
          <filter id="f-teal" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Fog-of-war: punch transparent holes over unlocked nodes */}
          <mask id="fog-mask">
            <rect x="-10000" y="-10000" width="30000" height="30000" fill="white" />
            {placed.map((p) => {
              if (p.status === "locked") return null;
              const r = p.status === "current" ? 420 : 320;
              return (
                <radialGradient key={`rg-${p.id}`} id={`rg-${p.id}`} cx="50%" cy="50%" r="50%">
                  <stop offset="0%"   stopColor="black" stopOpacity="1" />
                  <stop offset="55%"  stopColor="black" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="white" stopOpacity="1" />
                  <circle cx={p.x} cy={p.y} r={r} fill={`url(#rg-${p.id})`} />
                </radialGradient>
              );
            })}
            {/* Separate circles referencing the gradients */}
            {placed.map((p) => {
              if (p.status === "locked") return null;
              const r = p.status === "current" ? 420 : 320;
              return <circle key={`fog-${p.id}`} cx={p.x} cy={p.y} r={r} fill={`url(#rg-${p.id})`} />;
            })}
          </mask>

          {/* Animated glow pulse for current node */}
          <style>{`
            @keyframes ring-pulse {
              0%   { r: 42px; opacity: 0.9; }
              70%  { r: 72px; opacity: 0; }
              100% { r: 72px; opacity: 0; }
            }
            @keyframes ring-pulse2 {
              0%   { r: 42px; opacity: 0.6; }
              100% { r: 90px; opacity: 0; }
            }
            .pulse-r1 { animation: ring-pulse  2.4s ease-out infinite; }
            .pulse-r2 { animation: ring-pulse2 2.4s ease-out 0.9s infinite; }
            @keyframes castle-bob {
              0%,100% { transform: translateY(0); }
              50%      { transform: translateY(-4px); }
            }
            .castle-bob { animation: castle-bob 3s ease-in-out infinite; }
          `}</style>
        </defs>

        <g transform={`translate(${tf.x},${tf.y}) scale(${tf.scale})`}>

          {/* Background */}
          <rect x="-10000" y="-10000" width="30000" height="30000" fill="url(#pg)" />

          {/* ── PATHS (drawn first, beneath nodes) ── */}
          {placed.map((src, i) => {
            const dst = placed[i + 1];
            if (!dst) return null;
            const isActive = src.status !== "locked";
            // Cubic bezier: control points offset for organic curve
            const cpx1 = src.x + (dst.x - src.x) * 0.4 + (seededRand(src.id, 3) - 0.5) * 180;
            const cpy1 = src.y + (dst.y - src.y) * 0.1 + (seededRand(src.id, 4) - 0.5) * 140;
            const cpx2 = src.x + (dst.x - src.x) * 0.6 + (seededRand(dst.id, 3) - 0.5) * 180;
            const cpy2 = src.y + (dst.y - src.y) * 0.9 + (seededRand(dst.id, 4) - 0.5) * 140;
            const d = `M ${src.x} ${src.y} C ${cpx1} ${cpy1}, ${cpx2} ${cpy2}, ${dst.x} ${dst.y}`;
            return (
              <g key={`path-${src.id}`}>
                {/* Wide dim underlay */}
                <path d={d} fill="none" stroke={isActive ? "#0a4040" : "#0d1a1a"} strokeWidth="10" />
                {/* Glowing teal river */}
                {isActive && (
                  <path d={d} fill="none" stroke="#0dd3c5" strokeWidth="3.5"
                    strokeDasharray={dst.status === "locked" ? "12 8" : "none"}
                    filter="url(#f-teal)" opacity="0.85" />
                )}
                {/* Subtle dim dashes for locked segment */}
                {!isActive && (
                  <path d={d} fill="none" stroke="#1e3a3a" strokeWidth="2"
                    strokeDasharray="8 10" opacity="0.4" />
                )}
              </g>
            );
          })}

          {/* Subtopic branch paths */}
          {placed.map((mod) =>
            mod.subtopics.map((sub) => {
              const isActive = sub.status !== "locked";
              const cpx = (mod.x + sub.x) / 2 + (seededRand(sub.id, 5) - 0.5) * 40;
              const cpy = (mod.y + sub.y) / 2 + (seededRand(sub.id, 6) - 0.5) * 40;
              const d = `M ${mod.x} ${mod.y} Q ${cpx} ${cpy} ${sub.x} ${sub.y}`;
              return (
                <path key={`sp-${sub.id}`} d={d} fill="none"
                  stroke={isActive ? "#0dd3c5" : "#1e3a3a"}
                  strokeWidth={isActive ? 2 : 1.2}
                  strokeDasharray={sub.status === "locked" ? "5 6" : "none"}
                  filter={isActive ? "url(#f-teal)" : "none"}
                  opacity={isActive ? 0.7 : 0.3} />
              );
            })
          )}

          {/* ── FOG OF WAR ── */}
          <rect
            x="-10000" y="-10000" width="30000" height="30000"
            fill="rgba(4,6,12,0.92)"
            mask="url(#fog-mask)"
            pointerEvents="none"
          />

          {/* ── SUBTOPIC NODES ── */}
          {placed.map((mod) =>
            mod.subtopics.map((sub) => {
              const sc = COLORS.sub[sub.status];
              const active = sub.status !== "locked";
              return (
                <g key={sub.id} transform={`translate(${sub.x},${sub.y})`}
                  style={{ cursor: active ? "pointer" : "default" }}
                  onClick={(e) => { e.stopPropagation(); if (!active) return; onTopicClick(sub.id); }}>
                  {/* Outer ring */}
                  <circle r={14} fill={sc.fill} stroke={sc.stroke} strokeWidth={active ? 2.5 : 1.5}
                    filter={active ? "url(#f-teal)" : "none"} opacity={active ? 1 : 0.45} />
                  {/* Crystal inner dot */}
                  <circle r={5} fill={sc.stroke} opacity={active ? 0.9 : 0.3} />
                  {/* Label */}
                  <text y={26} textAnchor="middle" fill={active ? "#a5f3fc" : "#334155"}
                    fontSize={11} fontWeight={600}
                    style={{ paintOrder: "stroke fill", stroke: "#06080f", strokeWidth: 3 }}>
                    {sub.title}
                  </text>
                </g>
              );
            })
          )}

          {/* ── MODULE NODES ── */}
          {placed.map((mod) => {
            const c = COLORS[mod.status];
            const isCompleted = mod.status === "completed";
            const isCurrent = mod.status === "current";
            const isLocked = mod.status === "locked";
            const clickable = !isLocked;

            return (
              <g key={mod.id} transform={`translate(${mod.x},${mod.y})`}
                style={{ cursor: clickable ? "pointer" : "default" }}
                onClick={(e) => handleTopicClick(mod, e)}>

                {/* Pulse rings for current */}
                {isCurrent && (
                  <>
                    <circle cx="0" cy="0" r="42" fill="none" stroke="#f59e0b" strokeWidth="2.5"
                      className="pulse-r1" />
                    <circle cx="0" cy="0" r="42" fill="none" stroke="#fbbf24" strokeWidth="1.5"
                      className="pulse-r2" />
                  </>
                )}

                {/* Outer glow disc */}
                {!isLocked && (
                  <circle r={isCompleted ? 50 : 46} fill={c.glow}
                    filter={isCurrent ? "url(#f-amber)" : "url(#f-gold)"}
                    opacity={isCurrent ? 0.35 : 0.22} />
                )}

                {/* Castle base — large ring */}
                <circle r={38} fill={c.fill} stroke={c.stroke}
                  strokeWidth={isCurrent ? 4 : isCompleted ? 3.5 : 2}
                  filter={!isLocked ? (isCurrent ? "url(#f-amber)" : "url(#f-gold)") : "none"}
                  opacity={isLocked ? 0.5 : 1} />

                {/* Castle inner ring */}
                <circle r={26} fill="none" stroke={c.stroke} strokeWidth={1.2}
                  strokeDasharray={isLocked ? "4 4" : "none"} opacity={isLocked ? 0.3 : 0.6} />

                {/* Castle icon — stylised tower using SVG polygons */}
                {!isLocked && (
                  <g className={isCompleted ? "castle-bob" : ""} opacity={isCompleted ? 1 : 0.9}>
                    {/* Main tower body */}
                    <rect x={-9} y={-12} width={18} height={16} rx={1}
                      fill={isCurrent ? "#3d1f00" : "#2a1800"} stroke={c.stroke} strokeWidth={1.2} />
                    {/* Battlements */}
                    {[-8, -3, 2, 7].map((bx) => (
                      <rect key={bx} x={bx} y={-18} width={4} height={7} rx={0.5}
                        fill={isCurrent ? "#3d1f00" : "#2a1800"} stroke={c.stroke} strokeWidth={1} />
                    ))}
                    {/* Gate arch */}
                    <path d="M -5 4 L -5 -2 Q 0 -6 5 -2 L 5 4 Z"
                      fill={c.glow} opacity={0.7} />
                    {/* Left side tower */}
                    <rect x={-16} y={-8} width={9} height={12} rx={1}
                      fill={isCurrent ? "#3d1f00" : "#2a1800"} stroke={c.stroke} strokeWidth={1} />
                    <rect x={-15} y={-13} width={4} height={6} rx={0.5}
                      fill={isCurrent ? "#3d1f00" : "#2a1800"} stroke={c.stroke} strokeWidth={1} />
                    {/* Right side tower */}
                    <rect x={7} y={-8} width={9} height={12} rx={1}
                      fill={isCurrent ? "#3d1f00" : "#2a1800"} stroke={c.stroke} strokeWidth={1} />
                    <rect x={11} y={-13} width={4} height={6} rx={0.5}
                      fill={isCurrent ? "#3d1f00" : "#2a1800"} stroke={c.stroke} strokeWidth={1} />
                    {/* Warm glow window dots */}
                    {[[0, -5], [-12, -4], [12, -4]].map(([wx, wy]) => (
                      <circle key={`${wx}${wy}`} cx={wx} cy={wy} r={2.2}
                        fill={c.glow} opacity={0.9} filter="url(#f-gold)" />
                    ))}
                  </g>
                )}

                {/* Lock icon for locked nodes */}
                {isLocked && (
                  <g opacity={0.45}>
                    <rect x={-7} y={-4} width={14} height={11} rx={2} fill="#1e293b" stroke="#334155" strokeWidth={1.5} />
                    <path d="M -4 -4 Q -4 -13 0 -13 Q 4 -13 4 -4" fill="none" stroke="#334155" strokeWidth={2} />
                    <circle cx={0} cy={2} r={2.5} fill="#334155" />
                  </g>
                )}

                {/* Module number badge */}
                <text y={-44} textAnchor="middle"
                  fill={isLocked ? "#334155" : "#0dd3c5"}
                  fontSize={9} fontWeight={800} letterSpacing="0.15em"
                  opacity={isLocked ? 0.4 : 0.85}
                  style={{ paintOrder: "stroke fill", stroke: "#06080f", strokeWidth: 2 }}>
                  {`MODULE ${mod.id.replace(/^m/, "").padStart(2, "0")}`}
                </text>

                {/* Module title */}
                <text y={58} textAnchor="middle"
                  fill={c.text} fontSize={13} fontWeight={700}
                  opacity={isLocked ? 0.4 : 1}
                  style={{ paintOrder: "stroke fill", stroke: "#06080f", strokeWidth: 4, strokeLinejoin: "round" }}>
                  {mod.title.length > 22 ? mod.title.slice(0, 21) + "…" : mod.title}
                </text>
              </g>
            );
          })}

        </g>
      </svg>
    </div>
  );
}

// Re-export as GameWorldMap alias so existing imports keep working
export { ModuleMap as GameWorldMap };
export type { Topic as Module };
