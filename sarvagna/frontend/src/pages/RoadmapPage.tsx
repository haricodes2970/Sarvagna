import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Lock, Play, Star, ArrowLeft, Trophy, Info, BookOpen } from "lucide-react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { progressApi, type ModuleNode } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Module {
  id: number;
  title: string;
  description: string;
  status: 'completed' | 'current' | 'locked';
  xp: number;
}

// ─── Map API response → Module interface ─────────────────────────────────────

function toModules(nodes: ModuleNode[]): Module[] {
  // Find index of first incomplete module to mark as 'current'
  const firstIncompleteIdx = nodes.findIndex((n) => !n.is_completed);

  return nodes.map((node, idx) => {
    let status: Module['status'];
    if (node.is_completed) {
      status = 'completed';
    } else if (idx === firstIncompleteIdx) {
      status = 'current';
    } else {
      status = 'locked';
    }

    return {
      id: node.module_number,
      title: `Module ${node.module_number}`,
      description: node.completed_at
        ? `Completed ${new Date(node.completed_at).toLocaleDateString()}`
        : status === 'current'
        ? 'Continue where you left off'
        : 'Complete previous modules to unlock',
      status,
      xp: 50,
    };
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

const RoadmapPage = () => {
  const { subject_id } = useParams<{ subject_id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: roadmap, isLoading } = useQuery({
    queryKey: ["roadmap", subject_id],
    queryFn: () => progressApi.roadmap(subject_id!).then((r) => r.data),
    enabled: !!subject_id,
  });

  const completeMutation = useMutation({
    mutationFn: (module_number: number) =>
      progressApi.completeModule(subject_id!, module_number),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["roadmap", subject_id] });
      const d = res.data;
      toast.success(`+${d.xp_earned} XP · Module ${d.module_number} complete!`);
      if (d.leveled_up) {
        toast.success(`🎉 Level up! Level ${d.level} — ${d.level_name}`);
      }
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.detail ?? "Failed to complete module"),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <p className="text-zinc-500">Loading roadmap…</p>
      </div>
    );
  }

  if (!roadmap) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <p className="text-zinc-500">Roadmap not found.</p>
      </div>
    );
  }

  const modules = toModules(roadmap.modules);
  const pct = roadmap.completion_percentage;
  const remaining = roadmap.total_modules - roadmap.completed_modules;
  const totalXp = modules.reduce((sum, m) => sum + m.xp, 0);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 pb-20 selection:bg-amber-500/30">
      {/* Sticky Navigation Header */}
      <div className="sticky top-0 z-30 bg-black/80 backdrop-blur-md border-b border-zinc-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="text-zinc-400 hover:text-white hover:bg-zinc-800"
              onClick={() => navigate("/dashboard")}
            >
              <ArrowLeft size={20} />
            </Button>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{roadmap.subject_name}</h1>
              <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-bold">
                Module Progression
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-6">
            <div className="text-right">
              <p className="text-[10px] text-zinc-500 uppercase font-black mb-1">Course Mastery</p>
              <div className="flex items-center gap-3">
                <Progress value={pct} className="w-32 h-1.5 bg-zinc-800" />
                <span className="text-sm font-black text-amber-500">{pct}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="relative flex flex-col items-center">

          {/* Central Vertical Path */}
          <div className="absolute top-0 bottom-0 w-1 bg-zinc-800 left-1/2 -translate-x-1/2 z-0">
            <div
              className="absolute top-0 w-full bg-gradient-to-b from-emerald-500 via-amber-500 to-transparent shadow-[0_0_20px_rgba(245,158,11,0.2)]"
              style={{ height: `${pct}%` }}
            />
          </div>

          {modules.map((module, index) => {
            const isLeft = index % 2 === 0;
            const isCompleted = module.status === 'completed';
            const isCurrent = module.status === 'current';
            const isLocked = module.status === 'locked';

            return (
              <div
                key={module.id}
                className={`relative w-full flex items-center mb-24 last:mb-0 ${isLeft ? 'justify-start' : 'justify-end'} md:px-20`}
              >
                {/* Adventure Card */}
                <div className={`
                  relative z-10 w-full max-w-[340px] p-6 rounded-2xl border transition-all duration-500 group
                  ${isCompleted ? 'bg-zinc-900/40 border-emerald-500/30 hover:border-emerald-500/60 shadow-[0_0_30px_rgba(16,185,129,0.05)]' : ''}
                  ${isCurrent ? 'bg-zinc-900 border-amber-500 shadow-[0_0_40px_rgba(245,158,11,0.15)] scale-[1.02]' : ''}
                  ${isLocked ? 'bg-zinc-950/50 border-zinc-800/50 opacity-60' : ''}
                `}>
                  {isCurrent && (
                    <Badge className="absolute -top-3 left-6 bg-amber-500 text-black font-black hover:bg-amber-500 animate-bounce shadow-lg">
                      CURRENT MISSION
                    </Badge>
                  )}

                  <div className="flex justify-between items-start mb-3">
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                      Phase 0{module.id}
                    </span>
                    <div className={`flex items-center gap-1.5 ${isLocked ? 'text-zinc-600' : 'text-amber-500'}`}>
                      <Star size={14} className={!isLocked ? "fill-amber-500" : ""} />
                      <span className="text-xs font-bold">{module.xp} XP</span>
                    </div>
                  </div>

                  <h3 className={`text-lg font-black mb-2 tracking-tight ${isLocked ? 'text-zinc-600' : 'text-white'}`}>
                    {module.title}
                  </h3>
                  <p className="text-sm text-zinc-500 leading-relaxed mb-6">
                    {module.description}
                  </p>

                  <div className="flex flex-col gap-2">
                    {isCurrent && (
                      <Button
                        variant="default"
                        onClick={() => navigate(`/chat/${subject_id}/${module.id}`)}
                        className="w-full rounded-xl font-black text-xs uppercase tracking-widest bg-violet-600 text-white hover:bg-violet-500 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
                      >
                        <BookOpen size={14} /> Study Module
                      </Button>
                    )}
                    <Button
                      variant={isCurrent ? "default" : "secondary"}
                      disabled={isLocked || completeMutation.isPending}
                      onClick={() => {
                        if (isCurrent) completeMutation.mutate(module.id);
                        else if (isCompleted) navigate(`/chat/${subject_id}/${module.id}`);
                      }}
                      className={`w-full rounded-xl font-black text-xs uppercase tracking-widest transition-all
                        ${isCurrent ? 'bg-amber-500 text-black hover:bg-amber-400 hover:scale-[1.02]' : 'bg-zinc-800 text-zinc-400 hover:text-white'}
                      `}
                    >
                      {isCompleted ? "Review Module" : isCurrent ? "Continue Learning" : "Locked"}
                    </Button>
                  </div>
                </div>

                {/* Path Node Indicator */}
                <div className={`
                  absolute left-1/2 -translate-x-1/2 w-12 h-12 rounded-full border-4 z-20 flex items-center justify-center transition-all duration-1000
                  ${isCompleted ? 'bg-zinc-950 border-emerald-500 text-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.6)]' : ''}
                  ${isCurrent ? 'bg-zinc-950 border-amber-500 text-amber-500 animate-pulse shadow-[0_0_25px_rgba(245,158,11,0.7)]' : ''}
                  ${isLocked ? 'bg-zinc-900 border-zinc-800 text-zinc-700' : ''}
                `}>
                  {isCompleted && <Check size={24} strokeWidth={3} />}
                  {isCurrent && <Play size={20} fill="currentColor" className="ml-1" />}
                  {isLocked && <Lock size={18} />}
                </div>

                {/* Visual Branch Connector */}
                <div className={`
                  absolute top-1/2 -translate-y-1/2 h-px w-[calc(50%-170px)] md:w-[calc(50%-220px)] z-0
                  ${isLeft ? 'left-[calc(50%+24px)] bg-gradient-to-r' : 'right-[calc(50%+24px)] bg-gradient-to-l'}
                  ${isCompleted ? 'from-emerald-500/50 to-transparent' : isCurrent ? 'from-amber-500/50 to-transparent' : 'from-zinc-800 to-transparent'}
                `} />
              </div>
            );
          })}
        </div>

        {/* Roadmap Footer */}
        <div className="mt-24 p-10 rounded-[2rem] bg-gradient-to-b from-zinc-900/50 to-transparent border border-zinc-800 border-dashed text-center relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-amber-500/5 blur-[80px] rounded-full" />
          <div className="relative z-10">
            <div className="inline-flex p-4 bg-amber-500/10 rounded-2xl mb-6 border border-amber-500/20">
              <Trophy className="text-amber-500" size={32} />
            </div>
            <h3 className="text-2xl font-black mb-3 italic">THE FINAL GAUNTLET</h3>
            <p className="text-zinc-500 max-w-md mx-auto text-sm leading-relaxed mb-8 font-medium">
              Complete the remaining{" "}
              <span className="text-white">{remaining} module{remaining !== 1 ? 's' : ''}</span>{" "}
              to unlock the{" "}
              <span className="text-amber-500">Subject Conqueror Badge</span> and dominate your VTU internals.
            </p>
            <div className="flex justify-center items-center gap-6 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">
              <div className="flex items-center gap-2">
                <Info size={14} /> {roadmap.total_modules} Modules Total
              </div>
              <div className="w-1 h-1 bg-zinc-800 rounded-full" />
              <div className="flex items-center gap-2">
                <Star size={14} /> {totalXp} XP Potential
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoadmapPage;
