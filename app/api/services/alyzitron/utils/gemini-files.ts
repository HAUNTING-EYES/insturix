import { GoogleAIFileManager } from '@google/generative-ai/server';

// Initialize Gemini Files API client
let fileManager: GoogleAIFileManager | null = null;

function getFileManager(): GoogleAIFileManager {
  if (!fileManager) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY environment variable is required');
    }
    fileManager = new GoogleAIFileManager(apiKey);
  }
  return fileManager;
}

function extractGeminiFileId(fileUriOrName: string): string {
  const withoutQuery = fileUriOrName.trim().split(/[?#]/, 1)[0];
  const filesPrefixIndex = withoutQuery.lastIndexOf('files/');

  return filesPrefixIndex >= 0
    ? withoutQuery.slice(filesPrefixIndex + 'files/'.length)
    : withoutQuery;
}

/**
 * Upload a file to Gemini Files API for analysis
 * This is used when Vertex AI can't read R2 URLs directly
 */
export async function uploadFileToGemini(
  fileBuffer: ArrayBuffer,
  mimeType: string,
  displayName?: string
): Promise<string> {
  try {
    const fileManager = getFileManager();

    // Upload file to Gemini Files API
    const uploadResult = await fileManager.uploadFile(
      Buffer.from(fileBuffer),
      {
        mimeType,
        displayName: displayName || `alyzitron-upload-${Date.now()}`,
      }
    );

    console.log(`[Gemini] Uploaded file: ${uploadResult.file.name} (${fileBuffer.byteLength} bytes)`);

    // Return the file URI that can be used with Gemini models
    return uploadResult.file.uri;
  } catch (error) {
    console.error('Failed to upload file to Gemini Files API:', error);
    throw new Error(`Gemini file upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete a file from Gemini Files API
 * Call this after analysis is complete to avoid storage costs
 */
export async function deleteFromGemini(fileUri: string): Promise<void> {
  try {
    const fileManager = getFileManager();

    // GoogleAIFileManager.deleteFile expects the ID part, not the full "files/..." name.
    const fileName = extractGeminiFileId(fileUri);

    await fileManager.deleteFile(fileName);
    console.log(`[Gemini] Deleted file: ${fileName}`);
  } catch (error) {
    console.error('Failed to delete file from Gemini Files API:', error);
    // Don't throw - cleanup failure shouldn't break the flow
  }
}

/**
 * Check if Gemini Files API is available
 */
export function isGeminiAvailable(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}