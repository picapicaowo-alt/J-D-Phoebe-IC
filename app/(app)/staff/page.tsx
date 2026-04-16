import { Suspense } from "react";
import { AppShellLoading } from "@/components/app-shell-loading";
import { StaffDirectoryBody } from "./staff-directory-body";

export default async function StaffDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; companyId?: string; departmentId?: string; active?: string }>;
}) {
  return (
    <Suspense fallback={<AppShellLoading />}>
      <StaffDirectoryBody searchParams={searchParams} />
    </Suspense>
  );
}
