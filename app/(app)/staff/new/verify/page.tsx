import { redirect } from "next/navigation";

export default async function StaffInviteVerifyPage({
  searchParams: _searchParams,
}: {
  searchParams: Promise<{ inviteId?: string; error?: string }>;
}) {
  redirect("/staff/new");
}
