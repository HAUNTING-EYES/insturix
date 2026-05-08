require('dotenv').config();
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

async function run() {
  console.log('Testing editron-cdn bucket PUT...');
  try {
    const res = await client.send(
      new PutObjectCommand({
        Bucket: 'editron-cdn',
        Key: 'test.txt',
        Body: 'hello',
      })
    );
    console.log(' editron-cdn PUT Success!');
  } catch (err) {
    console.error(' editron-cdn PUT Error:', err.message);
  }
}
run();
