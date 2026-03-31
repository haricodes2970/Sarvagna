import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { mapGraphApi, modulemapApi, type MapGraphLayout } from "@/lib/api";
import WorldMap, { type TopicStatus } from "@/components/WorldMap";

export default function ModuleMapPage() {
  const { subjectId, moduleNumber } = useParams<{ subjectId: string; moduleNumber: string }>();
  const navigate = useNavigate();
  const modNum = useMemo(() => Number(moduleNumber), [moduleNumber]);
  const enabled = !!subjectId && Number.isFinite(modNum);

  // Fetch Groq layout + selected map
  const {
    data: graphData,
    isLoading: graphLoading,
  } = useQuery({
    queryKey: ["mapgraph", subjectId, moduleNumber],
    queryFn: () => mapGraphApi.getMapGraph(subjectId!, modNum).then((r) => r.data),
    enabled,
  });

  // Fetch topic statuses from modulemap
  const { data: moduleData, isLoading: moduleLoading } = useQuery({
    queryKey: ["modulemap", subjectId, moduleNumber],
    queryFn: () => modulemapApi.getModuleMap(subjectId!, modNum).then((r) => r.data),
    enabled,
  });

  const subjectName = moduleData?.subject_name ?? "Subject";
  const moduleTitle = moduleData?.module_title ?? `Module ${moduleNumber}`;

  // Flatten topic statuses from modulemap response into a flat id→status list
  const topicStatuses = useMemo((): TopicStatus[] => {
    if (!moduleData) return [];
    const out: TopicStatus[] = [];
    for (const topic of moduleData.topics) {
      out.push({ id: topic.id, status: topic.status });
      for (const sub of topic.subtopics ?? []) {
        out.push({ id: sub.id, status: sub.status });
      }
    }
    // Also map the "main" capital id used by Groq layout
    if (moduleData.topics[0]) {
      out.push({ id: "main", status: moduleData.topics[0].status });
    }
    return out;
  }, [moduleData]);

  const isLoading = graphLoading || moduleLoading;

  if (isLoading) {
    return (
      <div className="h-screen bg-slate-950 flex flex-col items-center justify-center gap-3">
        <div className="w-10 h-10 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
        <p className="text-slate-400 text-sm tracking-wider uppercase font-bold">
          {graphLoading ? "Generating realm layout…" : "Loading module…"}
        </p>
      </div>
    );
  }

  if (!graphData || !moduleData) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Module map not found.</p>
      </div>
    );
  }

  const layout = graphData.layout as MapGraphLayout;
  const mapImage = graphData.map_image;

  return (
    <div className="h-screen bg-[#07090f] text-zinc-100 flex flex-col">
      {/* Header */}
      <div className="shrink-0 z-10 bg-black/80 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(`/lobby/${subjectId}/${moduleNumber}`)}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold truncate">
            {subjectName} — Module {moduleData.module_number}
          </h1>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold truncate">
            {moduleTitle}
          </p>
        </div>
        <button
          onClick={() => navigate(`/chat/${subjectId}/${moduleNumber}`)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 transition-all"
        >
          <MessageSquare size={13} />
          Open Chat
        </button>
      </div>

      {/* Map canvas */}
      <div className="flex-1 relative overflow-hidden">
        <WorldMap
          layout={layout}
          mapImage={mapImage}
          topicStatuses={topicStatuses}
          onNodeClick={(nodeId, nodeTitle) => {
            const params = new URLSearchParams({ topic: nodeId, topicTitle: nodeTitle });
            navigate(`/chat/${subjectId}/${moduleNumber}?${params.toString()}`);
          }}
        />
      </div>
    </div>
  );
}
