"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setRolePermissionAction } from "@/app/actions/permissions";

type Role = { id: string; key: string; displayName: string };
type Perm = { id: string; key: string; category: string | null };

type Props = {
  roles: Role[];
  perms: Perm[];
  allowedKeys: Set<string>;
  readOnly?: boolean;
};

function key(roleId: string, permId: string) {
  return `${roleId}:${permId}`;
}

export function PermissionMatrix({ roles, perms, allowedKeys, readOnly }: Props) {
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
        <p className="bg-[hsl(var(--card))] px-3 py-2 text-xs text-[hsl(var(--muted))]">Saving permission change…</p>
      ) : null}
      <table className="w-full min-w-[720px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/10">
            <th className="sticky left-0 z-10 bg-[hsl(var(--background))] px-2 py-2 font-medium">Permission</th>
            {roles.map((r) => (
              <th key={r.id} className="px-2 py-2 font-medium">
                <div className="max-w-[120px] leading-tight">{r.displayName}</div>
                <div className="mt-0.5 font-mono text-[10px] text-[hsl(var(--muted))]">{r.key}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {perms.map((p) => (
            <tr key={p.id} className="border-b border-[hsl(var(--border))] odd:bg-black/[0.02] dark:odd:bg-white/[0.02]">
              <td className="sticky left-0 z-10 bg-[hsl(var(--background))] px-2 py-1.5 font-mono text-[10px] leading-tight">
                <div>{p.key}</div>
                {p.category ? <div className="text-[hsl(var(--muted))]">{p.category}</div> : null}
              </td>
              {roles.map((r) => {
                const on = allowedKeys.has(key(r.id, p.id));
                return (
                  <td key={r.id} className="px-1 py-1 text-center">
                    {readOnly ? (
                      <span
                        className={`inline-flex h-7 w-7 items-center justify-center rounded border text-[10px] font-medium ${
                          on
                            ? "border-emerald-600/40 bg-emerald-600/15 text-emerald-800 dark:text-emerald-200"
                            : "border-[hsl(var(--border))] text-[hsl(var(--muted))]"
                        }`}
                      >
                        {on ? "Y" : "—"}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => toggle(r.id, p.id, !on)}
                        className={`h-7 w-7 rounded border text-[10px] font-medium transition ${
                          on
                            ? "border-emerald-600/40 bg-emerald-600/15 text-emerald-800 dark:text-emerald-200"
                            : "border-[hsl(var(--border))] bg-transparent text-[hsl(var(--muted))]"
                        }`}
                        aria-label={`Toggle ${p.key} for ${r.key}`}
                      >
                        {on ? "Y" : "—"}
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
