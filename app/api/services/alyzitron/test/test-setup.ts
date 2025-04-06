import { MongoClient } from 'mongodb';
import { testGCSConfig } from './gcs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testMongoConnection() {
  console.log('\n🔍 Testing MongoDB Connection...');
  console.log('----------------------------------------');

  try {
    const client = await MongoClient.connect(process.env.MONGODB_URI || '');
    const db = client.db(process.env.MONGODB_DB_NAME);
    
    // Test write permission by creating a test document
    const testCollection = db.collection('test_connection');
    await testCollection.insertOne({ test: true, timestamp: new Date() });
    await testCollection.deleteOne({ test: true });
    
    console.log('✅ MongoDB connection successful');
    console.log('✅ Database write permission confirmed');
    await client.close();
    return true;
  } catch (error) {
    console.error('\n❌ MongoDB Connection Test Failed:');
    console.error('----------------------------------------');
    if (error instanceof Error) {
      console.error('Error:', error.message);
      
      if (error.message.includes('ECONNREFUSED')) {
        console.error('\nPossible issues:');
        console.error('1. MongoDB URI is incorrect');
        console.error('2. MongoDB server is not running');
      } else if (error.message.includes('Authentication failed')) {
        console.error('\nPossible issues:');
        console.error('1. Username/password in connection string is incorrect');
        console.error('2. Database user lacks required permissions');
      }
    }
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting Alyzitron Setup Tests');
  console.log('=====================================');

  // Test MongoDB
  const mongoSuccess = await testMongoConnection();

  // Test GCS
  const gcsSuccess = await testGCSConfig();

  console.log('\n📋 Test Summary');
  console.log('=====================================');
  console.log('MongoDB:', mongoSuccess ? '✅ Passed' : '❌ Failed');
  console.log('GCS:', gcsSuccess ? '✅ Passed' : '❌ Failed');

  if (mongoSuccess && gcsSuccess) {
    console.log('\n✨ All services are configured correctly!');
    console.log('You can now start using Alyzitron.');
  } else {
    console.log('\n⚠️ Some tests failed. Please fix the issues above.');
  }
}

// Run the tests when executed directly
if (require.main === module) {
  runAllTests();
}

export { testMongoConnection, runAllTests };