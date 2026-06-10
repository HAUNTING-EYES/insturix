import { auth } from "@clerk/nextjs/server";
import { BrandVaultReview } from "@/components/dashboard/BrandVault/BrandVaultReview";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BrandVaultDashboard() {
  const session = await auth();
  if (!session?.userId) return null;

  return <BrandVaultReview />;
}
