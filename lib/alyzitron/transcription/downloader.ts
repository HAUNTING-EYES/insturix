import { create } from "yt-dlp-exec";
import fs from "fs";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import { GCSManager } from "../../../app/api/services/alyzitron/utils/gcs";

const youtubedl = create("/usr/local/bin/yt-dlp");

export interface IngestionResult {
    signedUrl: string;
    gcsUri: string;
    type: 'audio' | 'video' | 'image';
}

export async function ingestMediaToGCS(url: string): Promise<IngestionResult> {
    const tempId = uuidv4();
    const tmpDir = os.tmpdir();
    const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");

    const ytdlOptions: any = {
        noPlaylist: true,
        forceIpv4: true,
    };

    if (isYouTube) {
        // 🔥 Reverted to your ORIGINAL working config for YouTube
        ytdlOptions.output = path.join(tmpDir, `${tempId}.mp3`);
        ytdlOptions.extractAudio = true;
        ytdlOptions.audioFormat = 'mp3';
        ytdlOptions.jsRuntimes = 'node';
        ytdlOptions.extractorArgs = 'youtube:player_client=android';
    } else {
        // Smart Media Mode for Insta/X
        ytdlOptions.output = path.join(tmpDir, `${tempId}.%(ext)s`);
    }

    console.log(`[Downloader] Fetching media from ${url}...`);
    await youtubedl(url, ytdlOptions);

    const files = fs.readdirSync(tmpDir);
    const downloadedFile = files.find(f => f.startsWith(tempId));

    if (!downloadedFile) throw new Error("Failed to download media.");

    const tempFilePath = path.join(tmpDir, downloadedFile);
    const ext = path.extname(downloadedFile).toLowerCase();

    const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const isImage = imageExts.includes(ext);
    const mediaType: 'audio' | 'video' | 'image' = isYouTube ? 'audio' : (isImage ? 'image' : 'video');

    let contentType = 'application/octet-stream';
    if (mediaType === 'audio') contentType = 'audio/mpeg';
    else if (mediaType === 'image') contentType = `image/${ext.replace('.', '') === 'jpg' ? 'jpeg' : ext.replace('.', '')}`;
    else contentType = 'video/mp4';

    const destinationPath = `alyzitron/${mediaType}/${downloadedFile}`;
    const bucket = GCSManager.getBucket();

    console.log(`[Downloader] Uploading to GCS: ${destinationPath}`);
    await bucket.upload(tempFilePath, { destination: destinationPath, contentType });

    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

    return {
        signedUrl: await GCSManager.getSignedReadUrl(destinationPath),
        gcsUri: `gs://${process.env.GCS_BUCKET_NAME}/${destinationPath}`,
        type: mediaType
    };
}