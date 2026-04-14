import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { userHasPermission } from "@/lib/permissions";
import type { AccessUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { Card, CardTitle } from "@/components/ui/card";

function startOfWeekUTC() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

export default async function LeaderboardPage() {
  const user = (await requireUser()) as AccessUser;
  if (!(await userHasPermission(user, "leaderboard.read"))) redirect("/home");

  const rows = await prisma.performanceSnapshot.findMany({
    where: { weekStart: startOfWeekUTC() },
    include: { user: true },
    orderBy: [
      { executionScore: "desc" },
      { collaborationScore: "desc" },
      { knowledgeScore: "desc" },
      { recognitionScore: "desc" },
    ],
    take: 30,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Weekly Leaderboard</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted))]">Secondary page by design; home focuses on personal trend.</p>
      </div>
      <Card className="space-y-3">
        <CardTitle>Execution + Collaboration + Knowledge + Recognition</CardTitle>
        <ol className="space-y-2 text-sm">
          {rows.map((r, i) => (
            <li key={r.id} className="flex items-center justify-between rounded-md border border-[hsl(var(--border))] px-3 py-2">
              <span>{i + 1}. {r.user.name}</span>
              <span className="text-xs text-[hsl(var(--muted))]">E {r.executionScore} · C {r.collaborationScore} · K {r.knowledgeScore} · R {r.recognitionScore}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
