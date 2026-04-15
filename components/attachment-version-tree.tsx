import Link from "next/link";
import type { AttachmentResourceKind } from "@prisma/client";
import type { Locale } from "@/lib/locale";
import { t } from "@/lib/messages";
import { FormSubmitButton } from "@/components/form-submit-button";
import { softDeleteAttachmentAction } from "@/app/actions/attachment-trash";

export type AttachmentVersionRow = {
  id: string;
  previousVersionId: string | null;
  fileName: string;
  createdAt: Date;
  /** Optional one-line note shown after the file name (e.g. attachment description). */
  description?: string | null;
  resourceKind?: AttachmentResourceKind;
  externalUrl?: string | null;
};

function allChains(rows: AttachmentVersionRow[]): AttachmentVersionRow[][] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const childOf = new Set(rows.map((r) => r.previousVersionId).filter(Boolean) as string[]);
  const heads = rows.filter((r) => !childOf.has(r.id));
  const used = new Set<string>();
  const chains: AttachmentVersionRow[][] = [];
  for (const head of heads) {
    if (used.has(head.id)) continue;
    const forward: AttachmentVersionRow[] = [];
    let cur: AttachmentVersionRow | undefined = head;
    while (cur && !used.has(cur.id)) {
      used.add(cur.id);
      forward.push(cur);
      cur = cur.previousVersionId ? byId.get(cur.previousVersionId) : undefined;
    }
    chains.push(forward);
  }
  for (const r of rows) {
    if (!used.has(r.id)) chains.push([r]);
  }
  return chains;
}

export function AttachmentVersionTree({
  attachments,
  locale,
  showTrash,
}: {
  attachments: AttachmentVersionRow[];
  locale: Locale;
  showTrash?: boolean;
}) {
  if (!attachments.length) return null;
  const chains = allChains(attachments);
  return (
    <div className="space-y-2">
      {chains.map((chain) => (
        <div
          key={chain.map((c) => c.id).join("-")}
          className="space-y-1 rounded-md border border-[hsl(var(--border))]/60 bg-black/[0.02] p-2 text-xs dark:bg-white/[0.02]"
        >
          <div className="font-medium text-[hsl(var(--muted))]">{t(locale, "attVersionChain")}</div>
          <ul className="space-y-1">
            {chain.map((row, i) => {
              const isUrl = row.resourceKind === "EXTERNAL_URL" && row.externalUrl;
              const href = isUrl ? row.externalUrl! : `/api/attachments/${row.id}`;
              return (
                <li key={row.id} className="flex flex-wrap items-center gap-2" style={{ paddingLeft: i * 12 }}>
                  <span className="text-[hsl(var(--muted))]">{i === 0 ? t(locale, "attHead") : "└"}</span>
                  <Link
                    className="text-[hsl(var(--accent))] underline"
                    href={href}
                    {...(isUrl ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  >
                    {row.fileName}
                  </Link>
                  {row.description ? (
                    <span className="text-[hsl(var(--muted))]"> — {row.description}</span>
                  ) : null}
                  <span className="text-[hsl(var(--muted))]">{row.createdAt.toISOString().slice(0, 10)}</span>
                  {showTrash ? (
                    <form action={softDeleteAttachmentAction} className="inline">
                      <input type="hidden" name="id" value={row.id} />
                      <FormSubmitButton type="submit" variant="secondary" className="h-6 px-1.5 text-xs">
                        {t(locale, "attMoveTrash")}
                      </FormSubmitButton>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
