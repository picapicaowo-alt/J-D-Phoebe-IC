import { Suspense } from "react";
import type { AccessUser } from "@/lib/access";
import { HomeBalancedDashboardRow } from "./home-balanced-dashboard-row";
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
      <div className="grid gap-4 lg:grid-cols-3">
        <HomeBalancedDashboardRow
          priorities={
            <Suspense fallback={<HomePrioritiesFallback />}>
              <HomePrioritiesSection user={user} />
            </Suspense>
          }
          sidebar={
            <>
              <Suspense fallback={<HomeExecutionSnapshotFallback />}>
                <HomeExecutionSnapshotSection user={user} snapshot={snapshot} />
              </Suspense>
              <Suspense fallback={<HomeSnapshotFallback />}>
                <HomeSnapshotSection user={user} snapshot={snapshot} />
              </Suspense>
              <Suspense fallback={<HomeGoodThingsFallback />}>
                <HomeGoodThingsSection user={user} />
              </Suspense>
            </>
          }
        />

        <Suspense fallback={<HomeScoreFallback />}>
          <HomeScoreSection user={user} />
        </Suspense>
      </div>
    </div>
  );
}
