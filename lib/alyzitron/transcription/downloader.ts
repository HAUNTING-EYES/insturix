import { create } from "yt-dlp-exec";
import fs from "fs";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import { GCSManager } from "../../../app/api/services/alyzitron/utils/gcs";

const youtubedl = create("/usr/local/bin/yt-dlp");
// ... (imports remain the same) ...
export async function ingestMediaToGCS(url: string): Promise<string> {
    const tempId = uuidv4();
    const tempFilePath = path.join(os.tmpdir(), `${tempId}.mp3`);

    try {
        await youtubedl(url, {
            extractAudio: true,
            audioFormat: 'mp3',
            output: tempFilePath,
            noPlaylist: true,
            jsRuntimes: 'node',
            extractorArgs: 'youtube:player_client=android',
            forceIpv4: true,
        });

        const bucket = GCSManager.getBucket();
        const destinationPath = `alyzitron/audio/${tempId}.mp3`;

        await bucket.upload(tempFilePath, {
            destination: destinationPath,
            contentType: 'audio/mpeg',
        });

        // We only need the Signed URL for Deepgram
        return await GCSManager.getSignedReadUrl(destinationPath);
    } finally {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    }
}