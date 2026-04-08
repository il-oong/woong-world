"use client";

import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  NodeProps,
  Handle,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

interface ProjectData {
  id: string;
  name: string;
  description: string;
  color: string;
  category: string;
  language: string | null;
  type: string;
}

// Custom star node
function StarNode({ data }: NodeProps<ProjectData>) {
  const router = useRouter();
  const size = 60;

  return (
    <motion.div
      whileHover={{ scale: 1.15 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => router.push(`/project/${data.id}`)}
      className="cursor-pointer group relative"
      style={{ width: size, height: size }}
    >
      {/* Glow ring */}
      <div
        className="absolute inset-0 rounded-full opacity-30 group-hover:opacity-60 transition-opacity duration-500 animate-pulse-glow"
        style={{
          background: `radial-gradient(circle, ${data.color}40, transparent 70%)`,
          transform: "scale(2.5)",
        }}
      />

      {/* Core */}
      <div
        className="absolute inset-0 rounded-full border group-hover:border-2 transition-all duration-300 flex items-center justify-center"
        style={{
          background: `radial-gradient(circle at 30% 30%, ${data.color}30, ${data.color}10)`,
          borderColor: `${data.color}60`,
          boxShadow: `0 0 20px ${data.color}20, inset 0 0 10px ${data.color}10`,
        }}
      >
        <span className="text-[10px] font-medium text-center leading-tight px-1 text-white/80 group-hover:text-white transition-colors">
          {data.name.length > 10 ? data.name.slice(0, 8) + ".." : data.name}
        </span>
      </div>

      {/* Tooltip on hover */}
      <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-50 w-48">
        <div className="bg-[#111118] border border-white/10 rounded-lg px-3 py-2 shadow-xl">
          <div className="text-xs font-medium text-white/90">{data.name}</div>
          <div className="text-[10px] text-white/40 mt-0.5 line-clamp-2">{data.description}</div>
          <div className="flex items-center gap-2 mt-1">
            {data.language && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full"
                style={{ background: `${data.color}20`, color: data.color }}
              >
                {data.language}
              </span>
            )}
            <span className="text-[9px] text-white/20">{data.category}</span>
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="target" position={Position.Left} className="!bg-transparent !border-0 !w-0 !h-0" />
    </motion.div>
  );
}

const nodeTypes = { star: StarNode };

interface StarMapProps {
  projects: ProjectData[];
}

export default function StarMap({ projects }: StarMapProps) {
  const initialNodes: Node<ProjectData>[] = useMemo(
    () =>
      projects.map((p, i) => ({
        id: p.id,
        type: "star",
        position: getPosition(p, i, projects.length),
        data: p,
        draggable: true,
      })),
    [projects]
  );

  // Connect projects in same category
  const initialEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];
    const byCategory: Record<string, string[]> = {};
    projects.forEach((p) => {
      if (!byCategory[p.category]) byCategory[p.category] = [];
      byCategory[p.category].push(p.id);
    });
    Object.values(byCategory).forEach((ids) => {
      for (let i = 0; i < ids.length - 1; i++) {
        edges.push({
          id: `e-${ids[i]}-${ids[i + 1]}`,
          source: ids[i],
          target: ids[i + 1],
          style: { stroke: "rgba(255,255,255,0.04)", strokeWidth: 1 },
          animated: true,
        });
      }
    });
    return edges;
  }, [projects]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <div className="w-full h-[calc(100vh-56px)]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="!bg-transparent"
      >
        <Background color="rgba(255,255,255,0.02)" gap={40} size={1} />
        <Controls
          showInteractive={false}
          className="!bg-[#111118] !border-white/10 !shadow-xl [&>button]:!bg-[#111118] [&>button]:!border-white/10 [&>button]:!text-white/40 [&>button:hover]:!bg-white/5"
        />
      </ReactFlow>
    </div>
  );
}

// Position projects in a constellation pattern by category
function getPosition(project: ProjectData, index: number, total: number): { x: number; y: number } {
  const categoryPositions: Record<string, { cx: number; cy: number }> = {
    game: { cx: 0, cy: -250 },
    business: { cx: 350, cy: -80 },
    finance: { cx: 300, cy: 150 },
    "ai-tool": { cx: -300, cy: -100 },
    utility: { cx: -350, cy: 100 },
    portfolio: { cx: 0, cy: 300 },
    "3d-art": { cx: -200, cy: 250 },
    code: { cx: 200, cy: 250 },
    web: { cx: -100, cy: 100 },
    management: { cx: 100, cy: 50 },
    creative: { cx: -150, cy: -200 },
  };

  const base = categoryPositions[project.category] || { cx: 0, cy: 0 };
  const spread = 120;
  const angle = (index * 2.4) + (project.id.charCodeAt(0) * 0.1);

  return {
    x: base.cx + Math.cos(angle) * spread * (0.5 + Math.random() * 0.5),
    y: base.cy + Math.sin(angle) * spread * (0.5 + Math.random() * 0.5),
  };
}
