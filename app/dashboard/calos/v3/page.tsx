import CalosCalendarV3 from '@/components/dashboard/calos/v3/calos-calendar';

// CalOS v3 preview route. The founder's calos-v3.jsx calendar wired to the real
// deliverables service, living alongside the current CalOS (app/dashboard/calos)
// so nothing regresses while Phases 2–3 (campaigns, generation, publishing,
// workspace, share) are built. Swap into the main route once complete + approved.
export default function CalosV3PreviewPage() {
  return <CalosCalendarV3 />;
}
