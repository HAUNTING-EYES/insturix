import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getReferenceImageSet, removeSubjectFromRefSet } from '@/lib/pipeline/reference-image-db';

/**
 * DELETE /api/services/pipeline/reference-images/[refSetId]/subject/[subjectId]/delete
 * Remove a subject from the reference set.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ refSetId: string; subjectId: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { refSetId, subjectId } = await params;

    const refSet = await getReferenceImageSet(refSetId, userId);
    if (!refSet) return NextResponse.json({ error: 'Reference set not found' }, { status: 404 });

    await removeSubjectFromRefSet(refSetId, subjectId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[delete-subject]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
