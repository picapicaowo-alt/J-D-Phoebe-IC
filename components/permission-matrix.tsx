"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setRolePermissionAction } from "@/app/actions/permissions";
import type { Locale } from "@/lib/locale";
import { describePermissionKey } from "@/lib/permission-labels";
import { t } from "@/lib/messages";

type Role = { id: string; key: string; displayName: string };
type Perm = { id: string; key: string; category: string | null };

type Props = {
  roles: Role[];
  perms: Perm[];
  allowedKeys: Set<string>;
  readOnly?: boolean;
  locale: Locale;
};

function key(roleId: string, permId: string) {
  return `${roleId}:${permId}`;
}

export function PermissionMatrix({ roles, perms, allowedKeys, readOnly, locale }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function toggle(roleId: string, permId: string, nextAllowed: boolean) {
    if (readOnly) return;
    startTransition(() => {
      const fd = new FormData();
      fd.set("roleDefinitionId", roleId);
      fd.set("permissionDefinitionId", permId);
      fd.set("allowed", nextAllowed ? "true" : "false");
      void setRolePermissionAction(fd).then(() => router.refresh());
    });
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))]">
      {pending ? (
        <p className="bg-[hsl(var(--card))] px-3 py-2 text-sm text-[hsl(var(--muted))]">{t(locale, "permSaving")}</p>
      ) : null}
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10">
            <th className="sticky left-0 z-10 bg-[hsl(var(--background))] px-3 py-3.5 text-sm font-medium">{t(locale, "permColPermission")}</th>
            {roles.map((r) => (
              <th key={r.id} className="px-3 py-3.5 text-sm font-medium">
                <div className="max-w-[140px] leading-snug">{r.displayName}</div>
                <div className="mt-1.5 font-mono text-xs leading-snug text-[hsl(var(--muted))]">{r.key}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {perms.map((p) => (
            <tr key={p.id} className="border-b border-[hsl(var(--border))] odd:bg-black/[0.02] dark:odd:bg-white/[0.02]">
              <td className="sticky left-0 z-10 bg-[hsl(var(--background))] px-3 py-3.5 text-sm leading-relaxed">
                <div className="font-medium text-[hsl(var(--foreground))]">{describePermissionKey(locale, p.key)}</div>
                <div className="mt-1 font-mono text-xs text-[hsl(var(--muted))]">{p.key}</div>
                {p.category ? <div className="mt-1 text-sm leading-snug text-[hsl(var(--muted))]">{p.category}</div> : null}
              </td>
              {roles.map((r) => {
                const on = allowedKeys.has(key(r.id, p.id));
                return (
                  <td key={r.id} className="px-1.5 py-2 text-center">
                    {readOnly ? (
                      <span
                        className={`inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-md border px-1.5 text-sm font-medium ${
                          on
                            ? "border-emerald-600/40 bg-emerald-600/15 text-emerald-800 dark:text-emerald-200"
                            : "border-[hsl(var(--border))] text-[hsl(var(--muted))]"
                        }`}
                      >
                        {on ? t(locale, "permYes") : t(locale, "permNo")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => toggle(r.id, p.id, !on)}
                        className={`h-9 min-w-[2.25rem] rounded-md border px-1.5 text-sm font-medium transition ${
                          on
                            ? "border-emerald-600/40 bg-emerald-600/15 text-emerald-800 dark:text-emerald-200"
                            : "border-[hsl(var(--border))] bg-transparent text-[hsl(var(--muted))]"
                        }`}
                        aria-label={`Toggle ${p.key} for ${r.key}`}
                      >
                        {on ? t(locale, "permYes") : t(locale, "permNo")}
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
