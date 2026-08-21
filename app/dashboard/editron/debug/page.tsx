import { notFound } from 'next/navigation';
import { internalToolsEnabled } from '@/lib/editron/internal-tools';
import EditronDebugClient from './debug-client';

/**
 * Operator-only gate for the Editron debug console. The console's actions spend
 * real provider money (Gemini Vision analysis, video diagnostics) and expose
 * signed asset URLs — it must never be reachable by ordinary customers, and
 * Clerk middleware alone does not distinguish them. 404s unless the deploy sets
 * INTERNAL_TOOLS_ENABLED (see lib/editron/internal-tools.ts).
 */
export default function EditronDebugPage() {
  if (!internalToolsEnabled()) notFound();
  return <EditronDebugClient />;
}
