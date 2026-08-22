import { redirect } from 'next/navigation';

/**
 * Redirect (2026-08 audit, Phase 3): Orphaned campaign workspace, broken by bitrot (read a localStorage key nothing writes); the calendar hosts the live campaign workspace.
 * Kept as a redirect rather than deleted so old links/bookmarks still land
 * somewhere useful instead of a 404.
 */
export default function RedirectPage() {
  redirect('/dashboard/calos');
}
