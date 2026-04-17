import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isClerkEnabled } from "@/lib/clerk-config";
import { getSignedInRedirectPath } from "@/lib/user-landing";

export default async function RootPage() {
  const user = await getCurrentUser();
  if (user?.active) {
    redirect(
      await getSignedInRedirectPath({
        userId: user.id,
        mustChangePassword: user.mustChangePassword,
        companionIntroCompletedAt: user.companionIntroCompletedAt,
      }),
    );
  }

  redirect(isClerkEnabled() ? "/sign-in" : "/login");
}
