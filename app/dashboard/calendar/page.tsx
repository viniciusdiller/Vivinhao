import { redirect } from "next/navigation";
import { getAuthenticatedSession } from "@/lib/auth";
import { UnifiedCalendar } from "@/components/calendar/unified-calendar";

export default async function CalendarPage() {
  const session = await getAuthenticatedSession();

  if (!session) {
    redirect("/");
  }

  return <UnifiedCalendar tenantName={session.tenantName} />;
}
