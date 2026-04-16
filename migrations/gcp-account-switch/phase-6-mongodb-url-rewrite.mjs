#!/usr/bin/env node
/**
 * PHASE 6: MongoDB URL Rewrite
 * =============================================================================
 * Rewrites all stored GCS URLs in MongoDB documents from old bucket names
 * to new bucket names (with -v2 suffix).
 *
 * This affects:
 *   - Editron projects (media asset URLs)
 *   - Clickatron sessions (image URLs, thumbnails)
 *   - Alyzitron analyses (video URLs)
 *   - Musitron tasks (audio URLs)
 *   - Socialize banners (image URLs)
 *
 * IMPORTANT:
 *   - This script creates a BACKUP collection before making changes
 *   - Dry-run mode by default — no writes unless --apply flag passed
 *   - Signed URLs expire anyway (7 days max), so stored URLs will be
 *     refreshed by asset-resolver naturally. This script just fixes
 *     the non-URL-path references (bucket names, gcsPath fields)
 *
 * Prerequisites:
 *   - Phase 3 complete (data copied to new buckets)
 *   - Node.js 18+ installed
 *   - MONGODB_URI env var set (or hardcode below)
 *
 * Usage:
 *   # Dry run (safe, shows what would change)
 *   node phase-6-mongodb-url-rewrite.mjs
 *
 *   # Apply changes
 *   node phase-6-mongodb-url-rewrite.mjs --apply
 * =============================================================================
 */

import { MongoClient } from 'mongodb';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env from project root
config({ path: resolve(__dirname, '../../.env.local') });
config({ path: resolve(__dirname, '../../.env.production') });

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------
const BUCKET_RENAMES = {
  'insturix': 'insturix-v2',
  'insturix-prev-gcs': 'insturix-prev-gcs-v2',
  'alyzitron-uploads': 'alyzitron-uploads-v2',
  'musitron': 'musitron-v2',
};

const COLLECTIONS_TO_SCAN = [
  'editron_projects',
  'editron_tasks',
  'editron_media',
  'editron_chat_sessions',
  'editron_render_history',
  'editron_checkpoints',
  'clickatron_tasks',
  'clickatron_sessions',
  'alyzitron_analyses',
  'alyzitron_tasks',
  'musitron_tasks',
  'socialize_banners',
  'socialize_profiles',
  'pipeline_storyboards',
  'pipeline_reference_images',
];

const APPLY = process.argv.includes('--apply');
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'insturix_prod';

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set. Export it or add to .env.local');
  process.exit(1);
}

// -----------------------------------------------------------------------------
// URL rewrite logic
// -----------------------------------------------------------------------------
function rewriteString(value) {
  if (typeof value !== 'string') return { changed: false, value };

  let newValue = value;
  let changed = false;

  for (const [oldBucket, newBucket] of Object.entries(BUCKET_RENAMES)) {
    // Pattern 1: https://storage.googleapis.com/BUCKET/...
    const httpPattern = new RegExp(`https://storage\\.googleapis\\.com/${oldBucket}(?=[/?])`, 'g');
    if (httpPattern.test(newValue)) {
      newValue = newValue.replace(httpPattern, `https://storage.googleapis.com/${newBucket}`);
      changed = true;
    }

    // Pattern 2: gs://BUCKET/...
    const gsPattern = new RegExp(`gs://${oldBucket}(?=[/?]|$)`, 'g');
    if (gsPattern.test(newValue)) {
      newValue = newValue.replace(gsPattern, `gs://${newBucket}`);
      changed = true;
    }
  }

  return { changed, value: newValue };
}

function rewriteDocument(doc) {
  let totalChanges = 0;

  function recurse(obj) {
    if (!obj || typeof obj !== 'object') return;

    for (const key of Object.keys(obj)) {
      const val = obj[key];

      if (typeof val === 'string') {
        const { changed, value: newVal } = rewriteString(val);
        if (changed) {
          obj[key] = newVal;
          totalChanges++;
        }
      } else if (Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) {
          if (typeof val[i] === 'string') {
            const { changed, value: newVal } = rewriteString(val[i]);
            if (changed) {
              val[i] = newVal;
              totalChanges++;
            }
          } else if (typeof val[i] === 'object') {
            recurse(val[i]);
          }
        }
      } else if (typeof val === 'object') {
        recurse(val);
      }
    }
  }

  recurse(doc);
  return totalChanges;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('MongoDB URL Rewrite — Phase 6');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`Mode:     ${APPLY ? '🔴 APPLY (will write changes)' : '🟢 DRY RUN (no writes)'}`);
  console.log(`DB:       ${DB_NAME}`);
  console.log(`Renames:  ${JSON.stringify(BUCKET_RENAMES, null, 2)}`);
  console.log('');

  if (APPLY) {
    console.log('⚠️  APPLY mode. Changes will be written.');
    console.log('   A backup will be created per collection before writing.');
    console.log('   Press Ctrl+C in next 10 seconds to abort...');
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const summary = {};

  for (const collectionName of COLLECTIONS_TO_SCAN) {
    console.log(`\n📂 Scanning: ${collectionName}`);
    const col = db.collection(collectionName);

    let docsScanned = 0;
    let docsChanged = 0;
    let totalFieldChanges = 0;
    const sampleChanges = [];

    // Backup collection if applying
    if (APPLY) {
      const backupName = `${collectionName}__gcp_migration_backup_${Date.now()}`;
      console.log(`   Creating backup: ${backupName}`);
      const allDocs = await col.find({}).toArray();
      if (allDocs.length > 0) {
        await db.collection(backupName).insertMany(allDocs);
        console.log(`   ✅ Backup created (${allDocs.length} docs)`);
      } else {
        console.log(`   ℹ️  Collection empty, no backup needed`);
      }
    }

    const cursor = col.find({});
    for await (const doc of cursor) {
      docsScanned++;
      const originalDoc = JSON.parse(JSON.stringify(doc));
      const changes = rewriteDocument(doc);

      if (changes > 0) {
        docsChanged++;
        totalFieldChanges += changes;

        if (sampleChanges.length < 3) {
          sampleChanges.push({
            _id: doc._id.toString(),
            fieldChanges: changes,
          });
        }

        if (APPLY) {
          const { _id, ...rest } = doc;
          await col.replaceOne({ _id }, rest);
        }
      }
    }

    summary[collectionName] = { docsScanned, docsChanged, totalFieldChanges };

    console.log(`   Scanned:  ${docsScanned} docs`);
    console.log(`   Changed:  ${docsChanged} docs (${totalFieldChanges} field changes)`);
    if (sampleChanges.length > 0) {
      console.log(`   Samples:  ${sampleChanges.map((s) => `${s._id} (${s.fieldChanges} fields)`).join(', ')}`);
    }
  }

  await client.close();

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════');

  let grandTotal = 0;
  for (const [collection, stats] of Object.entries(summary)) {
    if (stats.docsChanged > 0) {
      console.log(`${collection}:  ${stats.docsChanged}/${stats.docsScanned} docs changed (${stats.totalFieldChanges} fields)`);
      grandTotal += stats.totalFieldChanges;
    }
  }

  console.log('');
  console.log(`Total field rewrites: ${grandTotal}`);
  console.log(`Mode: ${APPLY ? '✅ APPLIED' : '🟡 DRY RUN (use --apply to write)'}`);
  console.log('');

  if (!APPLY && grandTotal > 0) {
    console.log('To apply these changes, run:');
    console.log('  node phase-6-mongodb-url-rewrite.mjs --apply');
  }
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
