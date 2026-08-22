import type { Metadata } from 'next';
import NewProjectFlow from '@/components/editron/project/new-project-flow';

// Preview route for the founder-finalized "New project" start-screen flow.
// Phase 1: renders the faithful design (SCRIPT wired to real create; UPLOAD/SAAS route to existing
// flows). Phase 2 promotes this to the Editron dashboard landing + inlines upload/saas wiring.
export const metadata: Metadata = {
  title: 'Editron — New project',
  robots: { index: false, follow: false },
};

export default function EditronNewProjectPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#070706', padding: '26px' }}>
      <NewProjectFlow />
    </div>
  );
}
