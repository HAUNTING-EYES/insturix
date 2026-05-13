import { auth } from "@clerk/nextjs/server";
import { ClickatronLayout } from "@/components/dashboard/Clickatron/ClickatronLayout";

export const revalidate = 30;

export default async function ClickatronDashboard() {
  const session = await auth();
  if (!session?.userId) return null;

  return (
    <div style={{ padding: "0 24px", maxWidth: 860, margin: "0 auto" }}>
      <ClickatronLayout />
    </div>
  );
}
