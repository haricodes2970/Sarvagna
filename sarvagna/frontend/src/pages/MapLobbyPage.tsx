/**
 * MapLobbyPage — PUBG-style map skin selector before entering a module.
 * User picks one of 6 static fantasy map backgrounds, then launches the module map.
 */
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Swords, ChevronRight } from "lucide-react";
import { mapSelectionApi, modulemapApi } from "@/lib/api";

const MAPS = [
  { id: "map1", name: "The Verdant Realm",  flavor: "Ancient forests & mystical rivers" },
  { id: "map2", name: "The Iron Citadel",   flavor: "Fortress of dark stone & fire" },
  { id: "map3", name: "The Frozen Wastes",  flavor: "Tundra beyond the northern wall" },
  { id: "map4", name: "The Desert Sands",   flavor: "Lost temples beneath burning skies" },
  { id: "map5", name: "The Storm Coast",    flavor: "Cliffs battered by arcane lightning" },
  { id: "map6", name: "The Shadow Vale",    flavor: "Where light fears to tread" },
];

export default function MapLobbyPage() {
  const { subjectId, moduleNumber } = useParams<{ subjectId: string; moduleNumber: string }>();
  const navigate = useNavigate();
  const modNum = Number(moduleNumber);

  // Fetch module title
  const { data: moduleData } = useQuery({
    queryKey: ["modulemap", subjectId, moduleNumber],
    queryFn: () => modulemapApi.getModuleMap(subjectId!, modNum).then((r) => r.data),
    enabled: !!subjectId && Number.isFinite(modNum),
  });

  // Fetch previously saved map for this module
  const { data: savedSelection } = useQuery({
    queryKey: ["mapselection", subjectId, moduleNumber],
    queryFn: () => mapSelectionApi.getSelectedMap(subjectId!, modNum).then((r) => r.data),
    enabled: !!subjectId && Number.isFinite(modNum),
  });

  const defaultMapId = `map${((modNum - 1) % 6) + 1}`;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Use saved selection, then local state, then default
  const activeMapId = selectedId ?? savedSelection?.selected_map ?? defaultMapId;
  const activeMap = MAPS.find((m) => m.id === activeMapId) ?? MAPS[0];

  // Save + navigate
  const { mutate: begin, isPending } = useMutation({
    mutationFn: () =>
      mapSelectionApi.saveSelectedMap(subjectId!, modNum, activeMapId).then((r) => r.data),
    onSuccess: () => navigate(`/modulemap/${subjectId}/${moduleNumber}`),
    onError: () => navigate(`/modulemap/${subjectId}/${moduleNumber}`), // still proceed on error
  });

  const moduleTitle = moduleData?.module_title ?? `Module ${moduleNumber}`;
  const subjectName = moduleData?.subject_name ?? "Subject";

  return (
    <div className="h-screen bg-[#06080e] text-white flex flex-col overflow-hidden">

      {/* ── Header ── */}
      <div className="shrink-0 z-20 bg-black/70 backdrop-blur border-b border-white/5 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(`/map/${subjectId}`)}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-500">
            Select Your Realm
          </p>
          <h1 className="text-sm font-bold truncate text-white/90">
            {subjectName} · {moduleTitle}
          </h1>
        </div>
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-600">
          Map Lobby
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left — large map preview */}
        <div className="relative flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.img
              key={activeMapId}
              src={`/maps/${activeMapId}.jpg`}
              alt={activeMap.name}
              className="absolute inset-0 w-full h-full object-cover"
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            />
          </AnimatePresence>

          {/* Dark gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#06080e] via-[#06080e]/30 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#06080e]/60 via-transparent to-[#06080e]" />

          {/* Map name overlay (bottom-left) */}
          <motion.div
            key={`label-${activeMapId}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="absolute bottom-8 left-8 z-10"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-400 mb-1">
              Selected Realm
            </p>
            <h2 className="text-3xl font-black text-white drop-shadow-lg leading-tight">
              {activeMap.name}
            </h2>
            <p className="text-sm text-slate-400 mt-1 italic">{activeMap.flavor}</p>
          </motion.div>
        </div>

        {/* Right — map selection panel */}
        <div
          className="w-72 shrink-0 flex flex-col border-l border-white/5"
          style={{ background: "rgba(6,8,14,0.95)", backdropFilter: "blur(12px)" }}
        >
          <div className="px-4 pt-4 pb-2">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              Choose Realm
            </p>
          </div>

          {/* Map tiles */}
          <div className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-2">
            {MAPS.map((m, i) => {
              const isActive = m.id === activeMapId;
              return (
                <motion.button
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.25 }}
                  className="relative w-full rounded-xl overflow-hidden border transition-all text-left"
                  style={{
                    borderColor: isActive ? "rgba(245,158,11,0.7)" : "rgba(255,255,255,0.06)",
                    boxShadow: isActive ? "0 0 16px rgba(245,158,11,0.25)" : "none",
                  }}
                >
                  {/* Thumbnail */}
                  <div className="relative h-16 overflow-hidden">
                    <img
                      src={`/maps/${m.id}.jpg`}
                      alt={m.name}
                      className="w-full h-full object-cover transition-transform duration-300"
                      style={{ transform: isActive ? "scale(1.05)" : "scale(1)" }}
                    />
                    <div
                      className="absolute inset-0"
                      style={{
                        background: isActive
                          ? "linear-gradient(135deg, rgba(245,158,11,0.15), transparent)"
                          : "linear-gradient(135deg, rgba(0,0,0,0.5), rgba(0,0,0,0.2))",
                      }}
                    />
                    {/* Map number badge */}
                    <div
                      className="absolute top-1.5 left-1.5 w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black"
                      style={{
                        background: isActive ? "#f59e0b" : "rgba(0,0,0,0.6)",
                        color: isActive ? "#000" : "#94a3b8",
                      }}
                    >
                      {i + 1}
                    </div>
                    {/* Active checkmark */}
                    {isActive && (
                      <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                        <svg viewBox="0 0 10 8" className="w-2.5 h-2.5" fill="none">
                          <path d="M1 4l3 3 5-6" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </div>
                  {/* Label */}
                  <div
                    className="px-2.5 py-1.5"
                    style={{ background: isActive ? "rgba(245,158,11,0.08)" : "rgba(10,12,20,0.9)" }}
                  >
                    <p
                      className="text-[11px] font-bold truncate"
                      style={{ color: isActive ? "#fde68a" : "#cbd5e1" }}
                    >
                      {m.name}
                    </p>
                  </div>
                </motion.button>
              );
            })}
          </div>

          {/* BEGIN CONQUEST button */}
          <div className="shrink-0 p-4 border-t border-white/5">
            <motion.button
              onClick={() => begin()}
              disabled={isPending}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="w-full py-4 rounded-xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2.5 transition-all"
              style={{
                background: isPending
                  ? "rgba(100,80,10,0.4)"
                  : "linear-gradient(135deg, #f59e0b, #d97706)",
                color: isPending ? "#a16207" : "#000",
                boxShadow: isPending ? "none" : "0 0 28px rgba(245,158,11,0.35)",
              }}
            >
              {isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-amber-700 border-t-amber-400 rounded-full animate-spin" />
                  Entering…
                </>
              ) : (
                <>
                  <Swords size={16} />
                  Begin Conquest
                  <ChevronRight size={14} />
                </>
              )}
            </motion.button>
            <p className="text-center text-[10px] text-slate-600 mt-2 uppercase tracking-wider font-bold">
              {activeMap.name}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
