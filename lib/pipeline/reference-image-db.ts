/**
 * Reference Image Database Operations
 */

import { getDatabase } from '@/lib/editron/db/mongodb';
import type { ReferenceImageSet, SubjectReference } from './schemas/reference-image';

const COLLECTION = 'referenceImages';

export async function saveReferenceImageSet(refSet: ReferenceImageSet): Promise<void> {
  const db = await getDatabase();
  await db.collection(COLLECTION).updateOne(
    { refSetId: refSet.refSetId },
    { $set: refSet },
    { upsert: true },
  );
}

export async function getReferenceImageSet(
  refSetId: string,
  userId: string,
): Promise<ReferenceImageSet | null> {
  const db = await getDatabase();
  const doc = await db.collection(COLLECTION).findOne({ refSetId, userId });
  return doc as unknown as ReferenceImageSet | null;
}

export async function updateSubjectReference(
  refSetId: string,
  subjectId: string,
  update: Partial<SubjectReference>,
): Promise<void> {
  const db = await getDatabase();
  const setOps: Record<string, any> = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(update)) {
    setOps[`subjects.$[elem].${key}`] = value;
  }
  await db.collection(COLLECTION).updateOne(
    { refSetId },
    { $set: setOps },
    { arrayFilters: [{ 'elem.subjectId': subjectId }] },
  );
}

/**
 * Add a new subject to an existing reference image set.
 */
export async function addSubjectToRefSet(
  refSetId: string,
  subject: SubjectReference,
): Promise<void> {
  const db = await getDatabase();
  await db.collection(COLLECTION).updateOne(
    { refSetId },
    {
      $push: { subjects: subject as any },
      $set: { updatedAt: new Date() },
    },
  );
}

/**
 * Remove a subject from an existing reference image set.
 */
export async function removeSubjectFromRefSet(
  refSetId: string,
  subjectId: string,
): Promise<void> {
  const db = await getDatabase();
  await db.collection(COLLECTION).updateOne(
    { refSetId },
    {
      $pull: { subjects: { subjectId } as any },
      $set: { updatedAt: new Date() },
    },
  );
}
