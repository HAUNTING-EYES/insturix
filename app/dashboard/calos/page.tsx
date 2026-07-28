import CalosCalendarV3 from '@/components/dashboard/calos/v3/calos-calendar';

// CalOS — the v3 calendar is now the primary experience, swapped in from the /v3 preview
// after review. It self-loads brands and wires every action to the real CalOS service
// (deliverables, decisions, campaigns, auto-fill/ai-plan, connections, client-view).
//
// The prior Calendar + CampaignBar + CommandBrief composition is retired; Git history remains
// the rollback source.
export default function CalosPage() {
  return <CalosCalendarV3 />;
}
