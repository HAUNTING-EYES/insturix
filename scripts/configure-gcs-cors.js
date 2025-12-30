/**
 * Script to manually configure CORS on GCS bucket
 * Run this once to set up CORS properly
 * 
 * Usage: node scripts/configure-gcs-cors.js
 */

import { Storage } from '@google-cloud/storage';

async function configureCors() {
  try {
    // Load credentials from environment
    const gcsCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS
      ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
      : null;

    const bucketName = process.env.GCS_BUCKET_NAME;

    if (!gcsCredentials || !bucketName) {
      console.error('❌ Missing GCS credentials or bucket name in environment variables');
      console.error('Required: GOOGLE_CLOUD_CREDENTIALS, GCS_BUCKET_NAME');
      process.exit(1);
    }

    console.log('🔧 Initializing GCS client...');
    const storage = new Storage({
      projectId: gcsCredentials.project_id,
      credentials: gcsCredentials,
    });

    const bucket = storage.bucket(bucketName);

    // Build allowed origins
    const allowedOrigins = [
      // Production domains
      'https://www.insturix.com',
      'https://insturix.com',
    ];

    // Allow common localhost ports for development (3000-3010 covers most dev scenarios)
    for (let port = 3000; port <= 3010; port++) {
      allowedOrigins.push(`http://localhost:${port}`);
      allowedOrigins.push(`https://localhost:${port}`);
      allowedOrigins.push(`http://127.0.0.1:${port}`);
    }

    // Add environment URLs if available
    if (process.env.NEXT_PUBLIC_APP_URL) {
      allowedOrigins.push(process.env.NEXT_PUBLIC_APP_URL);
    }

    const vercelUrls = [
      process.env.VERCEL_URL,
      process.env.VERCEL_BRANCH_URL,
      process.env.NEXT_PUBLIC_VERCEL_URL,
    ];

    vercelUrls.forEach(url => {
      if (url) {
        const httpsUrl = `https://${url}`;
        if (!allowedOrigins.includes(httpsUrl)) {
          allowedOrigins.push(httpsUrl);
        }
      }
    });

    // Add wildcard for all Vercel apps (for preview builds)
    allowedOrigins.push('https://*.vercel.app');

    console.log('\n📋 Configuring CORS for bucket:', bucketName);
    console.log('🌐 Allowed origins:', allowedOrigins);

    const corsConfiguration = [
      {
        maxAgeSeconds: 3600,
        method: ['PUT', 'GET', 'HEAD', 'POST', 'OPTIONS'],
        origin: allowedOrigins,
        responseHeader: [
          'Content-Type',
          'Content-Length',
          'Accept',
          'Origin',
          'Authorization',
          'Host',
          'Access-Control-Allow-Origin',
          'Access-Control-Allow-Methods',
          'Access-Control-Allow-Headers',
          'x-goog-meta-upload-source'
        ],
      },
    ];

    await bucket.setCorsConfiguration(corsConfiguration);

    console.log('\n✅ CORS configuration applied successfully!');
    console.log('\n📝 Current CORS configuration:');
    
    // Verify the configuration
    const [metadata] = await bucket.getMetadata();
    console.log(JSON.stringify(metadata.cors, null, 2));

  } catch (error) {
    console.error('\n❌ Error configuring CORS:', error.message);
    if (error.code === 403) {
      console.error('\n💡 The service account may not have sufficient permissions.');
      console.error('Required permission: storage.buckets.update');
    }
    process.exit(1);
  }
}

configureCors();
