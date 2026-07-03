import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { AvatarVaultReview } from '@/components/dashboard/AvatarVault/AvatarVaultReview';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AvatarVaultDashboard() {
  // Launch gate: Avatar Vault is still being built, so it stays hidden in any environment
  // that has not explicitly opted in. Production leaves AVATAR_VAULT_ENABLED unset and this
  // route redirects away; set AVATAR_VAULT_ENABLED=true (e.g. on a preview/staging deploy)
  // to expose it while it is worked on. Reversible via env, no code change to un-hide.
  if (process.env.AVATAR_VAULT_ENABLED !== 'true') {
    redirect('/dashboard');
  }

  const session = await auth();
  if (!session?.userId) return null;

  return <AvatarVaultReview />;
}
