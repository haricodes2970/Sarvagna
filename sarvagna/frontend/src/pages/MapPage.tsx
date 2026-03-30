import { useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Map } from "lucide-react";
import toast from "react-hot-toast";
import { progressApi } from "@/lib/api";
import GameWorldMap, { type Module, type NodeStatus } from "@/components/GameMap";

// Map API ModuleNode → GameWorldMap Module
function toGameModules(nodes: any[]): Module[] {
  const firstIncompleteIdx = nodes.findIndex((n) => !n.is_completed);

  return nodes.map((node, idx) => {
    let status: NodeStatus;
    if (node.is_completed) status = "completed";
    else if (idx === firstIncompleteIdx) status = "current";
    else status = "locked";

    return {
      id: `m${node.module_number}`,
      title: node.title ?? `Module ${node.module_number}`,
      status,
      subtopics: [],  // subtopic data not yet in API — nodes render as main nodes only
    };
  });
}

export default function MapPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const navigate = useNavigate();

  // ── API calls unchanged ──────────────────────────────────────────────────
  const { data: roadmap, isLoading } = useQuery({
    queryKey: ["roadmap", subjectId],
    queryFn: () => progressApi.roadmap(subjectId!).then((r) => r.data),
    enabled: !!subjectId,
  });

  const handleNodeClick = useCallback(
    (node: { id: string; status: NodeStatus }, type: "module" | "subtopic") => {
      if (type !== "module") return;
      if (node.status === "locked") {
        toast("Complete previous modules to unlock this one", { icon: "🔒" });
        return;
      }
      // id is "m{module_number}"
      const moduleNumber = node.id.replace(/^m/, "");
      navigate(`/chat/${subjectId}/${moduleNumber}`);
    },
    [subjectId, navigate]
  );

  // ── Loading / error states ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Loading map…</p>
      </div>
    );
  }

  if (!roadmap) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Map not found.</p>
      </div>
    );
  }

  const modules = toGameModules(roadmap.modules);

  return (
    <div className="h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="shrink-0 z-10 bg-black/80 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/dashboard")}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Map size={16} className="text-amber-500" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-none">
              {roadmap.subject_name}
            </h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
              Module Map · {roadmap.completed_modules}/{roadmap.total_modules} Complete
            </p>
          </div>
        </div>
        <div className="ml-auto text-[10px] font-black text-amber-500 uppercase tracking-widest">
          {roadmap.completion_percentage}%
        </div>
      </div>

      {/* Map canvas */}
      <div className="flex-1 relative">
        <GameWorldMap modules={modules} onNodeClick={handleNodeClick} />
      </div>
    </div>
  );
}
