import { Handle, Position } from "react-flow-renderer";
import { Check, Lock, Play, Star } from "lucide-react";

export interface ModuleNodeData {
  moduleNumber: number;
  title: string;
  xp: number;
  status: "completed" | "current" | "locked";
  onClick: () => void;
}

export default function ModuleNode({ data }: { data: ModuleNodeData }) {
  const { moduleNumber, title, xp, status, onClick } = data;
  const isCompleted = status === "completed";
  const isCurrent = status === "current";
  const isLocked = status === "locked";

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-zinc-700 !border-zinc-600" />

      <div
        onClick={isLocked ? undefined : onClick}
        className={`
          relative w-48 p-4 rounded-2xl border transition-all duration-300 select-none
          ${isCompleted ? "bg-zinc-900 border-emerald-500/60 shadow-[0_0_20px_rgba(16,185,129,0.3)] cursor-pointer hover:border-emerald-500" : ""}
          ${isCurrent ? "bg-zinc-900 border-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.5)] cursor-pointer scale-105 animate-pulse" : ""}
          ${isLocked ? "bg-zinc-950 border-zinc-800/50 opacity-50 cursor-not-allowed" : ""}
        `}
      >
        {/* Fog of war overlay */}
        {isLocked && (
          <div className="absolute inset-0 rounded-2xl bg-black/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
            <Lock size={20} className="text-zinc-600" />
          </div>
        )}

        {/* Phase label */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
            Phase {String(moduleNumber).padStart(2, "0")}
          </span>
          <div className={`flex items-center gap-1 ${isLocked ? "text-zinc-700" : "text-amber-500"}`}>
            <Star size={10} className={!isLocked ? "fill-amber-500" : ""} />
            <span className="text-[10px] font-bold">{xp}</span>
          </div>
        </div>

        {/* Title */}
        <p className={`text-sm font-black leading-tight mb-3 ${isLocked ? "text-zinc-700" : "text-white"}`}>
          {title}
        </p>

        {/* Status icon */}
        <div className="flex justify-end">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center
            ${isCompleted ? "bg-emerald-500/20 text-emerald-500" : ""}
            ${isCurrent ? "bg-amber-500/20 text-amber-500" : ""}
            ${isLocked ? "bg-zinc-800 text-zinc-600" : ""}
          `}>
            {isCompleted && <Check size={12} strokeWidth={3} />}
            {isCurrent && <Play size={10} fill="currentColor" className="ml-0.5" />}
            {isLocked && <Lock size={10} />}
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-zinc-700 !border-zinc-600" />
    </>
  );
}
