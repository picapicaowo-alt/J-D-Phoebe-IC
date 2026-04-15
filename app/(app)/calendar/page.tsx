import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { AppShellLoading } from "@/components/app-shell-loading";
import { CalendarPageBody } from "./calendar-page-body";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    create?: string;
    sourceKind?: string;
    sourceId?: string;
    y?: string;
    m?: string;
    view?: string;
    eventId?: string;
    defaultProjectId?: string;
    slotDay?: string;
  }>;
}) {
  await requireUser();
  return (
    <Suspense fallback={<AppShellLoading />}>
      <CalendarPageBody searchParams={searchParams} />
    </Suspense>
  );
}
