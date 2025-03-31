"use client";

import { VideoUpload } from './VideoUpload';
import { AnalysisList } from './AnalysisList';
import { AlyzitronAnalysis } from '@/app/api/services/alyzitron/types';

interface ClientWrapperProps {
  initialAnalyses: AlyzitronAnalysis[];
}

export function ClientWrapper({ initialAnalyses }: ClientWrapperProps) {
  return (
    <div className="space-y-8">
      {/* Upload Section */}
      <VideoUpload
        onComplete={(analysisId: string) => {
          // This will trigger a server revalidation
          window.location.reload();
        }}
      />

      {/* Recent Analysis */}
      <AnalysisList initialAnalyses={initialAnalyses} />
    </div>
  );
}