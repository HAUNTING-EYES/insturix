import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { withAdmin } from '@/lib/api/middleware/withAdmin';

// curl -X POST http://localhost:3000/api/admin/migrations/migrate-collections \
//   -H "Authorization: Bearer abc" \
//   -H "Content-Type: application/json" \
//   -d '{
//     "sourceUri": "mongodb+srv://xyz",
//     "sourceDb": "source_db", 
//     "sourceCollection": "alyzitron_analyses",
//     "targetUri": "xyz",
//     "targetDb": "insturix_prod",
//     "targetCollection": "alyzitron_tasks",
//     "dryRun": true,
//     "deleteAfter": false
//   }'

interface MigrationRequest {
  sourceUri: string;
  sourceDb: string;
  sourceCollection: string;
  targetUri: string;
  targetDb: string;
  targetCollection: string;
  dryRun?: boolean;
  deleteAfter?: boolean;
}

interface MigrationResult {
  success: boolean;
  message: string;
  details?: {
    sourceDb: string;
    sourceCollection: string;
    targetDb: string;
    targetCollection: string;
    documentsMigrated?: number;
    documentsDeleted?: number;
    dryRun: boolean;
  };
  error?: string;
}

async function handler(req: Request): Promise<NextResponse> {
  if (req.method !== 'POST') {
    return NextResponse.json({ message: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = await req.json() as MigrationRequest;
    
    // Validate required fields
    const requiredFields = ['sourceUri', 'sourceDb', 'sourceCollection', 'targetUri', 'targetDb', 'targetCollection'] as const;
    for (const field of requiredFields) {
      if (!(body as any)[field]) {
        return NextResponse.json({
          message: 'Bad request',
          error: `Missing required field: ${field}`
        }, { status: 400 });
      }
    }

    console.log(`[Migration] Starting migration - Source: ${body.sourceDb}.${body.sourceCollection} -> Target: ${body.targetDb}.${body.targetCollection}`);
    console.log(`[Migration] Dry run: ${body.dryRun ?? false}, Delete after: ${body.deleteAfter ?? false}`);

    const result = await runMigration(body);
    return NextResponse.json(result, { status: result.success ? 200 : 500 });

  } catch (error: any) {
    console.error('[Migration] Failed:', error);
    return NextResponse.json({ 
      message: 'Migration failed', 
      error: error.message 
    }, { status: 500 });
  }
}

export const POST = withAdmin(handler);

async function runMigration(config: MigrationRequest): Promise<MigrationResult> {
  const { 
    sourceUri, 
    sourceDb, 
    sourceCollection, 
    targetUri, 
    targetDb, 
    targetCollection, 
    dryRun = false, 
    deleteAfter = false 
  } = config;

  try {
    console.log(`[Migration] Connecting to source database: ${sourceUri}`);
    const sourceConn = await connectToMongoDB(sourceUri, sourceDb);
    
    console.log(`[Migration] Connecting to target database: ${targetUri}`);
    const targetConn = await connectToMongoDB(targetUri, targetDb);

    // Verify connections
    await sourceConn.db!.admin().ping();
    await targetConn.db!.admin().ping();
    console.log('[Migration] Successfully connected to both databases');

    // Check if source collection exists
    const collections1 = await sourceConn.db!.listCollections().toArray();
    const sourceCollectionExists = collections1.some(col => col.name === sourceCollection);
    
    if (!sourceCollectionExists) {
      throw new Error(`Source collection '${sourceCollection}' does not exist in database '${sourceDb}'`);
    }

    // Check if target collection exists, if not create it
    const collections2 = await targetConn.db!.listCollections().toArray();
    const targetCollectionExists = collections2.some(col => col.name === targetCollection);
    
    if (!targetCollectionExists) {
      console.log(`[Migration] Target collection '${targetCollection}' does not exist, creating it...`);
      if (!dryRun) {
        await targetConn.db!.createCollection(targetCollection);
      } else {
        console.log(`[Migration] DRY RUN: Would create collection '${targetCollection}'`);
      }
    }

    // Perform migration
    const result = await migrateCollection(
      sourceConn,
      targetConn,
      sourceCollection,
      targetCollection,
      dryRun,
      deleteAfter
    );

    // Close connections
    await sourceConn.close();
    await targetConn.close();

    return {
      success: true,
      message: dryRun ? 'Migration simulation completed successfully' : 'Migration completed successfully',
      details: {
        sourceDb,
        sourceCollection,
        targetDb,
        targetCollection,
        documentsMigrated: result.migratedCount,
        documentsDeleted: result.deletedCount,
        dryRun,
      },
    };

  } catch (error) {
    console.error('[Migration] Error:', error);
    throw error;
  }
}

async function migrateCollection(
  sourceConn: mongoose.Connection,
  targetConn: mongoose.Connection,
  sourceCollectionName: string,
  targetCollectionName: string,
  dryRun: boolean,
  deleteAfter: boolean
) {
  try {
    const sourceCollection = sourceConn.db!.collection(sourceCollectionName);
    const targetCollection = targetConn.db!.collection(targetCollectionName);

    console.log(`[Migration] Processing ${sourceCollectionName} -> ${targetCollectionName}`);

    // Get total count for progress tracking
    const totalCount = await sourceCollection.countDocuments();
    console.log(`[Migration] Total documents to process: ${totalCount}`);

    // Batch size for migration
    const BATCH_SIZE = 1000;
    let processedCount = 0;
    let migratedCount = 0;
    let deletedCount = 0;
    let skip = 0;

    while (true) {
      // Get batch of documents
      const documents = await sourceCollection
        .find({})
        .skip(skip)
        .limit(BATCH_SIZE)
        .toArray();

      if (documents.length === 0) {
        break; // No more documents to process
      }

      if (!dryRun) {
        // Insert documents into target collection
        await targetCollection.insertMany(documents, { ordered: false });
        migratedCount += documents.length;

        // Delete from source if requested
        if (deleteAfter) {
          const deleteResult = await sourceCollection.deleteMany({
            _id: { $in: documents.map(doc => doc._id) }
          });
          deletedCount += deleteResult.deletedCount;
        }
      } else {
        console.log(`[Migration] DRY RUN: Would process ${documents.length} documents`);
        migratedCount += documents.length;
      }

      processedCount += documents.length;
      skip += BATCH_SIZE;

      console.log(`[Migration] Processed ${processedCount}/${totalCount} documents (Migrated: ${migratedCount}, Deleted: ${deletedCount})`);

      // Small delay to prevent overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`[Migration] Completed processing ${processedCount} documents`);
    return { migratedCount, deletedCount };
  } catch (error) {
    console.error(`[Migration] Error migrating collection ${sourceCollectionName}:`, error);
    throw error;
  }
}

async function connectToMongoDB(uri: string, dbName: string) {
  try {
    const conn = await mongoose.createConnection(uri, {
      bufferCommands: false,
      dbName,
    });
    
    // Wait for connection to be established
    await new Promise<void>((resolve, reject) => {
      conn.on('connected', resolve);
      conn.on('error', reject);
    });
    
    return conn;
  } catch (error) {
    console.error(`[Migration] Failed to connect to MongoDB at ${uri}:`, error);
    throw error;
  }
}