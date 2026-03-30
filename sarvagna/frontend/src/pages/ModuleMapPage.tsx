import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";

import { mapimageApi, modulemapApi, type ModuleMapResponse, type ModuleMapStatus, type ModuleMapTopic } from "@/lib/api";

type HotspotStatus = ModuleMapStatus;

const W = 1000; // overlay viewBox width
const H = 625; // overlay viewBox height (match image aspect ~1.6)

function seededRand(seed: string, index: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  h = Math.imul(h ^ (index * 2654435761), 1664525) >>> 0;
  return (h & 0xffff) / 0xffff;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

type Hotspot = {
  id: string;
  title: string;
  status: HotspotStatus;
  x: number;
  y: number;
  r: number;
};

export default function ModuleMapPage() {
  const { subjectId, moduleNumber } = useParams<{ subjectId: string; moduleNumber: string }>();
  const navigate = useNavigate();

  const modNum = useMemo(() => Number(moduleNumber), [moduleNumber]);
  const enabled = !!subjectId && Number.isFinite(modNum);

  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

  const { data: moduleMapData, isLoading: isModuleMapLoading } = useQuery({
    queryKey: ["modulemap", subjectId, moduleNumber],
    queryFn: () => modulemapApi.getModuleMap(subjectId!, modNum).then((r) => r.data as ModuleMapResponse),
    enabled,
  });

  const { data: imageData, isLoading: isImageLoading } = useQuery({
    queryKey: ["mapimage", subjectId, moduleNumber],
    queryFn: () => mapimageApi.getModuleImage(subjectId!, modNum).then((r) => r.data),
    enabled,
  });

  const imageUrl = imageData?.image_url;

  const handleTopicClick = useCallback((topicId: string, status?: HotspotStatus) => {
    setSelectedTopicId(topicId);
    if (status === "locked") toast("🔒 Locked topic", { duration: 900 });
    else toast(`Selected: ${topicId}`, { duration: 900 });
  }, []);

  const subjectName = moduleMapData?.subject_name ?? "Subject";
  const moduleTitle = moduleMapData?.module_title ?? `Module ${moduleMapData?.module_number ?? moduleNumber}`;

  const hotspots = useMemo<Hotspot[]>(() => {
    if (!moduleMapData) return [];
    const topics = moduleMapData.topics ?? [];
    if (!topics.length) return [];

    const moduleTopic: ModuleMapTopic = topics[0] as ModuleMapTopic;
    const subtopics = moduleTopic.subtopics ?? [];
    const cx = W / 2;
    const cy = H / 2;

    const out: Hotspot[] = [];

    // Main module castle hotspot.
    out.push({
      id: moduleTopic.id,
      title: moduleTopic.title,
      status: moduleTopic.status,
      x: cx,
      y: cy,
      r: 22,
    });

    // Subtopic hotspots spread in an organic ring around the module.
    const n = Math.max(1, subtopics.length);
    for (let i = 0; i < subtopics.length; i++) {
      const st = subtopics[i];
      const angle = i * (2 * Math.PI / n) + (seededRand(st.id, 0) - 0.5) * 0.9;
      const radius = 190 + seededRand(st.id, 1) * 190;
      const jitterX = (seededRand(st.id, 2) - 0.5) * 18;
      const jitterY = (seededRand(st.id, 3) - 0.5) * 12;

      const x = clamp(cx + Math.cos(angle) * radius + jitterX, 90, W - 90);
      const y = clamp(cy + Math.sin(angle) * radius * 0.55 + jitterY, 70, H - 70);

      out.push({
        id: st.id,
        title: st.title,
        status: st.status,
        x,
        y,
        r: st.status === "locked" ? 12 : 14,
      });
    }

    return out;
  }, [moduleMapData]);

  if (isModuleMapLoading) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Loading module map…</p>
      </div>
    );
  }

  if (!moduleMapData) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Module map not found.</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#09090b] text-zinc-100 flex flex-col">
      {/* Header */}
      <div className="shrink-0 z-10 bg-black/80 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(`/map/${subjectId}`)}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold truncate">
            {subjectName} — Module {moduleMapData.module_number}
          </h1>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold truncate">{moduleTitle}</p>
        </div>
        {selectedTopicId ? (
          <div className="text-[10px] text-amber-500 font-black uppercase tracking-widest">{selectedTopicId}</div>
        ) : (
          <div className="text-[10px] text-zinc-700 uppercase tracking-widest font-black">Module Realm</div>
        )}
      </div>

      {/* Map canvas (image background + SVG hotspots) */}
      <div className="flex-1 relative overflow-hidden">
        {(!imageUrl || isImageLoading) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="px-5 py-4 rounded-2xl bg-black/40 backdrop-blur-md border border-slate-800 flex flex-col items-center gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-amber-500/40 border-t-amber-500 animate-spin" />
              <p className="text-sm text-slate-200">Generating fantasy map…</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">This may take ~10-20s</p>
            </div>
          </div>
        )}

        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-slate-950" />
        )}

        {/* Hotspots */}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full z-20"
        >
          <defs>
            <filter id="goldGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="amberGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" result="blur2" />
              <feMerge>
                <feMergeNode in="blur2" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <style>{`
              @keyframes pulseGold { 
                0% { transform: scale(0.95); opacity: 0.85; } 
                70% { transform: scale(1.55); opacity: 0; } 
                100% { transform: scale(1.55); opacity: 0; } 
              }
              @keyframes pulseAmber { 
                0% { transform: scale(0.9); opacity: 0.75; } 
                70% { transform: scale(1.35); opacity: 0; } 
                100% { transform: scale(1.35); opacity: 0; } 
              }
              .pulseRing {
                transform-box: fill-box;
                transform-origin: center;
                animation: pulseAmber 2.2s ease-out infinite;
              }
              .pulseRing.gold {
                animation: pulseGold 2.4s ease-out infinite;
              }
            `}</style>
          </defs>

          {hotspots.map((h) => {
            const isCompleted = h.status === "completed";
            const isCurrent = h.status === "current";
            const isLocked = h.status === "locked";

            const baseFill = isLocked ? "#0b1220" : isCompleted ? "#1a1000" : "#120d00";
            const baseStroke = isLocked ? "#334155" : isCompleted ? "#c8860a" : "#f59e0b";
            const glow = isCompleted ? "url(#goldGlow)" : isCurrent ? "url(#amberGlow)" : "none";
            const ringColor = isCompleted ? "#f5a623" : "#fbbf24";

            return (
              <g
                key={h.id}
                transform={`translate(${h.x} ${h.y})`}
                style={{ cursor: "pointer" }}
                onClick={() => handleTopicClick(h.id, h.status)}
              >
                <title>{h.title}</title>

                {/* base */}
                <circle
                  r={h.r}
                  fill={baseFill}
                  stroke={baseStroke}
                  strokeWidth={isLocked ? 2 : 2.5}
                  filter={glow}
                  opacity={isLocked ? 0.35 : 1}
                />
                <circle
                  r={Math.max(5, h.r - 8)}
                  fill={isLocked ? "#334155" : isCompleted ? "#fde68a" : "#fef3c7"}
                  opacity={isLocked ? 0.3 : 0.85}
                />

                {/* pulse ring */}
                {(isCompleted || isCurrent) && (
                  <circle
                    className={`pulseRing${isCompleted ? " gold" : ""}`}
                    r={Math.max(12, h.r + 10)}
                    fill="none"
                    stroke={ringColor}
                    strokeWidth={isCompleted ? 3 : 2.4}
                    opacity={isCurrent ? 0.9 : 0.95}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Bottom-right action */}
        <button
          onClick={() => navigate(`/chat/${subjectId}/${moduleNumber}`)}
          className="absolute bottom-4 right-4 z-30 px-6 py-4 rounded-2xl bg-amber-500 text-black font-black text-sm hover:bg-amber-400 transition-colors shadow-[0_0_0_2px_rgba(245,158,11,0.2)]"
        >
          Let's Start
        </button>
      </div>
    </div>
  );
}

