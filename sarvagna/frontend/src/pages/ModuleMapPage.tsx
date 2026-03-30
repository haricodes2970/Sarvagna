import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";

import ModuleMap, { type Topic } from "@/components/GameMap";
import { modulemapApi, type ModuleMapResponse } from "@/lib/api";

export default function ModuleMapPage() {
  const { subjectId, moduleNumber } = useParams<{ subjectId: string; moduleNumber: string }>();
  const navigate = useNavigate();

  const modNum = useMemo(() => Number(moduleNumber), [moduleNumber]);
  const enabled = !!subjectId && Number.isFinite(modNum);

  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);

  const { data: moduleMapData, isLoading } = useQuery({
    queryKey: ["modulemap", subjectId, moduleNumber],
    queryFn: () => modulemapApi.getModuleMap(subjectId!, modNum).then((r) => r.data as ModuleMapResponse),
    enabled,
  });

  const handleTopicClick = useCallback((topicId: string) => {
    // Per requirements: topic/subtopic clicks must NOT navigate to chat directly.
    setSelectedTopicId(topicId);
    toast(`Selected: ${topicId}`, { duration: 900 });
  }, []);

  if (isLoading) {
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

  const subjectName = moduleMapData.subject_name ?? "Subject";
  const moduleTitle = moduleMapData.module_title ?? `Module ${moduleMapData.module_number}`;

  // GameMap expects topics shaped like its `Topic` type. Our backend returns the same schema.
  const topics: Topic[] = moduleMapData.topics as unknown as Topic[];

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
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold truncate">
            {moduleTitle}
          </p>
        </div>
        {selectedTopicId ? (
          <div className="text-[10px] text-amber-500 font-black uppercase tracking-widest">
            {selectedTopicId}
          </div>
        ) : (
          <div className="text-[10px] text-zinc-700 uppercase tracking-widest font-black">
            Module Realm
          </div>
        )}
      </div>

      {/* Map canvas */}
      <div className="flex-1 relative">
        <ModuleMap topics={topics} onTopicClick={handleTopicClick} moduleTitle={moduleTitle} />

        {/* Bottom-right action */}
        <button
          onClick={() => navigate(`/chat/${subjectId}/${moduleNumber}`)}
          className="absolute bottom-4 right-4 z-20 px-6 py-4 rounded-2xl bg-amber-500 text-black font-black text-sm hover:bg-amber-400 transition-colors shadow-[0_0_0_2px_rgba(245,158,11,0.2)]"
        >
          Let's Start
        </button>
      </div>
    </div>
  );
}

