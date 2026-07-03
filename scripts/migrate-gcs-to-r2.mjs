/**
 * GCS → R2 Asset Migration Script
 *
 * Migrates all media assets from Google Cloud Storage to Cloudflare R2.
 * After migration, updates project overlays to use permanent CDN Worker URLs.
 *
 * Usage: node scripts/migrate-gcs-to-r2.mjs [--db editron_prev] [--dry-run]
 *
 * Requires env vars (from .env.production):
 *   GOOGLE_CLOUD_CREDENTIALS, GCS_BUCKET_NAME
 *   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ACCOUNT_ID, R2_BUCKET_NAME
 *   CDN_WORKER_URL, MONGODB_URI
 */

import { MongoClient } from 'mongodb';
import { Storage } from '@google-cloud/storage';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Parse Args ──────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const DB_NAME = args.find(a => a.startsWith('--db='))?.split('=')[1]
  || (args.includes('--db') ? args[args.indexOf('--db') + 1] : 'editron_prev');

console.log(`\n=== GCS → R2 Migration ===`);
console.log(`Database: ${DB_NAME}`);
console.log(`Dry run: ${DRY_RUN}`);
console.log('');

// ─── Load env from the appropriate env file ──────────────────
// Use .env.preview for editron_prev, .env.production for editron_prod
const envFile = DB_NAME === 'editron_prev' ? '.env.preview' : '.env.production';
const envPath = resolve(__dirname, '..', envFile);
console.log(`Loading env from: ${envFile}`);
const envContent = readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.+?)["']?\s*$/);
  if (match) env[match[1]] = match[2];
}

function requiredEnv(name) {
  const value = process.env[name] || env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

// Environment-backed configuration
const MONGODB_URI = requiredEnv('MONGODB_URI');
const CDN_WORKER_URL = requiredEnv('CDN_WORKER_URL');

// R2 credentials
const R2_ACCESS_KEY_ID = requiredEnv('R2_ACCESS_KEY_ID');
const R2_SECRET_ACCESS_KEY = requiredEnv('R2_SECRET_ACCESS_KEY');
const R2_ACCOUNT_ID = requiredEnv('R2_ACCOUNT_ID');
const R2_BUCKET_NAME = requiredEnv('R2_BUCKET_NAME');

// GCS credentials
const googleCloudCredentials = requiredEnv('GOOGLE_CLOUD_CREDENTIALS');
const gcsCredsJson = Buffer.from(googleCloudCredentials, 'base64').toString('utf-8');
const gcsCreds = JSON.parse(gcsCredsJson);

// GCS bucket from env file
const GCS_BUCKET = env.GCS_BUCKET_NAME || 'insturix';

console.log(`GCS bucket: ${GCS_BUCKET}`);
console.log(`R2 bucket: ${R2_BUCKET_NAME}`);
console.log(`CDN Worker: ${CDN_WORKER_URL}`);
console.log('');

// ─── Init Clients ────────────────────────────────────────────
const mongo = new MongoClient(MONGODB_URI);
const gcs = new Storage({ credentials: gcsCreds });
const gcsBucket = gcs.bucket(GCS_BUCKET);

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// ─── Helpers ─────────────────────────────────────────────────
async function r2Exists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    return true;
  } catch { return false; }
}

async function downloadFromGCS(gcsPath) {
  const file = gcsBucket.file(gcsPath);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [buffer] = await file.download();
  const [metadata] = await file.getMetadata();
  return { buffer, contentType: metadata.contentType || 'application/octet-stream' };
}

async function uploadToR2(key, buffer, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
}

