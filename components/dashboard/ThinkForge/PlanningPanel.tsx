'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

type PlanningPanelProps = {
  isOpen: boolean; // kept for API compatibility with PlanningMode
  onClose: () => void;
  onOpenScript?: (sessionId: string) => void;
  onCreateCardFromIdea?: (idea: unknown, date: Date) => void;
};

/**
 * The content calendar now lives as the standalone CalOS service at /dashboard/calos
 * (scoped per client, backed by the CalOS deliverables API). This ThinkForge Planning tab
 * redirects there so there is ONE calendar, not two competing data stores. (The previous
 * in-ThinkForge calendar + useContentPlanning hook are superseded by CalOS.)
 */
export default function PlanningPanel(_props: PlanningPanelProps) {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/calos');
  }, [router]);

  return (
    <div className="relative w-full h-full bg-[#0B0B0A] flex items-center justify-center">
      <p className="text-[#7A776E] text-sm">Planning moved to the Plan tab. Redirecting…</p>
    </div>
  );
}
