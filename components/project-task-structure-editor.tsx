import Link from "next/link";
import type { WorkflowNodeStatus, WorkflowNodeType } from "@prisma/client";
import {
  createProjectMapEdgeAction,
  createProjectMapNodeAction,
  removeProjectMapEdgeAction,
  reorderProjectMapNodeAction,
  setProjectMapNodeParentAction,
  softDeleteProjectMapNodeAction,
  updateProjectMapNodeAction,
} from "@/app/actions/project-map";
import type { Locale } from "@/lib/locale";
import { t, tWorkflowNodeStatus, tWorkflowNodeType } from "@/lib/messages";
import { canSetParent, childrenByParentId, type NodeTreeFields } from "@/lib/workflow-node-tree";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type EditorNode = {
  id: string;
  title: string;
  parentNodeId: string | null;
  sortOrder: number;
  status: WorkflowNodeStatus;
  nodeType: WorkflowNodeType;
  dueAt: Date | null;
  layerId: string | null;
  assignees: { user: { id: string; name: string } }[];
};

type EditorProject = {
  id: string;
  layers: { id: string; name: string }[];
  nodes: EditorNode[];
  edges: { id: string; fromNodeId: string; toNodeId: string; kind: string }[];
  memberships: { userId: string; user: { id: string; name: string } }[];
};

const NODE_STATUSES: WorkflowNodeStatus[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "WAITING",
  "BLOCKED",
  "APPROVED",
  "DONE",
  "SKIPPED",
];
const NODE_TYPES: WorkflowNodeType[] = ["MILESTONE", "TASK", "APPROVAL", "WAITING", "COMPLETED"];

export function ProjectTaskStructureEditor({
  project,
  locale,
  eligibleParentIds,
}: {
  project: EditorProject;
  locale: Locale;
  eligibleParentIds: Set<string>;
}) {
  const layerLanes = [...project.layers, { id: "__ungrouped__", name: "" }];
  const treeMeta: NodeTreeFields[] = project.nodes.map((n) => ({
    id: n.id,
    parentNodeId: n.parentNodeId,
    sortOrder: n.sortOrder,
  }));
  const byIdTree = new Map(treeMeta.map((r) => [r.id, r]));
  const byParentTree = childrenByParentId(treeMeta);

  return (
    <div className="space-y-4 border-t border-[hsl(var(--border))] pt-4">
      <div>
        <p className="text-sm font-medium">{t(locale, "wfEditMapTitle")}</p>
        <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "wfEditMapCaption")}</p>
      </div>
      <form action={createProjectMapNodeAction} className="grid gap-2 border-b pb-3 md:grid-cols-3">
        <input type="hidden" name="projectId" value={project.id} />
        <div className="space-y-1 md:col-span-2">
          <label className="text-xs font-medium">{t(locale, "wfNewNodeTitle")}</label>
          <Input name="title" required placeholder={t(locale, "wfNodePlaceholder")} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">{t(locale, "projTypeLabel")}</label>
          <Select name="nodeType" defaultValue="TASK">
            {NODE_TYPES.map((nt) => (
              <option key={nt} value={nt}>
                {tWorkflowNodeType(locale, nt)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-xs font-medium">{t(locale, "wfNodeDue")}</label>
          <Input name="dueAt" type="datetime-local" className="text-xs" />
          <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "wfNodeDueHelp")}</p>
        </div>
        <div className="space-y-1 md:col-span-3">
          <label className="text-xs font-medium">{t(locale, "projLayerLabel")}</label>
          <Select name="layerId" defaultValue={project.layers[0]?.id ?? ""}>
            <option value="">{t(locale, "projUngroupedLayerOption")}</option>
            {project.layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1 md:col-span-3">
          <label className="text-xs font-medium">{t(locale, "projMapParentOptional")}</label>
          <Select name="parentNodeId" defaultValue="">
            <option value="">—</option>
            {project.nodes
              .filter((p) => eligibleParentIds.has(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
          </Select>
        </div>
        <div className="md:col-span-3">
          <Button type="submit" variant="secondary">
            {t(locale, "wfAddNode")}
          </Button>
        </div>
      </form>
      <details className="rounded-md border border-[hsl(var(--border))] p-2">
        <summary className="cursor-pointer text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "wfAddDependency")}</summary>
        <div className="mt-2 space-y-2">
          <form action={createProjectMapEdgeAction} className="grid gap-2 md:grid-cols-3">
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="kind" value="DEPENDENCY" />
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "wfFromNode")}</label>
              <Select name="fromNodeId" required>
                <option value="">{t(locale, "wfSelect")}</option>
                {project.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "wfToNode")}</label>
              <Select name="toNodeId" required>
                <option value="">{t(locale, "wfSelect")}</option>
                {project.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.title}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" variant="secondary">
                {t(locale, "wfAddDependency")}
              </Button>
            </div>
          </form>
          {project.edges.length ? (
            <ul className="space-y-1 text-xs">
              {project.edges.map((e) => {
                const from = project.nodes.find((x) => x.id === e.fromNodeId);
                const to = project.nodes.find((x) => x.id === e.toNodeId);
                return (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-[hsl(var(--border))] px-2 py-1"
                  >
                    <span>
                      {from?.title ?? e.fromNodeId} → {to?.title ?? e.toNodeId} ({e.kind})
                    </span>
                    <form action={removeProjectMapEdgeAction}>
                      <input type="hidden" name="edgeId" value={e.id} />
                      <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                        {t(locale, "btnRemove")}
                      </Button>
                    </form>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </details>
      <div className="space-y-2 text-sm">
        <p className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "wfNodesLabel")}</p>
        {layerLanes.map((layer) => {
          const laneNodes = project.nodes.filter((n) =>
            layer.id === "__ungrouped__" ? !n.layerId : n.layerId === layer.id,
          );
          if (!laneNodes.length) return null;
          return (
            <div key={layer.id} className="space-y-2">
              <p className="text-xs font-medium text-[hsl(var(--muted))]">
                {layer.id === "__ungrouped__" ? t(locale, "wfUngroupedLane") : layer.name}
              </p>
              <ul className="space-y-2">
                {laneNodes.map((n, i) => (
                  <li key={n.id} className="rounded-md border border-[hsl(var(--border))] p-2">
                    <div className="mb-2 flex flex-wrap gap-1">
                      {i > 0 ? (
                        <form action={reorderProjectMapNodeAction}>
                          <input type="hidden" name="nodeId" value={n.id} />
                          <input type="hidden" name="direction" value="up" />
                          <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                            {t(locale, "wfReorderUp")}
                          </Button>
                        </form>
                      ) : null}
                      {i < laneNodes.length - 1 ? (
                        <form action={reorderProjectMapNodeAction}>
                          <input type="hidden" name="nodeId" value={n.id} />
                          <input type="hidden" name="direction" value="down" />
                          <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                            {t(locale, "wfReorderDown")}
                          </Button>
                        </form>
                      ) : null}
                    </div>
                    <form action={updateProjectMapNodeAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="nodeId" value={n.id} />
                      <Input name="title" defaultValue={n.title} className="min-w-[160px]" required />
                      <Select name="status" defaultValue={n.status} className="min-w-[140px]">
                        {NODE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {tWorkflowNodeStatus(locale, s)}
                          </option>
                        ))}
                      </Select>
                      <Select name="nodeType" defaultValue={n.nodeType} className="min-w-[120px]">
                        {NODE_TYPES.map((nt) => (
                          <option key={nt} value={nt}>
                            {tWorkflowNodeType(locale, nt)}
                          </option>
                        ))}
                      </Select>
                      <div className="space-y-1">
                        <label className="text-[10px] text-[hsl(var(--muted))]">{t(locale, "projAssigneeShort")}</label>
                        <Select
                          name="ownerId"
                          defaultValue={n.assignees[0]?.user.id ?? ""}
                          className="min-w-[140px] text-xs"
                        >
                          <option value="">—</option>
                          {project.memberships.map((m) => (
                            <option key={m.userId} value={m.userId}>
                              {m.user.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <Input
                        name="dueAt"
                        type="datetime-local"
                        defaultValue={
                          n.dueAt
                            ? new Date(n.dueAt.getTime() - new Date().getTimezoneOffset() * 60000)
                                .toISOString()
                                .slice(0, 16)
                            : ""
                        }
                        className="w-[180px] text-xs"
                      />
                      <Button type="submit" variant="secondary" className="h-8 text-xs">
                        {t(locale, "btnSave")}
                      </Button>
                    </form>
                    <form action={setProjectMapNodeParentAction} className="mt-2 flex flex-wrap items-end gap-2 border-t border-[hsl(var(--border))] pt-2">
                      <input type="hidden" name="nodeId" value={n.id} />
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-[hsl(var(--muted))]">{t(locale, "projNodeParentSelect")}</label>
                        <Select name="parentNodeId" defaultValue={n.parentNodeId ?? ""} className="min-w-[200px] text-xs">
                          <option value="">{t(locale, "projNodeParentRoot")}</option>
                          {project.nodes
                            .filter((p) => p.id !== n.id)
                            .map((p) => {
                              const check = canSetParent(byIdTree, byParentTree, n.id, p.id);
                              if (!check.ok) return null;
                              return (
                                <option key={p.id} value={p.id}>
                                  {p.title}
                                </option>
                              );
                            })}
                        </Select>
                      </div>
                      <Button type="submit" variant="secondary" className="h-8 text-xs">
                        {t(locale, "btnApply")}
                      </Button>
                    </form>
                    <p className="mt-1">
                      <Link href={`/projects/${project.id}/nodes/${n.id}`} className="text-xs text-[hsl(var(--accent))] underline">
                        {t(locale, "projOpenNodeDetail")}
                      </Link>
                    </p>
                    <form action={softDeleteProjectMapNodeAction} className="mt-1">
                      <input type="hidden" name="nodeId" value={n.id} />
                      <Button type="submit" variant="secondary" className="h-7 px-2 text-xs">
                        {t(locale, "wfRemoveNode")}
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
