import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import { logger } from "@/app/api/services/alyzitron/utils/logger";

let _geminiFileManager: GoogleAIFileManager | null = null;

export function getGeminiFileManager(): GoogleAIFileManager {
  if (_geminiFileManager) return _geminiFileManager;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  _geminiFileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
  return _geminiFileManager;
}

export const geminiFileManager = new Proxy({} as GoogleAIFileManager, {
  get(_target, prop) {
    return (getGeminiFileManager() as any)[prop];
  },
});

/**
 * Downloads a file from a URL to a temporary local file, uploads it to Gemini File API,
 * and deletes the temporary local file.
 * Returns the uploaded file's URI and name.
 */
export async function uploadUrlToGeminiFileAPI(url: string, mimeType: string, filenamePrefix: string): Promise<{ fileUri: string, name: string }> {
  const tempFilePath = path.join(os.tmpdir(), `${filenamePrefix}-${Date.now()}.tmp`);
  
  try {
    // 1. Download file to /tmp
    logger.info(`Downloading external media to temp file: ${tempFilePath}`);
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(tempFilePath);
    await new Promise((resolve, reject) => {
        response.data.pipe(writer);
        let error: Error | null = null;
        writer.on('error', err => {
            error = err;
            writer.close();
            reject(err);
        });
        writer.on('close', () => {
            if (!error) resolve(true);
        });
    });
    logger.info(`Download complete. File saved to: ${tempFilePath}`);

    // 2. Upload to Gemini
    logger.info(`Uploading file to Gemini File API`);
    const uploadResult = await geminiFileManager.uploadFile(tempFilePath, {
      mimeType,
      displayName: `${filenamePrefix} upload`,
    });
    
    const file = uploadResult.file;
    logger.info(`Uploaded to Gemini as ${file.name} (URI: ${file.uri})`);

    // 3. Wait for it to become ACTIVE
    let currentState = file.state;
    while (currentState === FileState.PROCESSING) {
      logger.info('Waiting for Gemini file processing...');
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const getFileResponse = await geminiFileManager.getFile(file.name);
      currentState = getFileResponse.state;
      if (currentState === FileState.FAILED) {
        throw new Error(`Gemini File processing failed.`);
      }
    }

    return { fileUri: file.uri, name: file.name };
  } finally {
    // 4. Cleanup local file
    if (fs.existsSync(tempFilePath)) {
      try {
        await fs.promises.unlink(tempFilePath);
        logger.info(`CLEANUP SUCCESS: Deleted temporary file ${tempFilePath}`);
      } catch (err: any) {
        logger.error(`Failed to delete temporary file ${tempFilePath}: ${err.message}`);
      }
    }
  }
}
