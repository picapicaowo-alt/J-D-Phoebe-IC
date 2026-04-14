import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canViewProject, type AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card, CardTitle } from "@/components/ui/card";
import { labelProjectStatus, labelCompanionSpecies, labelRecognitionCategory } from "@/lib/labels";
import { countdownPhrase } from "@/lib/deadlines";

function startOfWeekUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

export default async function HomePage() {
  const user = (await requireUser()) as AccessUser;
  if (!(await userHasPermission(user, "project.read"))) redirect("/group");

  const projects = await prisma.project.findMany({
    where: { deletedAt: null, status: { not: "COMPLETED" } },
    include: { company: { include: { orgGroup: true } }, owner: true },
    orderBy: [{ deadline: "asc" }, { priority: "desc" }, { updatedAt: "desc" }],
    take: 40,
  });
  const visible = projects.filter((p) => canViewProject(user, p));
  const priorities = visible.slice(0, 3);

  const [blockedCount, waitingApprovalCount, dueSoonCount, latestRec, latestSnapshot, companion] = await Promise.all([
    prisma.workflowNode.count({ where: { deletedAt: null, status: "BLOCKED", project: { deletedAt: null } } }),
    prisma.workflowNode.count({ where: { deletedAt: null, status: "WAITING", project: { deletedAt: null } } }),
    prisma.project.count({
      where: {
        deletedAt: null,
        status: { in: ["PLANNING", "ACTIVE", "AT_RISK", "ON_HOLD"] },
        deadline: { lte: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) },
      },
    }),
    prisma.recognitionEvent.findFirst({
      where: { toUserId: user.id },
      include: { project: true, fromUser: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.performanceSnapshot.findFirst({
      where: { userId: user.id, weekStart: startOfWeekUTC() },
      orderBy: { createdAt: "desc" },
    }),
    prisma.companionProfile.findUnique({ where: { userId: user.id } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Today Dashboard</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted))]">Priority first, reward second. Keep execution clear and calm.</p>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <CardTitle>Today&apos;s Priorities</CardTitle>
          {priorities.length ? (
            <ul className="space-y-2 text-sm">
              {priorities.map((p) => (
                <li key={p.id} className="rounded-md border border-[hsl(var(--border))] px-3 py-2">
                  <div className="font-medium">
                    <Link className="hover:underline" href={`/projects/${p.id}`}>
                      {p.name}
                    </Link>
                  </div>
                  <div className="text-xs text-[hsl(var(--muted))]">
                    {p.company.name} · Owner {p.owner.name} · {labelProjectStatus(p.status)} · {countdownPhrase(p.deadline)}
                  </div>
                  <div className="mt-2 h-2 w-full rounded bg-black/10 dark:bg-white/10">
                    <div className="h-2 rounded bg-[hsl(var(--accent))]" style={{ width: `${Math.max(0, Math.min(100, p.progressPercent))}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[hsl(var(--muted))]">No active priorities yet.</p>
          )}
        </Card>

        <Card className="space-y-3">
          <CardTitle>Execution Snapshot</CardTitle>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md border border-[hsl(var(--border))] p-3">
              <div className="text-xs text-[hsl(var(--muted))]">Blocked nodes</div>
              <div className="text-lg font-semibold">{blockedCount}</div>
            </div>
            <div className="rounded-md border border-[hsl(var(--border))] p-3">
              <div className="text-xs text-[hsl(var(--muted))]">Waiting approvals</div>
              <div className="text-lg font-semibold">{waitingApprovalCount}</div>
            </div>
            <div className="rounded-md border border-[hsl(var(--border))] p-3">
              <div className="text-xs text-[hsl(var(--muted))]">Due in 7 days</div>
              <div className="text-lg font-semibold">{dueSoonCount}</div>
            </div>
            <div className="rounded-md border border-[hsl(var(--border))] p-3">
              <div className="text-xs text-[hsl(var(--muted))]">Open projects</div>
              <div className="text-lg font-semibold">{visible.length}</div>
            </div>
          </div>
        </Card>

        <Card className="space-y-3">
          <CardTitle>One Good Thing Today</CardTitle>
          {latestRec ? (
            <div className="rounded-md border border-[hsl(var(--border))] p-3 text-sm">
              <div className="font-medium">{latestRec.tagLabel}</div>
              <div className="text-xs text-[hsl(var(--muted))]">
                {labelRecognitionCategory(latestRec.tagCategory)} · {latestRec.project?.name ?? "General"}
              </div>
              <p className="mt-1 text-sm">{latestRec.message ?? "You were recognized for meaningful contribution."}</p>
              <div className="mt-1 text-xs text-[hsl(var(--muted))]">From {latestRec.fromUser?.name ?? "A teammate"}</div>
            </div>
          ) : (
            <p className="text-sm text-[hsl(var(--muted))]">No recognition yet this cycle. Keep shipping.</p>
          )}
          {companion ? (
            <p className="text-xs text-[hsl(var(--muted))]">
              Companion: {companion.name ?? labelCompanionSpecies(companion.species)} · mood {companion.mood} · level {companion.level}
            </p>
          ) : null}
        </Card>

        <Card className="space-y-3">
          <CardTitle>Score / Reward Preview</CardTitle>
          {latestSnapshot ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between"><span>Execution</span><span>{latestSnapshot.executionScore}</span></div>
              <div className="flex items-center justify-between"><span>Collaboration</span><span>{latestSnapshot.collaborationScore}</span></div>
              <div className="flex items-center justify-between"><span>Knowledge</span><span>{latestSnapshot.knowledgeScore}</span></div>
              <div className="flex items-center justify-between"><span>Recognition</span><span>{latestSnapshot.recognitionScore}</span></div>
              <div className="border-t pt-2 text-xs text-[hsl(var(--muted))]">
                Trend this week: {latestSnapshot.trendDelta >= 0 ? "+" : ""}{latestSnapshot.trendDelta}
              </div>
              <Link className="text-xs font-medium text-[hsl(var(--accent))] underline" href="/leaderboard">Open leaderboard</Link>
            </div>
          ) : (
            <p className="text-sm text-[hsl(var(--muted))]">No score snapshot yet for this week.</p>
          )}
        </Card>
      </section>
    </div>
  );
}
