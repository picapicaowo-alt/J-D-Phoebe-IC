"use client";

import { useState } from "react";

type Props = {
  description: string;
  className?: string;
};

function TriangleIcon({ expanded }: { expanded: boolean }) {
  return expanded ? (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M4 6h8L8 11z" fill="currentColor" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5">
      <path d="M6 4v8l5-4z" fill="currentColor" />
    </svg>
  );
}

export function ProjectDescriptionToggle({ description, className }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={className}>
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse project description" : "Expand project description"}
          className="mt-0.5 shrink-0 rounded p-0.5 text-[hsl(var(--muted))] transition hover:bg-black/5 hover:text-[hsl(var(--foreground))] dark:hover:bg-white/5"
        >
          <TriangleIcon expanded={expanded} />
        </button>
        <p className={expanded ? "whitespace-pre-wrap break-words text-sm text-[hsl(var(--muted))]" : "min-w-0 truncate text-sm text-[hsl(var(--muted))]"}>
          {description}
        </p>
      </div>
    </div>
  );
}
