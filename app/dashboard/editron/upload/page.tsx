import { redirect } from 'next/navigation';

/**
 * Redirect (2026-08 audit, Phase 3): The old dashboard console. The landing flow inlined footage upload (Phase 2b) and /projects owns the project grid; nothing linked here.
 * Kept as a redirect rather than deleted so old links/bookmarks still land
 * somewhere useful instead of a 404.
 */
export default function RedirectPage() {
  redirect('/dashboard/editron');
}
