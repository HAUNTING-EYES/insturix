import { auth } from "@clerk/nextjs/server";
import { UploaderXClientWrapper } from "@/components/dashboard/UploaderX/ClientWrapper";

export const revalidate = 30;

export default async function UploaderXDashboard() {
  const session = await auth();
  if (!session?.userId) return null;

  return (
    <div style={{ padding: "0 24px", maxWidth: 860, margin: "0 auto" }}>
      <UploaderXClientWrapper />
    </div>
  );
}
