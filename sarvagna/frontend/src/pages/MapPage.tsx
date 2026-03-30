import { useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Map } from "lucide-react";
import toast from "react-hot-toast";
import { mapApi, type MapModuleNode } from "@/lib/api";
import ModuleMap, { type Topic } from "@/components/GameMap";

// Map API MapModuleNode → ModuleMap Topic
function toTopics(nodes: MapModuleNode[]): Topic[] {
  return nodes.map((node) => ({
    id: `m${node.module_number}`,
    title: node.title,
    status: node.status,
    subtopics: [],
  }));
}

export default function MapPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const navigate = useNavigate();

  const { data: mapData, isLoading } = useQuery({
    queryKey: ["map", subjectId],
    queryFn: () => mapApi.getMap(subjectId!).then((r) => r.data),
    enabled: !!subjectId,
  });

  const handleTopicClick = useCallback(
    (topicId: string) => {
      if (!mapData) return;
      const node = mapData.modules.find((m) => `m${m.module_number}` === topicId);
      if (!node) return;
      if (node.status === "locked") {
        toast("Complete previous modules to unlock this one", { icon: "🔒" });
        return;
      }
      navigate(`/chat/${subjectId}/${node.module_number}`);
    },
    [subjectId, navigate, mapData]
  );

  if (isLoading) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Loading map…</p>
      </div>
    );
  }

  if (!mapData) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Map not found.</p>
      </div>
    );
  }

  const topics = toTopics(mapData.modules);

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
              {mapData.subject_name}
            </h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
              Module Map · {mapData.completed_modules}/{mapData.total_modules} Complete
            </p>
          </div>
        </div>
        <div className="ml-auto text-[10px] font-black text-amber-500 uppercase tracking-widest">
          {mapData.completion_percentage}%
        </div>
      </div>

      {/* Map canvas */}
      <div className="flex-1 relative">
        <ModuleMap
          topics={topics}
          onTopicClick={handleTopicClick}
          moduleTitle={mapData.subject_name}
        />
      </div>
    </div>
  );
}
