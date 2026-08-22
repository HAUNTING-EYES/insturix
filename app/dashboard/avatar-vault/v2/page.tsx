import AvatarVaultV2 from '@/components/dashboard/avatar-vault/v2/avatar-vault-v2';

// Avatar Vault v2 preview route. The founder's avatar-vault.jsx redesign, wired to the
// real avatar types/hook, living alongside the current /dashboard/avatar-vault so nothing
// regresses while the forge + render planner are built. Swap in once complete + approved.
export default function AvatarVaultV2PreviewPage() {
  return <AvatarVaultV2 />;
}
