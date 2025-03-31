import { NextRequest, NextResponse } from 'next/server';
import { Storage } from '@google-cloud/storage';
import { MongoClient } from 'mongodb';

async function testGCSConfig() {
  try {
    const storage = new Storage({
      projectId: process.env.GCS_PROJECT_ID,
      credentials: {
        client_email: process.env.GCS_CLIENT_EMAIL,
        private_key: process.env.GCS_PRIVATE_KEY,
      },
    });

    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME || '');
    const [bucketExists] = await bucket.exists();
    
    if (!bucketExists) {
      throw new Error(`Bucket ${process.env.GCS_BUCKET_NAME} not found`);
    }

    // Test file operations
    const testFileName = `test-${Date.now()}.txt`;
    const testFile = bucket.file(testFileName);
    await testFile.save('test content', { contentType: 'text/plain' });
    await testFile.delete();

    return {
      success: true,
      message: 'GCS configuration is working correctly',
      details: {
        projectId: process.env.GCS_PROJECT_ID,
        bucketName: process.env.GCS_BUCKET_NAME,
        operations: ['read', 'write', 'delete']
      }
    };

  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown GCS error',
      details: {
        projectId: process.env.GCS_PROJECT_ID,
        bucketName: process.env.GCS_BUCKET_NAME,
        possibleIssues: [
          'Invalid credentials',
          'Malformed private key',
          'Insufficient permissions',
          'Bucket not found'
        ]
      }
    };
  }
}

async function testMongoConnection() {
  try {
    const client = await MongoClient.connect(process.env.MONGODB_URI || '');
    const db = client.db(process.env.MONGODB_DB_NAME);
    
    // Test write permission
    const testCollection = db.collection('test_connection');
    await testCollection.insertOne({ test: true, timestamp: new Date() });
    await testCollection.deleteOne({ test: true });
    await client.close();

    return {
      success: true,
      message: 'MongoDB connection is working correctly',
      details: {
        database: process.env.MONGODB_DB_NAME,
        operations: ['connect', 'write', 'delete']
      }
    };

  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown MongoDB error',
      details: {
        database: process.env.MONGODB_DB_NAME,
        possibleIssues: [
          'Invalid connection string',
          'Database not accessible',
          'Invalid credentials',
          'Insufficient permissions'
        ]
      }
    };
  }
}

export async function GET() {
  const results = {
    mongodb: await testMongoConnection(),
    gcs: await testGCSConfig(),
    timestamp: new Date().toISOString()
  };

  const allSuccess = results.mongodb.success && results.gcs.success;

  return NextResponse.json({
    success: allSuccess,
    message: allSuccess 
      ? 'All services are configured correctly' 
      : 'Some services failed configuration test',
    results
  });
}