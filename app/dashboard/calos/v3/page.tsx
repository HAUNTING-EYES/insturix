import { redirect } from 'next/navigation';

/**
 * Redirect (2026-08 audit, Phase 3): Preview route that was never removed after v3 was swapped into the main route — two URLs served the same calendar.
 * Kept as a redirect rather than deleted so old links/bookmarks still land
 * somewhere useful instead of a 404.
 */
export default function RedirectPage() {
  redirect('/dashboard/calos');
}
