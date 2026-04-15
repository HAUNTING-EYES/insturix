// Simple test script to verify Google Cloud Storage setup
import { Storage } from '@google-cloud/storage';

async function testGCS() {
    try {
        console.log('Testing Google Cloud Storage connection...');

        // Try with Application Default Credentials first
        const storage = new Storage({
            projectId: process.env.GOOGLE_CLOUD_PROJECT || 'insturix-493414'
        });

        // List buckets to test connection
        const [buckets] = await storage.getBuckets();
        console.log('✅ Successfully connected to Google Cloud Storage!');
        console.log('Available buckets:');
        buckets.forEach(bucket => {
            console.log(`  - ${bucket.name}`);
        });

        // Test creating a bucket (optional)
        const bucketName = 'insturix-socialize-banners-test';
        try {
            const bucket = storage.bucket(bucketName);
            const [exists] = await bucket.exists();

            if (!exists) {
                console.log(`Creating test bucket: ${bucketName}`);
                await bucket.create();
                console.log('✅ Test bucket created successfully!');
            } else {
                console.log(`✅ Test bucket already exists: ${bucketName}`);
            }

            // Make bucket public
            await bucket.iam.setPolicy({
                bindings: [{
                    role: 'roles/storage.objectViewer',
                    members: ['allUsers']
                }]
            });
            console.log('✅ Bucket made public for banner images');

        } catch (bucketError) {
            console.log('⚠️  Could not create test bucket:', bucketError.message);
        }

    } catch (error) {
        console.error('❌ Failed to connect to Google Cloud Storage:');
        console.error('Error:', error.message);
        console.log('\n💡 Solutions:');
        console.log('1. Run: gcloud auth application-default login');
        console.log('2. Or set GOOGLE_APPLICATION_CREDENTIALS environment variable');
        console.log('3. Or add GOOGLE_CLOUD_CREDENTIALS to your .env.local file');
    }
}

testGCS();
