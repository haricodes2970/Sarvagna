import React, { useEffect, useMemo, useRef, useState } from 'react';

// --- Types ---
export type NodeStatus = 'completed' | 'current' | 'locked';

export interface Subtopic {
  id: string;
  title: string;
  status: NodeStatus;
}

export interface Module {
  id: string;
  title: string;
  status: NodeStatus;
  subtopics: Subtopic[];
}

export interface GameWorldMapProps {
  modules?: Module[];
  onNodeClick?: (node: Module | Subtopic, type: 'module' | 'subtopic') => void;
}

// --- Dummy Data (if no props provided) ---
const defaultModules: Module[] = [
  {
    id: 'm1',
    title: 'Foundations of Compute',
    status: 'completed',
    subtopics: [
      { id: 's1', title: 'Variables', status: 'completed' },
      { id: 's2', title: 'Data Types', status: 'completed' },
      { id: 's3', title: 'Operators', status: 'completed' },
    ],
  },
  {
    id: 'm2',
    title: 'Control Structures',
    status: 'completed',
    subtopics: [
      { id: 's4', title: 'If/Else', status: 'completed' },
      { id: 's5', title: 'Switch', status: 'completed' },
      { id: 's6', title: 'Loops', status: 'completed' },
    ],
  },
  {
    id: 'm3',
    title: 'Data Structures',
    status: 'current',
    subtopics: [
      { id: 's7', title: 'Arrays', status: 'completed' },
      { id: 's8', title: 'Hash Maps', status: 'current' },
      { id: 's9', title: 'Linked Lists', status: 'locked' },
      { id: 's10', title: 'Trees', status: 'locked' },
    ],
  },
  {
    id: 'm4',
    title: 'Advanced Algorithms',
    status: 'locked',
    subtopics: [
      { id: 's11', title: 'Sorting', status: 'locked' },
      { id: 's12', title: 'Search', status: 'locked' },
      { id: 's13', title: 'Dynamic Programming', status: 'locked' },
    ],
  },
  {
    id: 'm5',
    title: 'System Design',
    status: 'locked',
    subtopics: [
      { id: 's14', title: 'Scaling', status: 'locked' },
      { id: 's15', title: 'Databases', status: 'locked' },
    ],
  },
];

// --- Map Generator Math ---
const SPACING_X = 400;
const START_X = 1000;
const START_Y = 2000;

// Generates stable coordinates for organic map layout
const generateMapLayout = (modules: Module[]) => {
  return modules.map((mod, i) => {
    const x = START_X + i * SPACING_X;
    // Winding sine-wave path for the main modules
    const y = START_Y + Math.sin(i * 1.2) * 350 + Math.cos(i * 0.5) * 150;

    const subtopics = mod.subtopics.map((sub, j) => {
      // Fan out subtopics in an organic circle around the main module
      const angle = (j / mod.subtopics.length) * Math.PI * 2 + (i * 0.8);
      const radius = 120 + (j % 2 === 0 ? 25 : -10); // varied distance
      return {
        ...sub,
        x: x + Math.cos(angle) * radius,
        y: y + Math.sin(angle) * radius,
      };
    });

    return { ...mod, x, y, subtopics };
  });
};

