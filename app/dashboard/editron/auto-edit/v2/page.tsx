import { notFound } from 'next/navigation';
import { internalToolsEnabled } from '@/lib/editron/internal-tools';
import AutoEditDemoClient from './demo-client';

/**
 * Design-review harness for the auto-edit processing screen: a timer-driven
 * demo with fictional copy ("vlogbrothers_720p.mp4", "Trimmed 11 seconds…")
 * and a no-op "Open in editor" button. Useful to operators, a dead end for
 * customers — gated like the debug console (INTERNAL_TOOLS_ENABLED).
 */
export default function AutoEditDemoPage() {
  if (!internalToolsEnabled()) notFound();
  return <AutoEditDemoClient />;
}
