import { redirect } from "next/navigation";
import { getCurrentRedirectUser } from "@/lib/auth";
import { isClerkEnabled } from "@/lib/clerk-config";
import { getSignedInRedirectPath } from "@/lib/user-landing";

export default async function RootPage() {
  const user = await getCurrentRedirectUser();
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