export default function GameWorldMap({
  modules = defaultModules,
  onNodeClick = (node) => console.log('Clicked:', node.title),
}: GameWorldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // --- State ---
  const mapData = useMemo(() => generateMapLayout(modules), [modules]);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 0.8 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const transformRef = useRef(transform);
  transformRef.current = transform;

  // --- Initial Centering ---
  const centerOnCurrentNode = () => {
    const currentMod = mapData.find((m) => m.status === 'current') || mapData[0];
    if (currentMod && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const scale = 0.8;
      setTransform({
        x: rect.width / 2 - currentMod.x * scale,
        y: rect.height / 2 - currentMod.y * scale,
        scale,
      });
    }
  };

  useEffect(() => {
    centerOnCurrentNode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapData]);

  // --- Pan & Zoom Handlers ---
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    // We use a manual event listener for wheel to cleanly prevent default browser scroll
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const current = transformRef.current;
      const newScale = Math.max(0.15, Math.min(current.scale * zoomFactor, 3));

      // Zoom towards mouse cursor
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const scaleRatio = newScale / current.scale;
      const newX = mouseX - (mouseX - current.x) * scaleRatio;
      const newY = mouseY - (mouseY - current.y) * scaleRatio;

      setTransform({ x: newX, y: newY, scale: newScale });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => setIsDragging(false);

  // --- Visual Helpers ---
  const getStatusColors = (status: NodeStatus) => {
    switch (status) {
      case 'completed': return { base: '#06b6d4', glow: '#22d3ee', path: '#0891b2', text: '#cffafe' };
      case 'current': return { base: '#f59e0b', glow: '#fbbf24', path: '#d97706', text: '#fef3c7' };
      case 'locked': return { base: '#334155', glow: '#475569', path: '#1e293b', text: '#94a3b8' };
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[600px] overflow-hidden bg-slate-950 font-sans select-none"
    >
      {/* UI Overlay */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <div className="bg-slate-900/80 backdrop-blur border border-slate-700 p-4 rounded-xl shadow-2xl">
          <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400">
            Sarvagna Realm
          </h1>
          <p className="text-sm text-slate-400 mt-1">Drag to pan, Scroll to zoom</p>
          <button
            onClick={centerOnCurrentNode}
            className="mt-3 w-full py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 text-sm font-semibold rounded-lg transition-colors border border-slate-600"
          >
            Locate Current
          </button>
        </div>
      </div>

      <svg
        ref={svgRef}
        className={`w-full h-full outline-none touch-none ${
          isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <defs>
          {/* Blueprint Grid Pattern */}
          <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgba(34, 211, 238, 0.05)" strokeWidth="1" />
            <circle cx="80" cy="80" r="1.5" fill="rgba(34, 211, 238, 0.15)" />
          </pattern>

          {/* Glow Filters */}
          <filter id="glow-completed" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="glow-current" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="15" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Fog Gradient Hole Maker */}
          <radialGradient id="fog-hole" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="black" stopOpacity="1" />
            <stop offset="40%" stopColor="black" stopOpacity="0.8" />
            <stop offset="100%" stopColor="white" stopOpacity="1" />
          </radialGradient>

          {/* Fog of War Mask */}
          <mask id="fog-mask">
            {/* White means fog is visible */}
            <rect x="-10000" y="-10000" width="20000" height="20000" fill="white" />
            {/* Punch holes for non-locked modules */}
            {mapData.map((m) => {
              if (m.status === 'locked') return null;
              // Hole size is larger for current module
              const radius = m.status === 'current' ? 900 : 700;
              return <circle key={`hole-${m.id}`} cx={m.x} cy={m.y} r={radius} fill="url(#fog-hole)" />;
            })}
          </mask>

          {/* Inline CSS for specific animations */}
          <style>
            {`
              .pulse-ring { transform-origin: center; animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
              .spin-slow { transform-origin: center; animation: spin 10s linear infinite; }
              @keyframes pulse {
                0% { transform: scale(0.9); opacity: 0.8; }
                50% { transform: scale(1.4); opacity: 0; }
                100% { transform: scale(0.9); opacity: 0; }
              }
              @keyframes spin {
                100% { transform: rotate(360deg); }
              }
              .map-text { paint-order: stroke fill; stroke: #020617; stroke-width: 4px; stroke-linejoin: round; }
            `}
          </style>
        </defs>

        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
          {/* Background Grid Layer */}
          <rect x="-10000" y="-10000" width="20000" height="20000" fill="url(#grid)" />

          {/* Fog Layer (rendered below interactive nodes, over the grid) */}
          <rect
            x="-10000"
            y="-10000"
            width="20000"
            height="20000"
            fill="rgba(2, 6, 23, 0.95)"
            mask="url(#fog-mask)"
            pointerEvents="none"
          />

          {/* --- PATHS LAYER --- */}
          {mapData.map((mod, i) => {
            const nextMod = mapData[i + 1];
            const modColors = getStatusColors(mod.status);

            return (
              <g key={`paths-${mod.id}`}>
                {/* Module to Module Path */}
                {nextMod && (
                  <path
                    d={`M ${mod.x} ${mod.y} C ${(mod.x + nextMod.x) / 2} ${mod.y}, ${(mod.x + nextMod.x) / 2} ${nextMod.y}, ${nextMod.x} ${nextMod.y}`}
                    fill="none"
                    stroke={nextMod.status === 'locked' ? '#1e293b' : modColors.path}
                    strokeWidth="8"
                    strokeDasharray={nextMod.status === 'locked' ? '10 10' : 'none'}
                    opacity="0.6"
                  />
                )}

                {/* Module to Subtopics Paths */}
                {mod.subtopics.map((sub) => {
                  const subColors = getStatusColors(sub.status);
                  return (
                    <path
                      key={`path-${sub.id}`}
                      d={`M ${mod.x} ${mod.y} Q ${(mod.x + sub.x) / 2 + 30} ${(mod.y + sub.y) / 2 - 30} ${sub.x} ${sub.y}`}
                      fill="none"
                      stroke={subColors.path}
                      strokeWidth="3"
                      strokeDasharray={sub.status === 'locked' ? '5 5' : 'none'}
                      opacity="0.8"
                    />
                  );
                })}
              </g>
            );
          })}

          {/* --- NODES LAYER --- */}
          {mapData.map((mod) => {
            const colors = getStatusColors(mod.status);
            const isCurrent = mod.status === 'current';
            const isLocked = mod.status === 'locked';

            return (
              <g key={`nodes-${mod.id}`}>
                {/* Subtopic Nodes */}
                {mod.subtopics.map((sub) => {
                  const subColors = getStatusColors(sub.status);
                  return (
                    <g
                      key={sub.id}
                      transform={`translate(${sub.x}, ${sub.y})`}
                      className="cursor-pointer transition-transform hover:scale-110 active:scale-95"
                      onClick={(e) => { e.stopPropagation(); onNodeClick(sub, 'subtopic'); }}
                    >
                      {/* Subtopic Point */}
                      <circle
                        r="12"
                        fill="#0f172a"
                        stroke={subColors.base}
                        strokeWidth="3"
                        filter={sub.status !== 'locked' ? 'url(#glow-completed)' : ''}
                      />
                      <circle r="4" fill={subColors.base} />

                      {/* Subtopic Label */}
                      <text
                        y="30"
                        textAnchor="middle"
                        fill={subColors.text}
                        fontSize="16"
                        fontWeight="600"
                        className="map-text drop-shadow-md tracking-wide"
                        opacity={sub.status === 'locked' ? 0.5 : 1}
                      >
                        {sub.title}
                      </text>
                    </g>
                  );
                })}

                {/* Main Module Node */}
                <g
                  transform={`translate(${mod.x}, ${mod.y})`}
                  className="cursor-pointer transition-transform hover:scale-105 active:scale-95"
                  onClick={(e) => { e.stopPropagation(); onNodeClick(mod, 'module'); }}
                >
                  {/* Outer glowing rings for Current node */}
                  {isCurrent && (
                    <>
                      <circle r="60" fill="none" stroke={colors.glow} strokeWidth="2" className="pulse-ring" />
                      <circle r="55" fill="none" stroke={colors.base} strokeWidth="1" strokeDasharray="6 6" className="spin-slow" />
                    </>
                  )}

                  {/* Main Node Shape */}
                  <circle
                    r="36"
                    fill="#020617"
                    stroke={colors.base}
                    strokeWidth="6"
                    filter={!isLocked ? (isCurrent ? 'url(#glow-current)' : 'url(#glow-completed)') : ''}
                  />

                  {/* Inner Diamond */}
                  <rect
                    x="-14"
                    y="-14"
                    width="28"
                    height="28"
                    fill={colors.base}
                    transform="rotate(45)"
                    opacity={isLocked ? 0.3 : 1}
                  />

                  {/* Module Label */}
                  <text
                    y="65"
                    textAnchor="middle"
                    fill={colors.text}
                    fontSize="24"
                    fontWeight="800"
                    className="map-text uppercase tracking-widest drop-shadow-xl"
                    opacity={isLocked ? 0.6 : 1}
                  >
                    {mod.title}
                  </text>
                </g>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
