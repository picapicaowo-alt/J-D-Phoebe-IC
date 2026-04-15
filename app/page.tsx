import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isClerkEnabled } from "@/lib/clerk-config";

export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(user?.active ? "/home" : isClerkEnabled() ? "/sign-in" : "/login");
}
