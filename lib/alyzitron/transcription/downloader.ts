import { create } from "yt-dlp-exec";

// This forces the library to use your native OS binary
const youtubedl = create("yt-dlp");
import { Storage } from "@google-cloud/storage";
import fs from "fs";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";

// Initialize GCS Client
// Ensure you have GOOGLE_APPLICATION_CREDENTIALS set in your .env
const storage = new Storage();
const BUCKET_NAME = process.env.GCS_BUCKET_NAME || "insturix-downloads";

/**
 * Downloads a video using yt-dlp, saves it to a temp local file, 
 * uploads it to GCS, and returns a signed URL for analysis.
 */
export async function ingestMediaToGCS(url: string): Promise<string> {
    const tempId = uuidv4();
    // Download as highest quality audio to save space/time, outputting as mp3
    const tempFilePath = path.join(os.tmpdir(), `${tempId}.mp3`);

    console.log(`🔽 Starting download via yt-dlp for: ${url}`);

    try {
        // 1. Download via yt-dlp to temp folder
        // 1. Download via yt-dlp to temp folder
        await youtubedl(url, {
            extractAudio: true,
            audioFormat: 'mp3',
            output: tempFilePath,
            noPlaylist: true,

            // --- THE BYPASS FLAGS ---
            jsRuntimes: 'node', // Explicitly use Node.js to solve YouTube's obfuscation scripts
            extractorArgs: 'youtube:player_client=android', // Bypass the strict web login checks by impersonating an Android device
            forceIpv4: true, // Forces IPv4, which often bypasses aggressive IPv6 datacenter bans
        });

        console.log(`✅ Download complete. Uploading to GCS...`);

        // 2. Upload to Google Cloud Storage
        const bucket = storage.bucket(BUCKET_NAME);
        const destinationPath = `alyzitron/audio/${tempId}.mp3`;

        await bucket.upload(tempFilePath, {
            destination: destinationPath,
            contentType: 'audio/mpeg',
        });

        console.log(`☁️ Uploaded to GCS: gs://${BUCKET_NAME}/${destinationPath}`);

        // 3. Generate a Signed URL (Valid for 2 hours) so Deepgram can access it
        const file = bucket.file(destinationPath);
        const [signedUrl] = await file.getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + 2 * 60 * 60 * 1000, // 2 hours
        });

        return signedUrl;

    } catch (error) {
        console.error("❌ Media Ingestion Failed:", error);
        throw new Error("Failed to process and upload media.");
    } finally {
        // 4. ALWAYS clean up the temp file to prevent server disk space issues!
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
            console.log(`🧹 Cleaned up temp file: ${tempFilePath}`);
        }
    }
}