import { redirect } from 'next/navigation';

/**
 * Redirect (2026-08 audit, Phase 3): The old draft intake — a divergent twin of the studio (different backend + pricing, fake progress); only reachable by stale bookmarks.
 * Kept as a redirect rather than deleted so old links/bookmarks still land
 * somewhere useful instead of a 404.
 */
export default function RedirectPage() {
  redirect('/dashboard/editron/saas-explainer/studio');
}
