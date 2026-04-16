import { Suspense } from "react";
import { KnowledgeHubBody } from "./knowledge-hub-body";
import { KnowledgeHubSkeleton } from "./knowledge-hub-skeleton";

export default async function KnowledgeHubPage() {
  return (
    <Suspense fallback={<KnowledgeHubSkeleton />}>
      <KnowledgeHubBody />
    </Suspense>
  );
}
