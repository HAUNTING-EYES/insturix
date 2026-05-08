import { S3Client, PutObjectCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3';

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

async function run() {
  try {
    const res = await client.send(
      new PutObjectCommand({
        Bucket: 'alzitron',
        Key: 'test-file.txt',
        Body: 'Hello World',
      })
    );
    console.log('PutObject Success:', res);
  } catch (err: any) {
    console.error('PutObject Error:', err.message);
  }
}
run();
