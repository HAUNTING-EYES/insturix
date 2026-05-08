#!/usr/bin/env node

/**
 * Alyzitron GCS to R2 Migration Script
 *
 * This script migrates existing Alyzitron files from Google Cloud Storage (GCS)
 * to Cloudflare R2, updating the database records accordingly.
 *
 * Usage: node scripts/migrate-alyzitron-gcs-to-r2.js
 */

const { MongoClient } = require('mongodb');
const { GCSManager } = require('../app/api/services/alyzitron/utils/gcs');
const { AlyzitronR2Manager } = require('../app/api/services/alyzitron/utils/r2-manager');

// Environment variables
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'insturix_dev';
const ALYZITRON_COLLECTION = process.env.ALYZITRON_MONGO_COLLECTION || 'alyzitron_tasks';
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

async function migrateAlyzitronFiles() {
  console.log('🚀 Starting Alyzitron GCS to R2 Migration');

  // Validate environment
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is required');
  }
  if (!GCS_BUCKET_NAME) {
    throw new Error('GCS_BUCKET_NAME environment variable is required');
  }
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ACCOUNT_ID) {
    throw new Error('R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ACCOUNT_ID environment variables are required');
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(MONGODB_DB_NAME);
    const collection = db.collection(ALYZITRON_COLLECTION);

    // Find all tasks with GCS URLs
    const gcsTasks = await collection.find({
      videoUrl: { $regex: '^gs://' },
      status: { $in: ['completed', 'processing'] } // Only migrate completed/processing tasks
    }).toArray();

    console.log(`📊 Found ${gcsTasks.length} tasks with GCS URLs to migrate`);

    let migratedCount = 0;
    let errorCount = 0;

    for (const task of gcsTasks) {
      try {
        console.log(`\n🔄 Migrating task ${task._id}: ${task.videoUrl}`);

        // Extract GCS object path
        const objectPath = task.videoUrl.replace(`gs://${GCS_BUCKET_NAME}/`, '');

        // Check if file exists in GCS
        const existsInGCS = await GCSManager.fileExists(objectPath);
        if (!existsInGCS) {
          console.log(`⚠️  File not found in GCS: ${objectPath}, skipping...`);
          continue;
        }

        // Get signed URL for download
        const signedUrl = await GCSManager.getSignedReadUrl(objectPath);
        console.log(`📥 Got signed URL for download`);

        // Download file content
        const response = await fetch(signedUrl);
        if (!response.ok) {
          throw new Error(`Failed to download from GCS: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        console.log(`📦 Downloaded ${arrayBuffer.byteLength} bytes`);

        // Upload to R2
        const r2Key = `alyzitron/${task._id}/${objectPath.split('/').pop()}`;
        const r2Url = await AlyzitronR2Manager.uploadFile(arrayBuffer, task.metadata?.mimeType || 'video/mp4', r2Key);
        console.log(`☁️  Uploaded to R2: ${r2Url}`);

        // Update database record
        await collection.updateOne(
          { _id: task._id },
          {
            $set: {
              videoUrl: r2Url,
              'metadata.storageBackend': 'r2',
              'metadata.migratedFromGCS': true,
              'metadata.migrationDate': new Date(),
              updatedAt: new Date()
            }
          }
        );

        console.log(`✅ Successfully migrated task ${task._id}`);
        migratedCount++;

        // Optional: Delete from GCS after successful migration
        // Uncomment the following lines if you want to delete from GCS after migration
        // try {
        //   await GCSManager.deleteFromGCS(objectPath);
        //   console.log(`🗑️  Deleted from GCS: ${objectPath}`);
        // } catch (deleteError) {
        //   console.warn(`⚠️  Failed to delete from GCS: ${deleteError.message}`);
        // }

      } catch (error) {
        console.error(`❌ Failed to migrate task ${task._id}:`, error.message);
        errorCount++;

        // Mark task with migration error
        await collection.updateOne(
          { _id: task._id },
          {
            $set: {
              'metadata.migrationError': error.message,
              'metadata.migrationErrorDate': new Date(),
              updatedAt: new Date()
            }
          }
        );
      }
    }

    console.log(`\n🎉 Migration completed!`);
    console.log(`✅ Successfully migrated: ${migratedCount} tasks`);
    console.log(`❌ Failed to migrate: ${errorCount} tasks`);

  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

// Run the migration
if (require.main === module) {
  migrateAlyzitronFiles()
    .then(() => {
      console.log('🏁 Migration script finished');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateAlyzitronFiles };