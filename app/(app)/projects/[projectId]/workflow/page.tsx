import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Edge, Node } from "@xyflow/react";
import { uploadWorkflowAttachmentAction } from "@/app/actions/attachments";
import { requireUser } from "@/lib/auth";
import { canEditWorkflow, canViewProject, type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { WorkflowEditor } from "@/components/workflow-editor";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { labelNodeStatus, labelNodeType } from "@/lib/labels";

export default async function ProjectWorkflowPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = (await requireUser()) as AccessUser;
  const { projectId } = await params;

  if (!(await userHasPermission(user, "project.workflow.read"))) {
    redirect(`/projects/${projectId}`);
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: {
      company: true,
      nodes: {
        where: { deletedAt: null },
        include: {
          assignees: { include: { user: true } },
          attachments: { where: { deletedAt: null } },
        },
        orderBy: { sortOrder: "asc" },
      },
      edges: { where: { deletedAt: null } },
    },
  });
  if (!project) notFound();
  if (!canViewProject(user, project)) notFound();

  const canEditGraph =
    (await userHasPermission(user, "project.workflow.update")) && canEditWorkflow(user, project);

  const initialNodes: Node[] = project.nodes.map((n) => ({
    id: n.id,
    position: { x: n.posX, y: n.posY },
    data: {
      label: `${n.title}`,
      subtitle: `${labelNodeType(n.nodeType)} · ${labelNodeStatus(n.status)}`,
      assignees: n.assignees
        .map((a) => a.user)
        .filter((u) => !u.deletedAt)
        .map((u) => u.name)
        .join(", ") || "Unassigned",
      attachments: n.attachments.length,
    },
    type: "default",
  }));

  const initialEdges: Edge[] = project.edges.map((e) => ({
    id: e.id,
    source: e.fromNodeId,
    target: e.toNodeId,
    label: e.kind,
  }));

  return (
    <div className="space-y-6">
      <div className="text-xs text-[hsl(var(--muted))]">
        <Link href="/projects">Projects</Link> /{" "}
        <Link href={`/projects/${project.id}`}>{project.name}</Link> / Workflow
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workflow map</h1>
        <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--muted))]">
          Drag nodes to reposition (saved to <code className="rounded bg-black/5 px-1 dark:bg-white/10">posX</code> /{" "}
          <code className="rounded bg-black/5 px-1 dark:bg-white/10">posY</code>). Connect nodes to add edges; select an
          edge and press Delete to soft-remove it. Files attach to individual nodes (local disk or Vercel Blob when
          configured).
        </p>
      </div>

      <WorkflowEditor
        projectId={project.id}
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        editable={canEditGraph}
      />

      <Card className="space-y-4 p-4">
        <CardTitle>Attachments by node</CardTitle>
        <ul className="space-y-4 text-sm">
          {project.nodes.map((n) => (
            <li key={n.id} className="rounded-lg border border-[hsl(var(--border))] p-3">
              <div className="font-medium">{n.title}</div>
              <ul className="mt-2 space-y-1 text-xs text-[hsl(var(--muted))]">
                {n.attachments.length ? (
                  n.attachments.map((a) => (
                    <li key={a.id}>
                      <a className="text-[hsl(var(--accent))] underline" href={`/api/attachments/${a.id}`}>
                        {a.fileName}
                      </a>{" "}
                      ({a.sizeBytes} bytes)
                    </li>
                  ))
                ) : (
                  <li>No files yet.</li>
                )}
              </ul>
              {canEditGraph ? (
                <form
                  action={uploadWorkflowAttachmentAction}
                  encType="multipart/form-data"
                  className="mt-3 flex flex-wrap items-end gap-2"
                >
                  <input type="hidden" name="workflowNodeId" value={n.id} />
                  <Input type="file" name="file" required className="max-w-xs text-xs" />
                  <Button type="submit" variant="secondary" className="h-8 text-xs">
                    Upload
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
