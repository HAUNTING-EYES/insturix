import { Storage } from '@google-cloud/storage';

export async function getGcsSignedUrl(videoUrl: string) : Promise<string>{
    // Check if we have complete GCS configuration
    const gcsCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS
      ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
      : null;
    
    // Initialize storage with credentials if available
    let storage: Storage | null;

    storage = new Storage({
      projectId: gcsCredentials.project_id,
      credentials: gcsCredentials,
    });

    const bucket = storage.bucket(process.env.GCS_BUCKET_NAME!);

    if (!videoUrl.startsWith("gs://")) {
      throw new Error("Invalid GCS URL");
    }
  
    // Remove gs://
    const withoutProtocol = videoUrl.replace("gs://", "");
  
    // Split bucket and file path
    const [bucketName, ...pathParts] = withoutProtocol.split("/");
    const filePath = pathParts.join("/");
  
    if (!bucketName || !filePath) {
      throw new Error("Invalid GCS URL format");
    }

    // console.log("[info] signedUrl filePath: ", filePath);

    const file = storage.bucket(bucketName).file(filePath);

    const [signedUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    // console.log("[info] signedUrl: ", signedUrl);
    return signedUrl;
}