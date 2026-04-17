import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { KnowledgeLayer } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import type { AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { KnowledgeBrowseBody } from "./knowledge-browse-body";
import { KnowledgeBrowseSkeleton } from "./knowledge-browse-skeleton";

export default async function KnowledgeBrowsePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    error?: string;
    layer?: KnowledgeLayer | "ALL";
    projectId?: string;
    companyId?: string;
    authorId?: string;
    tag?: string;
    create?: string;
  }>;
}) {
  const user = (await requireUser()) as AccessUser;
  if (!(await userHasPermission(user, "knowledge.read"))) redirect("/home");

  return (
    <Suspense fallback={<KnowledgeBrowseSkeleton />}>
      <KnowledgeBrowseBody searchParams={searchParams} />
    </Suspense>
  );
}
