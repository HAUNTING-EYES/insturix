import { auth } from '@clerk/nextjs/server';
import { AvatarVaultReview } from '@/components/dashboard/AvatarVault/AvatarVaultReview';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AvatarVaultDashboard() {
  const session = await auth();
  if (!session?.userId) return null;

  return <AvatarVaultReview />;
}
