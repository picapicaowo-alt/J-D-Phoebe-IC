import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import type { AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { KnowledgeHubBody } from "./knowledge-hub-body";
import { KnowledgeHubSkeleton } from "./knowledge-hub-skeleton";

export default async function KnowledgeHubPage() {
  const user = (await requireUser()) as AccessUser;
  if (!(await userHasPermission(user, "knowledge.read"))) redirect("/home");

  return (
    <Suspense fallback={<KnowledgeHubSkeleton />}>
      <KnowledgeHubBody />
    </Suspense>
  );
}
