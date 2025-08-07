import { auth } from "@clerk/nextjs/server";
import { ClickatronLayout } from "@/components/dashboard/Clickatron/ClickatronLayout";

export const revalidate = 60;

export default async function ClickatronDashboard() {
  const session: any = await auth();
  if (!session?.userId) return null;

  return <ClickatronLayout/>;
}