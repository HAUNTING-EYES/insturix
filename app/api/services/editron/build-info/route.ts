import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  const deploymentHost = process.env.VERCEL_URL?.trim();
  if (!commitSha || !deploymentHost) {
    return NextResponse.json(
      { success: false, error: 'Deployment identity is unavailable.' },
      { status: 503 },
    );
  }

  return NextResponse.json({
    success: true,
    version: 'editron-build-identity-v1',
    commitSha,
    deploymentUrl: `https://${deploymentHost}`,
    environment: process.env.VERCEL_ENV ?? 'unknown',
  });
}
