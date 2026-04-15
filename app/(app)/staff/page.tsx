import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { AppShellLoading } from "@/components/app-shell-loading";
import { StaffDirectoryBody } from "./staff-directory-body";

export default async function StaffDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; companyId?: string; departmentId?: string; active?: string }>;
}) {
  await requireUser();
  return (
    <Suspense fallback={<AppShellLoading />}>
      <StaffDirectoryBody searchParams={searchParams} />
    </Suspense>
  );
}
