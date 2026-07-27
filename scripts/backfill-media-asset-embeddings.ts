/**
 * Backfill script: regenerate media asset semantic embeddings.
 *
 * Fills missing or stale semanticEmbedding fields in mediaAssets using the current
 * Editron embedding model (gemini-embedding-001, 768 dimensions) and updates
 * semanticEmbeddingModel + semanticEmbeddingUpdatedAt.
 *
 * Idempotent and safe to run multiple times. Supports dry-run and row limit for
 * controlled rollout.
 *
 * Usage:
 *   MONGODB_URI=... EDITRON_MONGODB_DB_NAME=editron_prev npx tsx scripts/backfill-media-asset-embeddings.ts --dry-run
 *   MONGODB_URI=... MONGODB_DB_NAME=editron_prev npx tsx scripts/backfill-media-asset-embeddings.ts
 *   MONGODB_URI=... MONGODB_DB_NAME=editron_prev npx tsx scripts/backfill-media-asset-embeddings.ts --limit 100
 */

import { MongoClient } from 'mongodb';
import { EDITRON_EMBEDDING_MODEL, generateEditronEmbedding } from '../lib/editron/services/gemini-embedding';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitArgIndex = args.indexOf('--limit');
const LIMIT = limitArgIndex >= 0 && limitArgIndex + 1 < args.length
  ? Number.parseInt(args[limitArgIndex + 1], 10)
  : undefined;

interface MediaAssetBackfillDoc {
  _id: unknown;
  assetId?: string;
  userId?: string;
  type?: string;
  filename?: string;
  tags?: unknown;
}

function parseTags(rawTags: unknown): string[] {
  if (!Array.isArray(rawTags)) return [];
  return rawTags
    .filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
    .map((tag) => tag.trim())
    .slice(0, 30);
}

function buildEmbeddingText(asset: { filename?: string; type?: string; tags?: unknown }): string {
  const type = asset.type || 'video';
  const filename = (asset.filename || 'asset').trim();
  const tags = parseTags(asset.tags);
  return [filename, type, ...tags].join(' ').trim();
}

async function main() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.EDITRON_MONGODB_DB_NAME || process.env.MONGODB_DB_NAME;
  const targetModel = process.env.EDITRON_EMBEDDING_MODEL || EDITRON_EMBEDDING_MODEL;

  if (!uri || !dbName) {
    console.error('ERROR: Set MONGODB_URI and MONGODB_DB_NAME (or EDITRON_MONGODB_DB_NAME).');
    process.exit(1);
  }
  if (LIMIT !== undefined && (!Number.isInteger(LIMIT) || LIMIT <= 0)) {
    console.error('ERROR: --limit must be a positive integer.');
    process.exit(1);
  }

  console.log('Connecting...');
  console.log(`  Database: ${dbName}`);
  console.log(`  Target model: ${targetModel}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  if (LIMIT) console.log(`  Limit: ${LIMIT}`);

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const mediaAssets = db.collection('mediaAssets');

  const filter = {
    $or: [
      { semanticEmbedding: { $exists: false } },
      { semanticEmbedding: null },
      { semanticEmbedding: { $size: 0 } },
      { semanticEmbeddingModel: { $exists: false } },
      { semanticEmbeddingModel: { $ne: targetModel } },
    ],
  };

  const cursor = mediaAssets.find(filter, {
    projection: {
      _id: 1,
      assetId: 1,
      userId: 1,
      type: 1,
      filename: 1,
      tags: 1,
    },
  });

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for await (const doc of cursor) {
    scanned++;
    if (LIMIT && scanned > LIMIT) break;

    const typedDoc = doc as MediaAssetBackfillDoc;
    const assetId = typedDoc.assetId ?? `<no-assetId:${typedDoc._id?.toString?.()}>`;
    const tags = parseTags(typedDoc.tags);
    const embeddingText = buildEmbeddingText({
      filename: typedDoc.filename,
      type: typedDoc.type,
      tags,
    });

    if (!embeddingText.trim()) {
      console.warn(`  SKIP: ${assetId} has no embedding input`);
      skipped++;
      continue;
    }

    try {
      const embedding = await generateEditronEmbedding(embeddingText, {
        taskType: 'RETRIEVAL_DOCUMENT',
        title: typedDoc.filename,
      });

      if (!embedding) {
        console.warn(`  SKIP: ${assetId} embedding generation returned no vector`);
        skipped++;
        continue;
      }

      const update = {
        $set: {
          semanticEmbedding: embedding,
          semanticEmbeddingModel: targetModel,
          semanticEmbeddingUpdatedAt: new Date(),
        },
      };

      if (DRY_RUN) {
        console.log(`  WOULD UPDATE: ${assetId} (user ${typedDoc.userId ?? 'unknown'})`);
      } else {
        const updateFilter =
          typedDoc.assetId && typedDoc.userId
            ? { assetId: typedDoc.assetId, userId: typedDoc.userId }
            : { _id: typedDoc._id as any };
        await mediaAssets.updateOne(updateFilter, update);
        console.log(`  UPDATED: ${assetId} (user ${typedDoc.userId ?? 'unknown'})`);
      }

      updated++;
    } catch (err) {
      console.error(`  ERROR: ${assetId}: ${err instanceof Error ? err.message : String(err)}`);
      errors++;
    }
  }

  console.log('\n--- Backfill Summary ---');
  console.log(`Scanned:  ${scanned}`);
  console.log(`Updated:  ${updated}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Errors:   ${errors}`);
  if (DRY_RUN) console.log('\n(DRY RUN - no changes written)');

  await client.close();
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});


