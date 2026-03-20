import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getReferenceImageSet, saveReferenceImageSet } from '@/lib/pipeline/reference-image-db';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ refSetId: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { refSetId } = await params;
    const refSet = await getReferenceImageSet(refSetId, userId);
    if (!refSet) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Approve all generated subjects
    for (const subject of refSet.subjects) {
      if (subject.status === 'generated') {
        subject.status = 'approved';
      }
    }

    const allApproved = refSet.subjects.every((s) => s.status === 'approved');
    refSet.status = allApproved ? 'approved' : 'partial';
    refSet.updatedAt = new Date();
    await saveReferenceImageSet(refSet);

    return NextResponse.json({
      success: true,
      approvedSubjects: refSet.subjects
        .filter((s) => s.status === 'approved')
        .map((s) => ({
          subjectId: s.subjectId,
          name: s.name,
          imageUrl: s.imageUrl,
          scenesAppearingIn: s.scenesAppearingIn,
        })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
