import { Storage } from '@google-cloud/storage';

// Test GCS configuration
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

    console.log('\n🔍 Testing GCS Configuration...');
    console.log('----------------------------------------');

    // Test 1: Verify credentials
    console.log('1. Verifying credentials...');
    const [bucketExists] = await bucket.exists();
    if (!bucketExists) {
      throw new Error(`Bucket ${process.env.GCS_BUCKET_NAME} not found`);
    }
    console.log('✅ Credentials are valid');
    console.log('✅ Bucket exists and is accessible');

    // Test 2: List files (tests permissions)
    console.log('\n2. Testing list permissions...');
    const [files] = await bucket.getFiles({ maxResults: 1 });
    console.log('✅ Can list files in bucket');

    // Test 3: Test file upload
    console.log('\n3. Testing file upload...');
    const testFileName = `test-${Date.now()}.txt`;
    const testFile = bucket.file(testFileName);
    await testFile.save('test content', { contentType: 'text/plain' });
    console.log('✅ Can upload files');

    // Test 4: Test file deletion (cleanup)
    console.log('\n4. Testing file deletion...');
    await testFile.delete();
    console.log('✅ Can delete files');

    console.log('\n✨ All GCS tests passed successfully!');
    return true;

  } catch (error) {
    console.error('\n❌ GCS Configuration Test Failed:');
    console.error('----------------------------------------');
    if (error instanceof Error) {
      console.error('Error:', error.message);
      
      // Help diagnose common issues
      if (error.message.includes('permission')) {
        console.error('\nPossible issues:');
        console.error('1. Service account lacks required permissions');
        console.error('2. Private key is malformed in .env');
      } else if (error.message.includes('bucket')) {
        console.error('\nPossible issues:');
        console.error('1. Bucket name is incorrect');
        console.error('2. Bucket is in a different project');
      } else if (error.message.includes('credentials')) {
        console.error('\nPossible issues:');
        console.error('1. Project ID is incorrect');
        console.error('2. Client email is incorrect');
        console.error('3. Private key is not properly formatted');
      }
    }
    return false;
  }
}

// Run the test when executed directly
if (require.main === module) {
  testGCSConfig();
}

export { testGCSConfig };