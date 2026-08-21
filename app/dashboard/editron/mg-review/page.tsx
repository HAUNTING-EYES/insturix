import { notFound } from 'next/navigation';
import { internalToolsEnabled } from '@/lib/editron/internal-tools';
import MgReviewClient from './mg-review-client';

/**
 * Operator-only gate for the MG judge-calibration review. Labels submitted here
 * are written to the calibration ground-truth store (editron_mg_eval_labels),
 * so it must not be reachable by ordinary customers. 404s unless the deploy
 * sets INTERNAL_TOOLS_ENABLED (see lib/editron/internal-tools.ts); the API
 * route enforces the same flag server-side.
 */
export default function MgReviewPage() {
  if (!internalToolsEnabled()) notFound();
  return <MgReviewClient />;
}
