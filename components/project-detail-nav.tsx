import { cn } from "@/lib/utils";

export function ProjectDetailBreadcrumbs({
  homeLabel,
  projectsLabel,
  projectName,
}: {
  homeLabel: string;
  projectsLabel: string;
  projectName: string;
}) {
  return (
    <div className="text-xs text-[hsl(var(--muted))]">
      <a href="/home" className="hover:text-[hsl(var(--foreground))]">
        {homeLabel}
      </a>{" "}
      /{" "}
      <a href="/projects" className="hover:text-[hsl(var(--foreground))]">
        {projectsLabel}
      </a>{" "}
      / {projectName}
    </div>
  );
}

function ActionLink({
  href,
  label,
  className,
  active = false,
}: {
  href: string;
  label: string;
  className: string;
  active?: boolean;
}) {
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(className, active ? "bg-[hsl(var(--primary))] text-white hover:opacity-95" : "")}
    >
      {label}
    </a>
  );
}

export function ProjectDetailActionTabs({
  secondaryBtnClassName,
  primaryBtnClassName,
  homeLabel,
  projectId,
  recognitionLabel,
  growthLabel,
  editProjectLabel,
  showEditProject,
  editMembersLabel,
  showEditMembers,
  currentSection,
}: {
  secondaryBtnClassName: string;
  primaryBtnClassName: string;
  homeLabel: string;
  projectId: string;
  recognitionLabel: string;
  growthLabel: string;
  editProjectLabel: string;
  showEditProject: boolean;
  editMembersLabel: string;
  showEditMembers: boolean;
  currentSection: string | null;
}) {
  const detailHref = `/projects/${projectId}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ActionLink href="/home" label={homeLabel} className={secondaryBtnClassName} />
      {showEditProject ? (
        <ActionLink
          href={`${detailHref}?section=edit-project#section-edit-project`}
          label={editProjectLabel}
          className={primaryBtnClassName}
          active={currentSection === "edit-project"}
        />
      ) : null}
      {showEditMembers ? (
        <ActionLink
          href={`${detailHref}?section=edit-members#section-edit-members`}
          label={editMembersLabel}
          className={showEditProject ? secondaryBtnClassName : primaryBtnClassName}
          active={currentSection === "edit-members"}
        />
      ) : null}
      <ActionLink href={`/projects/${projectId}/recognition`} label={recognitionLabel} className={secondaryBtnClassName} />
      <ActionLink href={`/projects/${projectId}/growth`} label={growthLabel} className={secondaryBtnClassName} />
    </div>
  );
}
