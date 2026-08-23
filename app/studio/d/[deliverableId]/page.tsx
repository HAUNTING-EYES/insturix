import { StudioSession } from "@/components/studio/session";

/**
 * Phase 1: both mock deliverables render the same scripted session — the
 * route exists and is wired; per-deliverable data arrives with the Phase 2
 * adapter. Phase 6 adds notFound() for unknown ids.
 */
export default function StudioDeliverablePage() {
  return <StudioSession />;
}
