/**
 * FantasyMap — full SVG dark-fantasy terrain map for Sarvagna module view.
 *
 * Renders an organic island with mountains, forests, glowing teal rivers,
 * golden castle nodes, purple fog-of-war over locked areas, hex-grid overlay.
 * No external images. No Replicate. Pure SVG.
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
}

// ── Virtual canvas ──────────────────────────────────────────────────────────

const W = 2400;
const H = 1500;
const CX = W / 2;
const CY = H / 2;

// ── Seeded RNG ──────────────────────────────────────────────────────────────

function sr(seed: string, idx: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  h = Math.imul(h ^ (idx * 2654435761), 1664525) >>> 0;
  return (h & 0xffff) / 0xffff;
}

// ── Layout ──────────────────────────────────────────────────────────────────

interface PlacedTopic extends Topic {
  x: number;
  y: number;
  subtopics: (Subtopic & { x: number; y: number })[];
}

function layoutTopics(topics: Topic[]): PlacedTopic[] {
  const n = topics.length;
  if (n === 0) return [];
  return topics.map((t, i) => {
    const angle = i * 2.399963 + sr(t.id, 0) * 0.5 - 0.25;
    const radius = 160 + i * (Math.min(520, 75 * Math.sqrt(n))) / n + sr(t.id, 1) * 100 - 50;
    const x = CX + Math.cos(angle) * radius;
    const y = CY + Math.sin(angle) * radius * 0.6;
    const subs = t.subtopics.map((s, j) => {
      const sa = angle + (j - (t.subtopics.length - 1) / 2) * 0.5;
      const sr2 = 90 + sr(s.id, 0) * 25;
      return { ...s, x: x + Math.cos(sa) * sr2, y: y + Math.sin(sa) * sr2 };
    });
    return { ...t, x, y, subtopics: subs };
  });
}

// ── Terrain generation ──────────────────────────────────────────────────────

/** Organic island blob — smooth closed path centred on CX, CY */
function islandPath(seed: string): string {
  const pts = 20;
  const coords: [number, number][] = [];
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const noise = 0.62 + sr(seed + "isle", i) * 0.38;
    const r = 720 * noise;
    coords.push([CX + Math.cos(a) * r, CY + Math.sin(a) * r * 0.52]);
  }
  // Build smooth quadratic bezier
  let d = `M ${(coords[0][0] + coords[pts - 1][0]) / 2} ${(coords[0][1] + coords[pts - 1][1]) / 2}`;
  for (let i = 0; i < pts; i++) {
    const next = coords[(i + 1) % pts];
    d += ` Q ${coords[i][0]} ${coords[i][1]} ${(coords[i][0] + next[0]) / 2} ${(coords[i][1] + next[1]) / 2}`;
  }
  return d + " Z";
}

/** Mountain peak polygon string */
function peakPts(mx: number, my: number, w: number, h: number): string {
  const lx = mx - w * 0.25;
  const rx = mx + w * 0.25;
  return `${mx},${my - h} ${lx},${my - h * 0.35} ${mx - w * 0.5},${my} ${mx + w * 0.5},${my} ${rx},${my - h * 0.35}`;
}

interface MtnData { pts: string; x: number; y: number; col: string; op: number; }

function genMountains(seed: string): MtnData[] {
  const clusters: [number, number][] = [
    [0.09 * W, 0.1 * H], [0.5 * W, 0.05 * H], [0.89 * W, 0.1 * H],
    [0.05 * W, 0.5 * H], [0.93 * W, 0.48 * H],
    [0.1 * W, 0.86 * H], [0.5 * W, 0.91 * H], [0.88 * W, 0.83 * H],
  ];
  const cols = ["#1a1535", "#1e1a3a", "#221c42", "#17142e", "#1c1838"];
  const out: MtnData[] = [];
  clusters.forEach(([clx, cly], ci) => {
    const count = 3 + Math.floor(sr(seed + "mc", ci) * 4);
    for (let mi = 0; mi < count; mi++) {
      const ox = (sr(seed + "mx", ci * 12 + mi) - 0.5) * 180;
      const oy = (sr(seed + "my", ci * 12 + mi) - 0.5) * 90;
      const mx = clx + ox;
      const my = cly + oy;
      const w = 35 + sr(seed + "mw", ci * 12 + mi) * 55;
      const h = 28 + sr(seed + "mh", ci * 12 + mi) * 48;
      out.push({
        pts: peakPts(mx, my, w, h),
        x: mx, y: my,
        col: cols[Math.floor(sr(seed + "mc2", ci * 12 + mi) * cols.length)],
        op: 0.45 + sr(seed + "mo", ci * 12 + mi) * 0.45,
      });
    }
  });
  return out;
}

