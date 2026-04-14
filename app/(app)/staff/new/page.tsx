import Link from "next/link";
import { createStaffAction } from "@/app/actions/staff";
import { requireUser } from "@/lib/auth";
import type { AccessUser } from "@/lib/access";
import { userHasPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default async function NewStaffPage() {
  const user = (await requireUser()) as AccessUser;
  const ok =
    (await userHasPermission(user, "staff.create")) &&
    (user.isSuperAdmin || user.groupMemberships.some((m) => m.roleDefinition.key === "GROUP_ADMIN"));
  if (!ok) redirect("/staff");

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="text-xs text-[hsl(var(--muted))]">
        <Link className="hover:underline" href="/staff">
          Staff
        </Link>{" "}
        / New
      </div>
      <Card className="space-y-4 p-6">
        <CardTitle>Add staff member</CardTitle>
        <form action={createStaffAction} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">Full name</label>
            <Input name="name" required />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Work email (login)</label>
            <Input name="email" type="email" required />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Initial password</label>
            <Input name="password" type="password" required minLength={8} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Title</label>
            <Input name="title" />
          </div>
          <Button type="submit">Create account</Button>
        </form>
        <p className="text-xs text-[hsl(var(--muted))]">After creation, assign companies and projects from the member profile.</p>
      </Card>
    </div>
  );
}
