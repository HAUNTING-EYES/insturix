import type { AvatarProfileStatus, AvatarUsagePreset } from '@/lib/avatar/avatar-profile';
import type { AvatarProviderId } from '@/lib/avatar/avatar-provider-adapter';

/* ═══ Avatar Vault v2 · design tokens ═════════════════════════════════
   Warm-dark, gold-only accent. Verbatim from the founder's avatar-vault.jsx.
   Labels/status meta are sourced from the real avatar types so the UI can
   never drift from the enums it renders. */

// Values point at design-tokens.css variables (P2.7) so a theme change propagates; keep any NEW key a var(--…) too.
export const C = {
  bg: 'var(--bg-canvas)', raised: 'var(--bg-raised)', surface: 'var(--bg-deeper)', well: 'var(--bg-well)',
  border: 'var(--border-subtle)', bs: 'var(--border-emphasis)',
  text: 'var(--text-primary)', soft: 'var(--text-secondary)', muted: 'var(--text-muted)', dim: 'var(--text-dim)', faint: 'var(--text-faint)',
  gold: 'var(--accent-gold)', goldH: 'var(--accent-gold-hover)', green: 'var(--status-success)', coral: 'var(--status-danger)',
} as const;

export const EASE = 'cubic-bezier(0.16,1,0.3,1)';
export const MONO = "'JetBrains Mono',ui-monospace,monospace";
export const SANS = "'Plus Jakarta Sans',system-ui,sans-serif";

/** The real usage presets (avatar-profile.ts) — replaces the prototype's
    invented UGC/Explainer chips. */
export const USAGE_PRESETS: Array<[AvatarUsagePreset, string]> = [
  ['product_shoot', 'Product shoot'],
  ['speech_delivery', 'Speech'],
  ['explainer_host', 'Explainer'],
  ['ad_actor', 'Ad actor'],
  ['social_presenter', 'Social'],
];
const USAGE_LABEL: Record<AvatarUsagePreset, string> = Object.fromEntries(USAGE_PRESETS) as Record<AvatarUsagePreset, string>;
export const usageLabel = (p: AvatarUsagePreset): string => USAGE_LABEL[p] ?? p;

/** The real providers (avatar-provider-adapter.ts) — replaces the prototype's
    D-ID/HeyGen/OmniHuman guesses. Display copy only; capabilities come from
    AVATAR_PROVIDER_DESCRIPTORS at render time. */
export const PROVIDER_META: Record<AvatarProviderId, { name: string; note: string; tag: string }> = {
  d_id: { name: 'D-ID', note: 'Portrait speech · fast', tag: 'PORTRAIT' },
  a2e: { name: 'A2E', note: 'Talking avatar · flexible', tag: 'PORTRAIT' },
  omnihuman_fal: { name: 'OmniHuman · Fal', note: 'Full-body · needs voice', tag: 'FULL BODY' },
  minimax_s2v_fal: { name: 'MiniMax S2V · Fal', note: 'Subject-to-video', tag: 'SUBJECT' },
};

/** Status chip meta — every AvatarProfileStatus, not just draft/accepted. */
export const statusMeta = (status: AvatarProfileStatus): { label: string; color: string; dot: string } => {
  switch (status) {
    case 'accepted': return { label: 'Accepted', color: C.gold, dot: C.gold };
    case 'rejected': return { label: 'Rejected', color: C.coral, dot: C.coral };
    case 'superseded': return { label: 'Superseded', color: C.dim, dot: C.dim };
    case 'disabled': return { label: 'Disabled', color: C.dim, dot: C.faint };
    default: return { label: 'Draft', color: C.muted, dot: C.dim };
  }
};

export const initialsOf = (name: string): string =>
  name ? name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '?';
