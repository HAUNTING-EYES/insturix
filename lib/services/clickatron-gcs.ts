import { Storage } from "@google-cloud/storage";
import fetch from "node-fetch";

const GCS_BUCKET = process.env.GCS_BUCKET || "your-bucket";
const storage = new Storage();

export class ClickatronGCSManager {
  static async uploadBuffer(buffer: Buffer, fileName: string, contentType: string): Promise<string> {
    const bucket = storage.bucket(GCS_BUCKET);
    const file = bucket.file(fileName);
    await file.save(buffer, { contentType });
    // Always make public
    await file.acl.add({ entity: 'allUsers', role: storage.acl.READER_ROLE });
    return `https://storage.googleapis.com/${GCS_BUCKET}/${fileName}`;
  }

  static async uploadFromUrl(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch image from URL");
    const buffer = await res.buffer();
    const fileName = `results/result-${Date.now()}.jpg`;
    return await this.uploadBuffer(buffer, fileName, "image/jpeg");
  }

  static async getSignedUrl(gcsUrl: string): Promise<string> {
    // Parse file name from GCS URL
    const match = gcsUrl.match(/storage.googleapis.com\/(.+?)\/(.+)/);
    if (!match) throw new Error("Invalid GCS URL");
    const bucketName = match[1];
    const fileName = match[2];
    const file = storage.bucket(bucketName).file(fileName);
    const [signedUrl] = await file.getSignedUrl({ action: "read", expires: Date.now() + 60 * 60 * 1000 });
    return signedUrl;
  }
}
