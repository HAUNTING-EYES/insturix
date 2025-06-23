import { getUserData } from "@/lib/services/getUserData";
import DashboardClientLayout from "@/components/dashboard/DashboardClientLayout";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userData = await getUserData();

  return (
    <DashboardClientLayout initialUserData={JSON.parse(JSON.stringify(userData))}>
      {children}
    </DashboardClientLayout>
  );
}
