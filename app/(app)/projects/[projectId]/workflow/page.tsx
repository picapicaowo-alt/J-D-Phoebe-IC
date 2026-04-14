import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Edge, Node } from "@xyflow/react";
import { uploadWorkflowAttachmentAction } from "@/app/actions/attachments";
import { getLocale } from "@/lib/locale";
import { t, tWorkflowNodeType, tWorkflowNodeStatus } from "@/lib/messages";
import { requireUser } from "@/lib/auth";
import { canEditWorkflow, canViewProject, type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { WorkflowEditor } from "@/components/workflow-editor";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AttachmentVersionTree } from "@/components/attachment-version-tree";
export default async function ProjectWorkflowPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = (await requireUser()) as AccessUser;
  const { projectId } = await params;
  const locale = await getLocale();

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
      subtitle: `${tWorkflowNodeType(locale, n.nodeType)} · ${tWorkflowNodeStatus(locale, n.status)}`,
      assignees: n.assignees
        .map((a) => a.user)
        .filter((u) => !u.deletedAt)
        .map((u) => u.name)
        .join(", ") || t(locale, "wfUnassigned"),
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
        <Link href="/projects">{t(locale, "projBreadcrumbProjects")}</Link> /{" "}
        <Link href={`/projects/${project.id}`}>{project.name}</Link> / {t(locale, "wfWorkflowMap")}
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t(locale, "wfWorkflowMap")}</h1>
        <p className="mt-2 max-w-3xl text-sm text-[hsl(var(--muted))]">
          {t(locale, "wfWorkflowLead")}{" "}
          <code className="rounded bg-black/5 px-1 dark:bg-white/10">posX</code> /{" "}
          <code className="rounded bg-black/5 px-1 dark:bg-white/10">posY</code>
          {t(locale, "wfWorkflowPosBody")}
        </p>
      </div>

      <WorkflowEditor
        projectId={project.id}
        initialNodes={initialNodes}
        initialEdges={initialEdges}
        editable={canEditGraph}
        savingLabel={t(locale, "wfSaving")}
        dragHint={t(locale, "wfDragHint")}
        readOnlyHint={t(locale, "wfReadOnlyWorkflow")}
      />

      <Card className="space-y-4 p-4">
        <CardTitle>{t(locale, "wfAttachmentsByNode")}</CardTitle>
        <ul className="space-y-4 text-sm">
          {project.nodes.map((n) => (
            <li key={n.id} className="rounded-lg border border-[hsl(var(--border))] p-3">
              <div className="font-medium">{n.title}</div>
              <div className="mt-2 text-xs text-[hsl(var(--muted))]">
                {n.attachments.length ? (
                  <AttachmentVersionTree
                    attachments={n.attachments.map((a) => ({
                      id: a.id,
                      previousVersionId: a.previousVersionId,
                      fileName: a.fileName,
                      createdAt: a.createdAt,
                      description: `${a.sizeBytes} ${t(locale, "wfBytes")}`,
                    }))}
                    locale={locale}
                    showTrash={canEditGraph}
                  />
                ) : (
                  <p>{t(locale, "wfNoFiles")}</p>
                )}
              </div>
              {canEditGraph ? (
                <form
                  action={uploadWorkflowAttachmentAction}
                  encType="multipart/form-data"
                  className="mt-3 grid gap-2 border-t border-[hsl(var(--border))] pt-3 md:grid-cols-2"
                >
                  <input type="hidden" name="workflowNodeId" value={n.id} />
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-medium">{t(locale, "btnUpload")}</label>
                    <Input type="file" name="file" required className="max-w-xs text-xs" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">{t(locale, "commonTitleEn")}</label>
                    <Input name="titleEn" className="text-xs" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">{t(locale, "commonTitleZh")}</label>
                    <Input name="titleZh" className="text-xs" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-medium">{t(locale, "commonDescription")}</label>
                    <Input name="description" className="text-xs" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-medium">{t(locale, "commonLabels")}</label>
                    <Input name="labels" className="text-xs" />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-medium">{t(locale, "wfPrevVersion")}</label>
                    <select
                      name="previousVersionId"
                      className="h-9 w-full max-w-md rounded-md border border-[hsl(var(--border))] bg-transparent px-2 text-xs"
                      defaultValue=""
                    >
                      <option value="">{t(locale, "wfNewVersionNone")}</option>
                      {n.attachments.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.fileName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <Button type="submit" variant="secondary" className="h-8 text-xs">
                      {t(locale, "btnUpload")}
                    </Button>
                  </div>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