interface TreeData { x: number; y: number; r: number; }

function genForests(seed: string, avoid: { x: number; y: number }[]): TreeData[] {
  const trees: TreeData[] = [];
  for (let i = 0; i < 80; i++) {
    const a = sr(seed + "fa", i) * Math.PI * 2;
    const d = 320 + sr(seed + "fd", i) * 780;
    const x = CX + Math.cos(a) * d;
    const y = CY + Math.sin(a) * d * 0.58;
    if (x < 60 || x > W - 60 || y < 60 || y > H - 60) continue;
    if (avoid.some((n) => Math.hypot(n.x - x, n.y - y) < 100)) continue;
    trees.push({ x, y, r: 9 + sr(seed + "fr", i) * 14 });
  }
  return trees;
}

// ── Main component ──────────────────────────────────────────────────────────

export default function FantasyMap({
  topics,
  onTopicClick,
  onStartStudying,
  moduleTitle: _moduleTitle = "Module Realm",
}: FantasyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const placed = useMemo(() => layoutTopics(topics), [topics]);
  const terrainSeed = useMemo(() => topics.map((t) => t.id).join("") || "default", [topics]);

  const island = useMemo(() => islandPath(terrainSeed), [terrainSeed]);
  const mountains = useMemo(() => genMountains(terrainSeed), [terrainSeed]);
  const forests = useMemo(
    () => genForests(terrainSeed, placed.map((p) => ({ x: p.x, y: p.y }))),
    [terrainSeed, placed]
  );

  const [tf, setTf] = useState({ x: 0, y: 0, scale: 1 });
  const tfRef = useRef(tf);
  tfRef.current = tf;
  const drag = useRef<{ sx: number; sy: number; tx: number; ty: number } | null>(null);

  const centreOnCurrent = useCallback(() => {
    const node = placed.find((p) => p.status === "current") ?? placed[0];
    if (!node || !containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    const scale = 0.8;
    setTf({ scale, x: width / 2 - node.x * scale, y: height / 2 - node.y * scale });
  }, [placed]);

  useEffect(() => { centreOnCurrent(); }, [centreOnCurrent]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const cur = tfRef.current;
      const next = Math.max(0.2, Math.min(cur.scale * factor, 3));
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const ratio = next / cur.scale;
      setTf({ scale: next, x: mx - (mx - cur.x) * ratio, y: my - (my - cur.y) * ratio });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onMouseDown = (e: React.MouseEvent) =>
    (drag.current = { sx: e.clientX, sy: e.clientY, tx: tfRef.current.x, ty: tfRef.current.y });
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    setTf((p) => ({ ...p, x: drag.current!.tx + (e.clientX - drag.current!.sx), y: drag.current!.ty + (e.clientY - drag.current!.sy) }));
  };
  const onMouseUp = () => (drag.current = null);

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
      style={{ background: "#07090f" }}
    >
      {/* HUD */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <div
          className="pointer-events-auto rounded-2xl border px-4 py-3 flex flex-col gap-2"
          style={{ background: "rgba(7,9,15,0.88)", border: "1px solid rgba(13,211,197,0.18)", backdropFilter: "blur(8px)" }}
        >
          <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: "#0dd3c5" }}>
            Module Realm
          </p>
          <p className="text-[10px] text-slate-500">Drag · Scroll to zoom</p>
          <button
            onClick={centreOnCurrent}
            className="mt-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
            style={{ background: "rgba(13,211,197,0.1)", color: "#0dd3c5", border: "1px solid rgba(13,211,197,0.25)" }}
          >
            Locate Current
          </button>
        </div>
      </div>

      {/* Legend */}
      <div
        className="absolute bottom-4 left-4 z-10 rounded-2xl border px-3 py-2 flex flex-col gap-1.5"
        style={{ background: "rgba(7,9,15,0.88)", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        {[{ c: "#c8860a", l: "Completed" }, { c: "#f59e0b", l: "Current" }, { c: "#334155", l: "Locked" }].map(({ c, l }) => (
          <div key={l} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
            <span className="text-[10px]" style={{ color: "#94a3b8" }}>{l}</span>
          </div>
        ))}
      </div>

      {/* Let's Start */}
      {onStartStudying && (
        <button
          onClick={onStartStudying}
          className="absolute bottom-4 right-4 z-30 px-6 py-4 rounded-2xl font-black text-sm transition-colors shadow-lg"
          style={{ background: "#f59e0b", color: "#000" }}
        >
          Let's Start
        </button>
      )}

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
          {/* Hex grid pattern (subtle dark border overlay like reference) */}
          <pattern id="hex-grid" x="0" y="0" width="52" height="60" patternUnits="userSpaceOnUse">
            <polygon
              points="26,2 50,15 50,45 26,58 2,45 2,15"
              fill="none"
              stroke="rgba(13,211,197,0.04)"
              strokeWidth="1"
            />
          </pattern>

          {/* Background radial — dark space edges, slightly warmer centre */}
          <radialGradient id="bg-grad" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#0e1220" />
            <stop offset="100%" stopColor="#04060c" />
          </radialGradient>

          {/* Island terrain gradient */}
          <radialGradient id="terrain-grad" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#1a2515" />
            <stop offset="40%" stopColor="#141e0f" />
            <stop offset="100%" stopColor="#0c1509" />
          </radialGradient>

          {/* Island shore glow */}
          <filter id="shore-glow" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          {/* Golden glow */}
          <filter id="f-gold" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="b" />
            <feComposite in="SourceGraphic" in2="b" operator="over" />
          </filter>

          {/* Amber pulse glow */}
          <filter id="f-amber" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="20" result="b" />
            <feComposite in="SourceGraphic" in2="b" operator="over" />
          </filter>

          {/* Teal glow */}
          <filter id="f-teal" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="b" />
            <feComposite in="SourceGraphic" in2="b" operator="over" />
          </filter>

          {/* Purple fog filter */}
          <filter id="f-fog" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="30" />
          </filter>

          {/* Fog-of-war mask — clear circles around unlocked nodes */}
          <mask id="fog-mask">
            <rect x="-20000" y="-20000" width="60000" height="60000" fill="white" />
            {placed.map((p) => {
              if (p.status === "locked") return null;
              return (
                <radialGradient key={`rgm-${p.id}`} id={`rgm-${p.id}`} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="black" stopOpacity="1" />
                  <stop offset="55%" stopColor="black" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="white" stopOpacity="1" />
                </radialGradient>
              );
            })}
            {placed.map((p) => {
              if (p.status === "locked") return null;
              const r = p.status === "current" ? 460 : 350;
              return <circle key={`fogc-${p.id}`} cx={p.x} cy={p.y} r={r} fill={`url(#rgm-${p.id})`} />;
            })}
          </mask>

          <style>{`
            @keyframes rpulse1 { 0%,100%{r:44px;opacity:.85} 60%{r:78px;opacity:0} }
            @keyframes rpulse2 { 0%,100%{r:44px;opacity:.5} 100%{r:96px;opacity:0} }
            @keyframes cbob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
            .rp1{animation:rpulse1 2.4s ease-out infinite}
            .rp2{animation:rpulse2 2.4s ease-out .9s infinite}
            .cbob{animation:cbob 3s ease-in-out infinite}
          `}</style>
        </defs>

        <g transform={`translate(${tf.x},${tf.y}) scale(${tf.scale})`}>

          {/* ── BACKGROUND ── */}
          <rect x="-20000" y="-20000" width="60000" height="60000" fill="url(#bg-grad)" />
          {/* Hex grid overlay (full canvas, subtle) */}
          <rect x="-20000" y="-20000" width="60000" height="60000" fill="url(#hex-grid)" />

          {/* ── ISLAND TERRAIN ── */}
          {/* Outer shore glow */}
          <path d={island} fill="none" stroke="#0dd3c5" strokeWidth="6"
            filter="url(#shore-glow)" opacity="0.12" />
          {/* Land fill */}
          <path d={island} fill="url(#terrain-grad)" stroke="#1e2d18" strokeWidth="2" opacity="0.9" />
          {/* Inner terrain gradient overlay */}
          <path d={island} fill="#0a1208" opacity="0.4" />

          {/* ── MOUNTAINS ── */}
          {mountains.map((m, i) => (
            <polygon key={`mtn-${i}`} points={m.pts} fill={m.col} opacity={m.op} />
          ))}
          {/* Mountain snow-cap highlight */}
          {mountains.map((m, i) => {
            const [topX, topY] = m.pts.split(" ")[0].split(",").map(Number);
            return (
              <circle key={`msnow-${i}`} cx={topX} cy={topY} r={3}
                fill="#2a2555" opacity={m.op * 0.6} />
            );
          })}

          {/* ── FORESTS ── */}
          {forests.map((t, i) => (
            <g key={`tree-${i}`} opacity={0.6 + sr("fo", i) * 0.3}>
              <circle cx={t.x} cy={t.y} r={t.r} fill="#0d2218" stroke="#112b1e" strokeWidth="1" />
              <circle cx={t.x} cy={t.y} r={t.r * 0.55} fill="#0f2c1e" opacity="0.7" />
            </g>
          ))}

          {/* ── TEAL RIVER PATHS ── */}
          {placed.map((src, i) => {
            const dst = placed[i + 1];
            if (!dst) return null;
            const active = src.status !== "locked";
            const cpx1 = src.x + (dst.x - src.x) * 0.4 + (sr(src.id, 3) - 0.5) * 200;
            const cpy1 = src.y + (dst.y - src.y) * 0.1 + (sr(src.id, 4) - 0.5) * 150;
            const cpx2 = src.x + (dst.x - src.x) * 0.6 + (sr(dst.id, 3) - 0.5) * 200;
            const cpy2 = src.y + (dst.y - src.y) * 0.9 + (sr(dst.id, 4) - 0.5) * 150;
            const d = `M ${src.x} ${src.y} C ${cpx1} ${cpy1}, ${cpx2} ${cpy2}, ${dst.x} ${dst.y}`;
            return (
              <g key={`rp-${src.id}`}>
                <path d={d} fill="none" stroke={active ? "#083030" : "#0d1a1a"} strokeWidth="12" />
                {active && <path d={d} fill="none" stroke="#0dd3c5" strokeWidth="3"
                  strokeDasharray={dst.status === "locked" ? "14 9" : "none"}
                  filter="url(#f-teal)" opacity="0.9" />}
                {active && <path d={d} fill="none" stroke="#40f5e8" strokeWidth="1.2" opacity="0.4" />}
                {!active && <path d={d} fill="none" stroke="#1e3a3a" strokeWidth="1.8"
                  strokeDasharray="8 10" opacity="0.3" />}
              </g>
            );
          })}

          {/* Subtopic branch paths */}
          {placed.flatMap((mod) =>
            mod.subtopics.map((sub) => {
              const active = sub.status !== "locked";
              const cpx = (mod.x + sub.x) / 2 + (sr(sub.id, 5) - 0.5) * 45;
              const cpy = (mod.y + sub.y) / 2 + (sr(sub.id, 6) - 0.5) * 45;
              return (
                <path key={`sp-${sub.id}`}
                  d={`M ${mod.x} ${mod.y} Q ${cpx} ${cpy} ${sub.x} ${sub.y}`}
                  fill="none"
                  stroke={active ? "#0dd3c5" : "#1e3a3a"}
                  strokeWidth={active ? 2 : 1}
                  strokeDasharray={sub.status === "locked" ? "5 6" : "none"}
                  filter={active ? "url(#f-teal)" : "none"}
                  opacity={active ? 0.65 : 0.25} />
              );
            })
          )}

          {/* ── PURPLE FOG OF WAR ── */}
          {/* Fog clouds for locked areas */}
          {placed.filter(p => p.status === "locked").map((p) => (
            <g key={`fog-cloud-${p.id}`}>
              <circle cx={p.x} cy={p.y} r={300} fill="#1a0a2e" filter="url(#f-fog)" opacity="0.55" />
              <circle cx={p.x} cy={p.y} r={180} fill="#2d0a4e" filter="url(#f-fog)" opacity="0.35" />
            </g>
          ))}
          {/* Dark uniform fog overlay with clear holes for unlocked nodes */}
          <rect x="-20000" y="-20000" width="60000" height="60000"
            fill="rgba(5,4,14,0.88)" mask="url(#fog-mask)" pointerEvents="none" />

          {/* ── SUBTOPIC NODES ── */}
          {placed.flatMap((mod) =>
            mod.subtopics.map((sub) => {
              const active = sub.status !== "locked";
              const sc = sub.status === "completed" ? { s: "#c8860a", f: "#1a1000" }
                : sub.status === "current" ? { s: "#f59e0b", f: "#120d00" }
                : { s: "#334155", f: "#080c14" };
              return (
                <g key={sub.id} transform={`translate(${sub.x},${sub.y})`}
                  style={{ cursor: active ? "pointer" : "default" }}
                  onClick={(e) => { e.stopPropagation(); if (active) onTopicClick(sub.id); }}>
                  <circle r={15} fill={sc.f} stroke={sc.s} strokeWidth={active ? 2.5 : 1.5}
                    filter={active ? "url(#f-teal)" : "none"} opacity={active ? 1 : 0.4} />
                  <circle r={5} fill={sc.s} opacity={active ? 0.9 : 0.25} />
                  <text y={27} textAnchor="middle" fill={active ? "#a5f3fc" : "#334155"}
                    fontSize={11} fontWeight={600}
                    style={{ paintOrder: "stroke fill", stroke: "#06080f", strokeWidth: 3 }}>
                    {sub.title.length > 18 ? sub.title.slice(0, 17) + "…" : sub.title}
                  </text>
                </g>
              );
            })
          )}

          {/* ── MODULE NODES ── */}
          {placed.map((mod) => {
            const isC = mod.status === "completed";
            const isA = mod.status === "current";
            const isL = mod.status === "locked";
            const stroke = isC ? "#c8860a" : isA ? "#f59e0b" : "#334155";
            const glow = isC ? "#f5a623" : isA ? "#fbbf24" : "#475569";
            const fill = isC ? "#1a1000" : isA ? "#120d00" : "#08090f";
            const textCol = isC ? "#fde68a" : isA ? "#fef3c7" : "#64748b";

            return (
              <g key={mod.id} transform={`translate(${mod.x},${mod.y})`}
                style={{ cursor: isL ? "default" : "pointer" }}
                onClick={(e) => handleTopicClick(mod, e)}>

                {/* Pulse rings — current node */}
                {isA && (
                  <>
                    <circle cx="0" cy="0" r="44" fill="none" stroke="#f59e0b" strokeWidth="2.5" className="rp1" />
                    <circle cx="0" cy="0" r="44" fill="none" stroke="#fbbf24" strokeWidth="1.5" className="rp2" />
                  </>
                )}

                {/* Outer glow disc */}
                {!isL && (
                  <circle r={isC ? 54 : 48} fill={glow}
                    filter={isA ? "url(#f-amber)" : "url(#f-gold)"}
                    opacity={isA ? 0.38 : 0.2} />
                )}

                {/* Base circle */}
                <circle r={40} fill={fill} stroke={stroke}
                  strokeWidth={isA ? 4 : isC ? 3.5 : 2}
                  filter={!isL ? (isA ? "url(#f-amber)" : "url(#f-gold)") : "none"}
                  opacity={isL ? 0.45 : 1} />

                {/* Inner ring */}
                <circle r={27} fill="none" stroke={stroke} strokeWidth={1.2}
                  strokeDasharray={isL ? "4 4" : "none"} opacity={isL ? 0.25 : 0.55} />

                {/* Castle icon */}
                {!isL && (
                  <g className={isC ? "cbob" : ""} opacity={isC ? 1 : 0.9}>
                    {/* Main tower */}
                    <rect x={-9} y={-13} width={18} height={17} rx={1}
                      fill={isA ? "#3d1f00" : "#2a1800"} stroke={stroke} strokeWidth={1.2} />
                    {/* Battlements */}
                    {([-8, -3, 2, 7] as number[]).map((bx) => (
                      <rect key={bx} x={bx} y={-19} width={4} height={7} rx={0.5}
                        fill={isA ? "#3d1f00" : "#2a1800"} stroke={stroke} strokeWidth={1} />
                    ))}
                    {/* Gate arch */}
                    <path d="M -5 4 L -5 -2 Q 0 -7 5 -2 L 5 4 Z" fill={glow} opacity={0.75} />
                    {/* Side towers */}
                    <rect x={-17} y={-8} width={9} height={13} rx={1}
                      fill={isA ? "#3d1f00" : "#2a1800"} stroke={stroke} strokeWidth={1} />
                    <rect x={-16} y={-14} width={4} height={7} rx={0.5}
                      fill={isA ? "#3d1f00" : "#2a1800"} stroke={stroke} strokeWidth={1} />
                    <rect x={8} y={-8} width={9} height={13} rx={1}
                      fill={isA ? "#3d1f00" : "#2a1800"} stroke={stroke} strokeWidth={1} />
                    <rect x={12} y={-14} width={4} height={7} rx={0.5}
                      fill={isA ? "#3d1f00" : "#2a1800"} stroke={stroke} strokeWidth={1} />
                    {/* Glow windows */}
                    {([[0, -5], [-12, -3], [12, -3]] as [number, number][]).map(([wx, wy]) => (
                      <circle key={`${wx}${wy}`} cx={wx} cy={wy} r={2.5}
                        fill={glow} opacity={0.9} filter="url(#f-gold)" />
                    ))}
                  </g>
                )}

                {/* Lock icon */}
                {isL && (
                  <g opacity={0.4}>
                    <rect x={-7} y={-4} width={14} height={11} rx={2}
                      fill="#1e293b" stroke="#334155" strokeWidth={1.5} />
                    <path d="M -4 -4 Q -4 -13 0 -13 Q 4 -13 4 -4"
                      fill="none" stroke="#334155" strokeWidth={2} />
                    <circle cx={0} cy={2} r={2.5} fill="#334155" />
                  </g>
                )}

                {/* Module badge */}
                <text y={-47} textAnchor="middle"
                  fill={isL ? "#334155" : "#0dd3c5"}
                  fontSize={9} fontWeight={800} letterSpacing="0.15em"
                  opacity={isL ? 0.35 : 0.8}
                  style={{ paintOrder: "stroke fill", stroke: "#06080f", strokeWidth: 2 }}>
                  {`M ${mod.id.replace(/^m/, "").padStart(2, "0")}`}
                </text>

                {/* Module title */}
                <text y={60} textAnchor="middle"
                  fill={textCol} fontSize={13} fontWeight={700}
                  opacity={isL ? 0.35 : 1}
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

export type { Topic as FantasyTopic };
