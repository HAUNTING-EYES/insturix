import { auth } from '@clerk/nextjs/server';
import { NextRequest } from 'next/server';

import { handleMusicCatalogSearch } from '@/lib/editron/http/music-route-handlers';
import { EpidemicMusicCatalogProvider } from '@/lib/editron/music-catalog/epidemic-provider';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  return handleMusicCatalogSearch(request, {
    authenticate: auth,
    provider: new EpidemicMusicCatalogProvider(),
    loadProject: async (userId, projectId) => {
      const { projectService } = await import('@/lib/editron/services/project-service');
      return projectService.loadProject(userId, projectId);
    },
  });
}
