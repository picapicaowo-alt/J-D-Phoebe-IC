"use client";

import { useCallback, useTransition } from "react";
import {
  addEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { WorkflowEdgeKind } from "@prisma/client";
import {
  createWorkflowEdgeAction,
  saveWorkflowPositionsAction,
  softDeleteWorkflowEdgeAction,
} from "@/app/actions/workflow";

type Props = {
  projectId: string;
  initialNodes: Node[];
  initialEdges: Edge[];
  editable: boolean;
};

export function WorkflowEditor({ projectId, initialNodes, initialEdges, editable }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [pending, startTransition] = useTransition();

  const onNodeDragStop = useCallback(() => {
    if (!editable) return;
    setNodes((current) => {
      const positions = current.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }));
      startTransition(() => {
        void saveWorkflowPositionsAction(projectId, positions);
      });
      return current;
    });
  }, [editable, projectId, setNodes]);

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!editable || !conn.source || !conn.target) return;
      startTransition(() => {
        void (async () => {
          const id = await createWorkflowEdgeAction(
            projectId,
            conn.source!,
            conn.target!,
            WorkflowEdgeKind.DEPENDENCY,
          );
          setEdges((eds) => {
            if (eds.some((e) => e.source === conn.source && e.target === conn.target)) return eds;
            return addEdge(
              {
                id,
                source: conn.source!,
                target: conn.target!,
                label: WorkflowEdgeKind.DEPENDENCY,
              },
              eds,
            );
          });
        })();
      });
    },
    [editable, projectId, setEdges],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      if (!editable) return;
      setEdges((eds) => eds.filter((e) => !deleted.some((d) => d.id === e.id)));
      for (const e of deleted) {
        startTransition(() => {
          void softDeleteWorkflowEdgeAction(projectId, e.id);
        });
      }
    },
    [editable, projectId, setEdges],
  );

  return (
    <div className="space-y-2">
      <div className="h-[560px] w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={editable ? onConnect : undefined}
          onEdgesDelete={editable ? onEdgesDelete : undefined}
          onNodeDragStop={editable ? onNodeDragStop : undefined}
          nodesDraggable={editable}
          nodesConnectable={editable}
          elementsSelectable={editable}
          edgesReconnectable={editable}
          deleteKeyCode={editable ? "Delete" : null}
          fitView
          fitViewOptions={{ padding: 0.2 }}
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>
      {editable ? (
        <p className="text-xs text-[hsl(var(--muted))]">
          {pending ? "Saving…" : "Drag nodes to reposition. Drag from a node handle to another to connect. Select an edge and press Delete to remove."}
        </p>
      ) : (
        <p className="text-xs text-[hsl(var(--muted))]">Read-only: you need workflow update access on this project to edit the graph.</p>
      )}
    </div>
  );
}