// ─── Main Migration ──────────────────────────────────────────
async function migrate() {
  await mongo.connect();
  const db = mongo.db(DB_NAME);

  // Step 1: Migrate media assets
  console.log('=== Step 1: Migrate media assets ===\n');

  const assets = await db.collection('mediaAssets').find({
    gcsPath: { $exists: true, $ne: null },
    $or: [
      { r2Key: { $exists: false } },
      { r2Key: null },
    ],
  }).toArray();

  console.log(`Found ${assets.length} assets to migrate\n`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  let alreadyOnR2 = 0;

  for (const asset of assets) {
    const key = asset.assetId;
    const gcsPath = asset.gcsPath;

    // Check if already on R2
    if (await r2Exists(key)) {
      alreadyOnR2++;
      // Just update MongoDB
      if (!DRY_RUN) {
        await db.collection('mediaAssets').updateOne(
          { _id: asset._id },
          { $set: {
            r2Key: key,
            cachedUrl: `${CDN_WORKER_URL}/asset/${key}`,
            urlExpiresAt: null,
          }},
        );
      }
      process.stdout.write(`✓`);
      continue;
    }

    try {
      // Download from GCS
      const data = await downloadFromGCS(gcsPath);
      if (!data) {
        console.log(`\n  SKIP ${key}: GCS file not found at ${gcsPath}`);
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`\n  DRY: Would migrate ${key} (${Math.round(data.buffer.length / 1024)}KB ${data.contentType})`);
        migrated++;
        continue;
      }

      // Upload to R2
      await uploadToR2(key, data.buffer, data.contentType);

      // Update MongoDB
      await db.collection('mediaAssets').updateOne(
        { _id: asset._id },
        { $set: {
          r2Key: key,
          cachedUrl: `${CDN_WORKER_URL}/asset/${key}`,
          urlExpiresAt: null,
        }},
      );

      migrated++;
      process.stdout.write(`✓`);

      // Log every 50
      if (migrated % 50 === 0) {
        console.log(` [${migrated}/${assets.length}]`);
      }
    } catch (err) {
      console.log(`\n  FAIL ${key}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n\nStep 1 complete: ${migrated} migrated, ${alreadyOnR2} already on R2, ${skipped} skipped, ${failed} failed\n`);

  // Step 2: Update project overlay URLs
  console.log('=== Step 2: Update project overlay URLs ===\n');

  const projects = await db.collection('projects').find({}).toArray();
  let projectsUpdated = 0;
  let overlaysUpdated = 0;

  for (const project of projects) {
    let changed = false;
    const overlays = project.overlays || [];

    for (const overlay of overlays) {
      // Update src if it points to GCS and we have the asset on R2
      if (overlay.assetId && overlay.src && overlay.src.includes('storage.googleapis.com')) {
        const r2Url = `${CDN_WORKER_URL}/asset/${overlay.assetId}`;

        if (DRY_RUN) {
          console.log(`  DRY: ${project.projectId} overlay ${overlay.id} → ${r2Url}`);
        } else {
          overlay.src = r2Url;
          if (overlay.content && overlay.content.includes('storage.googleapis.com')) {
            overlay.content = r2Url;
          }
        }
        changed = true;
        overlaysUpdated++;
      }

      // Also update posterUrl
      if (overlay.posterUrl && overlay.posterUrl.includes('storage.googleapis.com')) {
        // Find the storyboard asset for this poster
        const posterAsset = await db.collection('mediaAssets').findOne({
          cachedUrl: { $regex: CDN_WORKER_URL },
          assetId: overlay.posterUrl.match(/storyboard_[a-zA-Z0-9_-]+/)?.[0],
        });
        if (posterAsset) {
          overlay.posterUrl = `${CDN_WORKER_URL}/asset/${posterAsset.assetId}`;
          changed = true;
        }
      }
    }

    if (changed && !DRY_RUN) {
      await db.collection('projects').updateOne(
        { _id: project._id },
        { $set: { overlays, updatedAt: new Date() } },
      );
      projectsUpdated++;
    }
  }

  console.log(`Step 2 complete: ${projectsUpdated} projects updated, ${overlaysUpdated} overlay URLs rewritten\n`);

  // Step 3: Summary
  console.log('=== Migration Summary ===');
  console.log(`Database: ${DB_NAME}`);
  console.log(`Assets migrated to R2: ${migrated}`);
  console.log(`Already on R2: ${alreadyOnR2}`);
  console.log(`Skipped (GCS file missing): ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Projects updated: ${projectsUpdated}`);
  console.log(`Overlay URLs rewritten: ${overlaysUpdated}`);
  if (DRY_RUN) console.log('\n⚠️  DRY RUN — no changes were made');

  await mongo.close();
}

migrate().catch(err => {
  console.error('\nMigration failed:', err);
  process.exit(1);
});
