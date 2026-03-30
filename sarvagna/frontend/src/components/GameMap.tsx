import { useCallback, useMemo } from "react";
import ReactFlow, {
  type Node,
  type Edge,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  MarkerType,
} from "react-flow-renderer";
import dagre from "dagre";
import ModuleNode, { type ModuleNodeData } from "./ModuleNode";

// ── Types ──────────────────────────────────────────────────────────────────

export interface MapModule {
  module_number: number;
  title: string;
  status: "completed" | "current" | "locked";
  xp: number;
  connections?: Array<{ from: number; to: number; type: "sequential" | "related" }>;
}

interface GameMapProps {
  modules: MapModule[];
  subjectId: string;
  onModuleClick: (moduleNumber: number, status: string) => void;
}

// ── Dagre layout ───────────────────────────────────────────────────────────

const NODE_WIDTH = 196;
const NODE_HEIGHT = 120;

function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 80 });

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges
    .filter((e) => !(e as any).data?.isRelated)
    .forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      ...n,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

const nodeTypes = { moduleNode: ModuleNode };

function statusColor(status: string) {
  if (status === "completed") return "#10b981";
  if (status === "current") return "#f59e0b";
  return "#3f3f46";
}

// ── Component ──────────────────────────────────────────────────────────────

export default function GameMap({ modules, onModuleClick }: GameMapProps) {
  const initialNodes: Node<ModuleNodeData>[] = useMemo(
    () =>
      modules.map((m) => ({
        id: String(m.module_number),
        type: "moduleNode",
        position: { x: 0, y: 0 },
        data: {
          moduleNumber: m.module_number,
          title: m.title,
          xp: m.xp,
          status: m.status,
          onClick: () => onModuleClick(m.module_number, m.status),
        },
      })),
    [modules, onModuleClick]
  );

  // Build edges: sequential + related
  const initialEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];

    // Sequential connections
    for (let i = 0; i < modules.length - 1; i++) {
      const src = modules[i];
      const tgt = modules[i + 1];
      edges.push({
        id: `seq-${src.module_number}-${tgt.module_number}`,
        source: String(src.module_number),
        target: String(tgt.module_number),
        type: "smoothstep",
        animated: src.status === "current",
        style: {
          stroke: statusColor(src.status),
          strokeWidth: 2,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: statusColor(src.status) },
      });
    }

    // Related connections from module data
    const added = new Set<string>();
    modules.forEach((m) => {
      (m.connections ?? [])
        .filter((c) => c.type === "related" && c.from !== c.to - 1)
        .forEach((c) => {
          const key = `${c.from}-${c.to}`;
          if (!added.has(key)) {
            added.add(key);
            edges.push({
              id: `rel-${key}`,
              source: String(c.from),
              target: String(c.to),
              type: "straight",
              style: { stroke: "#52525b", strokeWidth: 1, strokeDasharray: "4 3" },
              data: { isRelated: true },
            });
          }
        });
    });

    return edges;
  }, [modules]);

  const laidOutNodes = useMemo(
    () => layoutNodes(initialNodes, initialEdges),
    [initialNodes, initialEdges]
  );

  const [nodes, , onNodesChange] = useNodesState(laidOutNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(() => {}, []);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
        defaultEdgeOptions={{ type: "smoothstep" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#27272a"
        />
        <Controls
          style={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
        />
        <MiniMap
          nodeColor={(n) => statusColor((n.data as ModuleNodeData).status)}
          style={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
          maskColor="rgba(9,9,11,0.8)"
        />
      </ReactFlow>
    </div>
  );
}
