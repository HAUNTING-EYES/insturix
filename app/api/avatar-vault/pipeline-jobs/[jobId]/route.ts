import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { refreshAvatarPipelineJobFromRequest } from '@/lib/avatar/avatar-pipeline-job';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: { code: 'unauthorized', message: 'Sign in to inspect avatar pipeline jobs.' } },
      { status: 401 },
    );
  }

  const { jobId } = await params;
  const result = await refreshAvatarPipelineJobFromRequest({
    userId,
    orgId,
    jobId,
  });

  return NextResponse.json(result.body, { status: result.status });
}
