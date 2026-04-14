import Link from "next/link";
import { notFound } from "next/navigation";
import { addExternalResourceLinkAction } from "@/app/actions/attachments";
import { setProjectMapNodeParentAction } from "@/app/actions/project-map";
import { requireUser } from "@/lib/auth";
import { canEditProjectMap, canViewProject, type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getLocale } from "@/lib/locale";
import { t, tWorkflowNodeStatus, tWorkflowNodeType } from "@/lib/messages";
import { MAX_TASK_DEPTH, canSetParent, childrenByParentId, depthFromRoot } from "@/lib/workflow-node-tree";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AttachmentVersionTree } from "@/components/attachment-version-tree";

export default async function ProjectNodeDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; nodeId: string }>;
}) {
  const user = (await requireUser()) as AccessUser;
  const { projectId, nodeId } = await params;

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { company: true },
  });
  if (!project || !canViewProject(user, project)) notFound();

  const node = await prisma.workflowNode.findFirst({
    where: { id: nodeId, projectId, deletedAt: null },
    include: {
      assignees: { include: { user: true } },
      attachments: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!node) notFound();

  const allNodes = await prisma.workflowNode.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true, title: true, parentNodeId: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  });
  const byId = new Map(allNodes.map((n) => [n.id, n]));
  const ancestors: { id: string; title: string }[] = [];
  let cur: string | undefined = nodeId;
  while (cur) {
    const row = allNodes.find((x) => x.id === cur);
    if (!row) break;
    ancestors.unshift({ id: row.id, title: row.title });
    cur = row.parentNodeId ?? undefined;
  }

  const children = await prisma.workflowNode.findMany({
    where: { projectId, parentNodeId: nodeId, deletedAt: null },
    orderBy: { sortOrder: "asc" },
    select: { id: true, title: true, status: true, nodeType: true },
  });

  const locale = await getLocale();
  const canMap = (await userHasPermission(user, "project.map.update")) && canEditProjectMap(user, project);
  const depth = depthFromRoot(byId, nodeId);
  const byParent = childrenByParentId(allNodes);
  const parentOptions = allNodes.filter((p) => p.id !== nodeId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <nav className="flex flex-wrap items-center gap-1 text-xs text-[hsl(var(--muted))]">
        <Link href="/projects" className="hover:underline">
          {t(locale, "projBreadcrumbProjects")}
        </Link>
        <span>/</span>
        <Link href={`/projects/${project.id}`} className="hover:underline">
          {project.name}
        </Link>
        {ancestors.slice(0, -1).map((c) => (
          <span key={c.id} className="contents">
            <span>/</span>
            <Link href={`/projects/${project.id}/nodes/${c.id}`} className="hover:underline">
              {c.title}
            </Link>
          </span>
        ))}
        <span>/</span>
        <span className="text-[hsl(var(--foreground))]">{node.title}</span>
      </nav>

      {node.parentNodeId ? (
        <Link
          href={`/projects/${project.id}/nodes/${node.parentNodeId}`}
          className="inline-block text-sm text-[hsl(var(--accent))] hover:underline"
        >
          ← {t(locale, "projBackToParent")}
        </Link>
      ) : (
        <Link href={`/projects/${project.id}`} className="inline-block text-sm text-[hsl(var(--accent))] hover:underline">
          ← {t(locale, "projBackToProject")}
        </Link>
      )}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{node.title}</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted))]">
          {tWorkflowNodeType(locale, node.nodeType)} · {tWorkflowNodeStatus(locale, node.status)} ·{" "}
          {t(locale, "projNodeDepthLabel")} {depth}/{MAX_TASK_DEPTH}
        </p>
        {node.description ? <p className="mt-3 text-sm">{node.description}</p> : null}
      </div>

      {canMap ? (
        <Card className="space-y-3 p-4">
          <CardTitle>{t(locale, "projNodeParentTitle")}</CardTitle>
          <form action={setProjectMapNodeParentAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="nodeId" value={node.id} />
            <div className="space-y-1">
              <label className="text-xs font-medium">{t(locale, "projNodeParentSelect")}</label>
              <Select name="parentNodeId" defaultValue={node.parentNodeId ?? ""} className="min-w-[220px]">
                <option value="">{t(locale, "projNodeParentRoot")}</option>
                {parentOptions.map((p) => {
                  const check = canSetParent(byId, byParent, node.id, p.id);
                  if (!check.ok) return null;
                  return (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  );
                })}
              </Select>
            </div>
            <Button type="submit" variant="secondary" className="h-9 text-xs">
              {t(locale, "btnApply")}
            </Button>
          </form>
        </Card>
      ) : null}

      <Card className="space-y-3 p-4">
        <CardTitle>{t(locale, "projNodeAssignees")}</CardTitle>
        {node.assignees.length ? (
          <ul className="space-y-2 text-sm">
            {node.assignees.map((a) => (
              <li key={a.userId} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
                <div className="font-medium">{a.user.name}</div>
                {a.responsibility ? (
                  <div className="text-xs text-[hsl(var(--muted))]">
                    {t(locale, "projNodeResponsibility")}: {a.responsibility}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "wfUnassigned")}</p>
        )}
      </Card>

      {children.length ? (
        <Card className="space-y-3 p-4">
          <CardTitle>{t(locale, "projNodeChildrenTitle")}</CardTitle>
          <ul className="space-y-2 text-sm">
            {children.map((c) => (
              <li key={c.id}>
                <Link className="font-medium hover:underline" href={`/projects/${project.id}/nodes/${c.id}`}>
                  {c.title}
                </Link>
                <span className="ml-2 text-xs text-[hsl(var(--muted))]">
                  {tWorkflowNodeType(locale, c.nodeType)} · {tWorkflowNodeStatus(locale, c.status)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="space-y-3 p-4">
        <CardTitle>{t(locale, "projNodeLinksTitle")}</CardTitle>
        <p className="text-xs text-[hsl(var(--muted))]">{t(locale, "projNodeLinksHint")}</p>
        {node.attachments.length ? (
          <AttachmentVersionTree
            attachments={node.attachments.map((a) => ({
              id: a.id,
              previousVersionId: a.previousVersionId,
              fileName: a.fileName,
              createdAt: a.createdAt,
              description: a.description,
              resourceKind: a.resourceKind,
              externalUrl: a.externalUrl,
            }))}
            locale={locale}
            showTrash={canMap}
          />
        ) : (
          <p className="text-sm text-[hsl(var(--muted))]">{t(locale, "projNodeNoLinks")}</p>
        )}
        {canMap ? (
          <form action={addExternalResourceLinkAction} className="grid gap-2 border-t border-[hsl(var(--border))] pt-3 md:grid-cols-2">
            <input type="hidden" name="workflowNodeId" value={node.id} />
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">{t(locale, "resExternalUrl")}</label>
              <Input name="externalUrl" type="url" required placeholder="https://drive.google.com/..." className="text-xs" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">{t(locale, "resLinkLabel")}</label>
              <Input name="label" placeholder={t(locale, "resLinkLabelPh")} className="text-xs" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium">{t(locale, "commonDescription")}</label>
              <Input name="description" className="text-xs" />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" variant="secondary" className="h-8 text-xs">
                {t(locale, "resAddLink")}
              </Button>
            </div>
          </form>
        ) : null}
      </Card>
    </div>
  );
}
