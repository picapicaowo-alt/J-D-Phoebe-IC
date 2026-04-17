import { requireUser } from "@/lib/auth";
import { getMessagingPageData } from "@/lib/direct-messages";
import { getLocale } from "@/lib/locale";
import { MessagesPageBody } from "@/components/messages-page-body";

export default async function MessagesPage() {
  const [user, locale] = await Promise.all([requireUser(), getLocale()]);
  const initialData = await getMessagingPageData(user, undefined, { includeGroupOptions: false });

  return <MessagesPageBody locale={locale} currentUserId={user.id} initialData={initialData} />;
}
