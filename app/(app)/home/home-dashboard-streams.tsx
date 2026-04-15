import { Suspense } from "react";
import type { AccessUser } from "@/lib/access";
import { HomeExecutionSnapshotSection } from "./home-execution-snapshot-section";
import { HomeGoodThingsSection } from "./home-good-things-section";
import { HomePrioritiesSection } from "./home-priorities-section";
import { HomeScoreSection } from "./home-score-section";
import { HomeSnapshotSection } from "./home-snapshot-section";
import {
  HomeExecutionSnapshotFallback,
  HomeGoodThingsFallback,
  HomePrioritiesFallback,
  HomeScoreFallback,
  HomeSnapshotFallback,
} from "./home-suspense-fallback";

export function HomeDashboardStreams({ user, snapshot }: { user: AccessUser; snapshot: string }) {
  return (
    <div className="space-y-8">
      <Suspense fallback={<HomeSnapshotFallback />}>
        <HomeSnapshotSection user={user} snapshot={snapshot} />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-3">
        <Suspense fallback={<HomePrioritiesFallback />}>
          <HomePrioritiesSection user={user} />
        </Suspense>

        <div className="flex flex-col gap-4">
          <Suspense fallback={<HomeExecutionSnapshotFallback />}>
            <HomeExecutionSnapshotSection user={user} />
          </Suspense>
          <Suspense fallback={<HomeGoodThingsFallback />}>
            <HomeGoodThingsSection user={user} />
          </Suspense>
        </div>

        <Suspense fallback={<HomeScoreFallback />}>
          <HomeScoreSection user={user} />
        </Suspense>
      </div>
    </div>
  );
}
