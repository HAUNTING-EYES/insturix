import CalosCalendarV3 from '@/components/dashboard/calos/v3/calos-calendar';

// CalOS — the v3 calendar is now the primary experience, swapped in from the /v3 preview
// after review. It self-loads brands and wires every action to the real CalOS service
// (deliverables, decisions, campaigns, auto-fill/ai-plan, connections, client-view).
//
// The prior UI (the old Calendar + CampaignBar + CommandBrief composition, still present in
// this directory + components/dashboard/ThinkForge) is retired. To roll back, revert this file.
export default function CalosPage() {
  return <CalosCalendarV3 />;
}
