import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini client
let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY environment variable is required');
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
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
    const genai = getGenAI();

    // Upload file to Gemini Files API
    const fileManager = genai.getFileManager();
    const uploadResult = await fileManager.uploadFile(
      new Uint8Array(fileBuffer),
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
    const genai = getGenAI();
    const fileManager = genai.getFileManager();

    // Extract file name from URI (format: files/abc123)
    const fileName = fileUri.replace('files/', '');

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