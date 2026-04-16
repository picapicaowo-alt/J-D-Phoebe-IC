import { Suspense } from "react";
import { AppShellLoading } from "@/components/app-shell-loading";
import { ProjectsPageBody } from "./projects-page-body";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={<AppShellLoading />}>
      <ProjectsPageBody searchParams={searchParams} />
    </Suspense>
  );
}
