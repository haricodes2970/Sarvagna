import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { modulemapApi, type ModuleMapTopic } from "@/lib/api";
import FantasyMap, { type Topic } from "@/components/FantasyMap";

function toTopics(raw: ModuleMapTopic[]): Topic[] {
  return raw.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    subtopics: (t.subtopics ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
    })),
  }));
}

export default function ModuleMapPage() {
  const { subjectId, moduleNumber } = useParams<{ subjectId: string; moduleNumber: string }>();
  const navigate = useNavigate();
  const modNum = useMemo(() => Number(moduleNumber), [moduleNumber]);
  const enabled = !!subjectId && Number.isFinite(modNum);

  const { data, isLoading } = useQuery({
    queryKey: ["modulemap", subjectId, moduleNumber],
    queryFn: () => modulemapApi.getModuleMap(subjectId!, modNum).then((r) => r.data),
    enabled,
  });

  const topics = useMemo(() => toTopics(data?.topics ?? []), [data]);
  const subjectName = data?.subject_name ?? "Subject";
  const moduleTitle = data?.module_title ?? `Module ${moduleNumber}`;

  // Static map image — cycles through map1.jpg–map5.jpg by module number
  const mapIndex = ((modNum - 1) % 5) + 1;
  const backgroundUrl = `/maps/map${mapIndex}.jpg`;

  if (isLoading) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Loading module map…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Module map not found.</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#07090f] text-zinc-100 flex flex-col">
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
            {subjectName} — Module {data.module_number}
          </h1>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold truncate">
            {moduleTitle}
          </p>
        </div>
        <div className="text-[10px] text-zinc-700 uppercase tracking-widest font-black">
          Module Realm
        </div>
      </div>

      {/* Map canvas */}
      <div className="flex-1 relative overflow-hidden">
        <FantasyMap
          topics={topics}
          moduleTitle={moduleTitle}
          backgroundUrl={backgroundUrl}
          onTopicClick={(topicId) => {
            const topic = data.topics[0]?.subtopics?.find((t) => t.id === topicId);
            if (!topic || topic.status === "locked") return;
            navigate(`/chat/${subjectId}/${moduleNumber}`);
          }}
          onStartStudying={() => navigate(`/chat/${subjectId}/${moduleNumber}`)}
        />
      </div>
    </div>
  );
}
