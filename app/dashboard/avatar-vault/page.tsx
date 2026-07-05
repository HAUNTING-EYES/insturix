import { auth } from '@clerk/nextjs/server';
import AvatarVaultV2 from '@/components/dashboard/avatar-vault/v2/avatar-vault-v2';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// v2 is the live Avatar Vault (gallery → forge → render planner). The old
// AvatarVaultReview component stays in the tree for rollback but is no longer routed.
export default async function AvatarVaultDashboard() {
  const session = await auth();
  if (!session?.userId) return null;

  return <AvatarVaultV2 />;
}
