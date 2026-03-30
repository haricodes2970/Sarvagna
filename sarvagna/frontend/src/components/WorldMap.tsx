import { useRef, useState, useCallback, useEffect } from "react";
import toast from "react-hot-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LayoutNode {
  id: string;
  title: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  type: "capital" | "city" | "village";
  parent?: string;
}

export interface LayoutRoad {
  from: string;
  to: string;
  type: "river" | "path" | "dotted";
}

export interface MapLayout {
  capital: LayoutNode;
  cities: LayoutNode[];
  villages: LayoutNode[];
  roads: LayoutRoad[];
}

export type NodeStatus = "completed" | "current" | "locked";

export interface TopicStatus {
  id: string;
  status: NodeStatus;
}

interface WorldMapProps {
  layout: MapLayout;
  mapImage: string;
  topicStatuses: TopicStatus[];
  onNodeClick: (nodeId: string, nodeTitle: string) => void;
  /** Pixel dimensions of the SVG canvas */
  width?: number;
  height?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStatus(id: string, statuses: TopicStatus[]): NodeStatus {
  return statuses.find((s) => s.id === id)?.status ?? "locked";
}

function pct(val: number, total: number) {
  return (val / 100) * total;
}

// Cubic bezier control point for organic curved roads
function curvePath(
  x1: number, y1: number,
  x2: number, y2: number,
  curvature = 0.35
): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const cx = mx - dy * curvature;
  const cy = my + dx * curvature;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface NodeProps {
  node: LayoutNode;
  status: NodeStatus;
  svgW: number;
  svgH: number;
  onClick: () => void;
}

function MapNode({ node, status, svgW, svgH, onClick }: NodeProps) {
  const [hovered, setHovered] = useState(false);
  const cx = pct(node.x, svgW);
  const cy = pct(node.y, svgH);

  const r =
    node.type === "capital" ? 40
    : node.type === "city" ? 28
    : 16;

  // Colors by status
  const fillColor =
    status === "completed" ? "#f59e0b"
    : status === "current" ? "#f97316"
    : "#374151";

  const strokeColor =
    status === "completed" ? "#fde68a"
    : status === "current" ? "#fb923c"
    : "#4b5563";

  const glowFilter =
    status === "completed" ? "url(#golden-glow)"
    : status === "current" ? "url(#amber-glow)"
    : "none";

  const labelColor =
    status === "completed" ? "#fde68a"
    : status === "current" ? "#fb923c"
    : "#6b7280";

  const labelOpacity = status === "locked" ? 0.45 : 1;

  const scale = hovered && status !== "locked" ? 1.15 : 1;
  const fogOpacity = status === "locked" ? 0.55 : 0;

  const fontSize =
    node.type === "capital" ? 13
    : node.type === "city" ? 11
    : 9;

  const labelY = cy + r + 16;

  // Crown for capital completed
  const showCrown = node.type === "capital" && status === "completed";

  return (
    <g
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      transform={`translate(${cx} ${cy}) scale(${scale}) translate(-${cx} -${cy})`}
      style={{ cursor: status === "locked" ? "not-allowed" : "pointer", transition: "transform 0.15s" }}
    >
      {/* Fog of war dark overlay for locked */}
      {status === "locked" && (
        <circle
          cx={cx} cy={cy}
          r={r + 20}
          fill="url(#fog-radial)"
          opacity={fogOpacity}
          pointerEvents="none"
        />
      )}

      {/* Pulse ring for current */}
      {status === "current" && (
        <circle
          cx={cx} cy={cy}
          r={r + 8}
          fill="none"
          stroke="#f97316"
          strokeWidth={2}
          opacity={0.6}
          style={{ animation: "pulse-ring 2s ease-out infinite" }}
        />
      )}

      {/* Main node circle */}
      <circle
        cx={cx} cy={cy}
        r={r}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={node.type === "capital" ? 3 : 2}
        filter={glowFilter}
        opacity={status === "locked" ? 0.4 : 1}
      />

      {/* Inner detail circle */}
      <circle
        cx={cx} cy={cy}
        r={r * 0.55}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1}
        opacity={status === "locked" ? 0.3 : 0.6}
      />

      {/* Crown icon for completed capital */}
      {showCrown && (
        <text
          x={cx} y={cy + 5}
          textAnchor="middle"
          fontSize={r * 0.7}
          fill="#fde68a"
        >
          ♛
        </text>
      )}

      {/* Sword icon for city */}
      {node.type === "city" && status !== "locked" && (
        <text
          x={cx} y={cy + 4}
          textAnchor="middle"
          fontSize={r * 0.65}
          fill={strokeColor}
          opacity={0.9}
        >
          ⚔
        </text>
      )}

      {/* Dot for village */}
      {node.type === "village" && (
        <circle
          cx={cx} cy={cy}
          r={r * 0.3}
          fill={strokeColor}
          opacity={status === "locked" ? 0.3 : 0.8}
        />
      )}

      {/* Label */}
      <text
        x={cx}
        y={labelY}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight={node.type === "capital" ? "900" : node.type === "city" ? "700" : "500"}
        fill={labelColor}
        opacity={labelOpacity}
        style={{
          fontFamily: "serif",
          textShadow: "0 1px 3px rgba(0,0,0,0.9)",
          letterSpacing: node.type === "capital" ? "0.12em" : "0.04em",
          pointerEvents: "none",
        }}
      >
        {node.title.length > 22 ? node.title.slice(0, 20) + "…" : node.title}
      </text>

      {/* Tooltip on hover */}
      {hovered && node.title.length > 22 && (
        <foreignObject x={cx - 80} y={cy - r - 42} width={160} height={36}>
          <div
            style={{
              background: "rgba(0,0,0,0.85)",
              border: "1px solid #4b5563",
              borderRadius: 4,
              padding: "4px 8px",
              color: "#f3f4f6",
              fontSize: 11,
              textAlign: "center",
              lineHeight: 1.3,
            }}
          >
            {node.title}
          </div>
        </foreignObject>
      )}
    </g>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function WorldMap({
  layout,
  mapImage,
  topicStatuses,
  onNodeClick,
  width = 1400,
  height = 800,
}: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgW, setSvgW] = useState(width);
  const [svgH, setSvgH] = useState(height);

  // Resize SVG to match container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width: w, height: h } = entries[0].contentRect;
      if (w > 0) setSvgW(w);
      if (h > 0) setSvgH(h);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Pan state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    drag.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
  }, [pan]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const d = drag.current;
    if (!d) return;
    const nx = d.px + (e.clientX - d.sx);
    const ny = d.py + (e.clientY - d.sy);
    setPan({ x: nx, y: ny });
  }, []);

  const onMouseUp = useCallback(() => { drag.current = null; }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.min(3, Math.max(0.4, z - e.deltaY * 0.001)));
  }, []);

  // Build node lookup map
  const allNodes: LayoutNode[] = [layout.capital, ...layout.cities, ...layout.villages];
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

  const handleNodeClick = useCallback((node: LayoutNode) => {
    const status = getStatus(node.id, topicStatuses);
    if (status === "locked") {
      toast("Complete previous topics first 🔒", {
        style: { background: "#1a1a2e", color: "#f3f4f6", border: "1px solid #374151" },
      });
      return;
    }
    onNodeClick(node.id, node.title);
  }, [topicStatuses, onNodeClick]);

  // Determine road status: unlocked if both endpoints are not locked
  function roadStatus(road: LayoutRoad): "unlocked" | "locked" {
    const fromStatus = getStatus(road.from, topicStatuses);
    const toStatus = getStatus(road.to, topicStatuses);
    return (fromStatus === "locked" && toStatus === "locked") ? "locked" : "unlocked";
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
    >
      {/* Layer 1 — Background image */}
      <img
        src={mapImage}
        alt="fantasy map"
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        draggable={false}
      />

      {/* Dark vignette to improve node readability */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.55)_100%)]" />

      {/* SVG layers (pan + zoom transform applied here) */}
      <svg
        width={svgW}
        height={svgH}
        className="absolute inset-0"
        style={{ cursor: drag.current ? "grabbing" : "grab" }}
      >
        <defs>
          {/* Golden glow filter */}
          <filter id="golden-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
            <feColorMatrix in="blur" type="matrix"
              values="1 0.8 0 0 0  0.8 0.6 0 0 0  0 0 0 0 0  0 0 0 1.5 0"
              result="glow"
            />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Amber glow filter */}
          <filter id="amber-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix in="blur" type="matrix"
              values="1 0.6 0 0 0  0.5 0.3 0 0 0  0 0 0 0 0  0 0 0 1.2 0"
              result="glow"
            />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Teal river glow */}
          <filter id="teal-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feColorMatrix in="blur" type="matrix"
              values="0 0 0 0 0  0.7 1 0.9 0 0  0.7 1 1 0 0  0 0 0 1 0"
              result="glow"
            />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Fog radial gradient for locked nodes */}
          <radialGradient id="fog-radial" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1a0a2e" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#1a0a2e" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* CSS animations injected via style tag */}
        <style>{`
          @keyframes pulse-ring {
            0%   { transform: scale(1); opacity: 0.7; }
            100% { transform: scale(1.5); opacity: 0; }
          }
          @keyframes golden-pulse {
            0%, 100% { opacity: 1; }
            50%       { opacity: 0.7; }
          }
        `}</style>

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* Layer 2 — Fog of war circles behind locked areas */}
          {allNodes
            .filter((n) => getStatus(n.id, topicStatuses) === "locked")
            .map((n) => (
              <circle
                key={`fog-${n.id}`}
                cx={pct(n.x, svgW)}
                cy={pct(n.y, svgH)}
                r={n.type === "capital" ? 90 : n.type === "city" ? 65 : 40}
                fill="url(#fog-radial)"
                opacity={0.6}
                pointerEvents="none"
              />
            ))
          }

          {/* Layer 3 — Roads */}
          {layout.roads.map((road, i) => {
            const fromNode = nodeMap.get(road.from);
            const toNode = nodeMap.get(road.to);
            if (!fromNode || !toNode) return null;

            const x1 = pct(fromNode.x, svgW);
            const y1 = pct(fromNode.y, svgH);
            const x2 = pct(toNode.x, svgW);
            const y2 = pct(toNode.y, svgH);
            const unlocked = roadStatus(road) === "unlocked";

            const d = curvePath(x1, y1, x2, y2, road.type === "river" ? 0.25 : 0.15);

            if (road.type === "river") {
              return (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke={unlocked ? "#2dd4bf" : "#374151"}
                  strokeWidth={unlocked ? 3 : 1.5}
                  opacity={unlocked ? 0.9 : 0.15}
                  filter={unlocked ? "url(#teal-glow)" : "none"}
                  strokeLinecap="round"
                />
              );
            }
            if (road.type === "path") {
              return (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke={unlocked ? "#5eead4" : "#374151"}
                  strokeWidth={unlocked ? 1.5 : 1}
                  opacity={unlocked ? 0.75 : 0.15}
                  strokeLinecap="round"
                />
              );
            }
            // dotted
            return (
              <path
                key={i}
                d={d}
                fill="none"
                stroke={unlocked ? "#6b7280" : "#374151"}
                strokeWidth={1}
                strokeDasharray="5 5"
                opacity={unlocked ? 0.5 : 0.12}
                strokeLinecap="round"
              />
            );
          })}

          {/* Layer 4+5 — Nodes + Labels */}
          {allNodes.map((node) => (
            <MapNode
              key={node.id}
              node={node}
              status={getStatus(node.id, topicStatuses)}
              svgW={svgW}
              svgH={svgH}
              onClick={() => handleNodeClick(node)}
            />
          ))}
        </g>
      </svg>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-10">
        <button
          onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
          className="w-8 h-8 bg-black/70 border border-slate-700 text-white text-lg font-bold rounded hover:bg-black/90 transition-colors"
        >
          +
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
          className="w-8 h-8 bg-black/70 border border-slate-700 text-white text-lg font-bold rounded hover:bg-black/90 transition-colors"
        >
          −
        </button>
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          className="w-8 h-8 bg-black/70 border border-slate-700 text-slate-400 text-xs font-bold rounded hover:bg-black/90 transition-colors"
        >
          ⌖
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-1.5 bg-black/60 backdrop-blur-sm border border-slate-700 rounded-lg p-3">
        {[
          { color: "#f59e0b", label: "Completed" },
          { color: "#f97316", label: "Current" },
          { color: "#374151", label: "Locked" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: color }} />
            <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
