/**
 * Convert a GCS URL to a proxy URL to bypass CORS
 * @param url - The URL to convert
 * @returns The proxy URL if it's a GCS URL, otherwise the original URL
 */
function toProxyUrl(url: string): string {
  if (url.startsWith("https://storage.googleapis.com/")) {
    // Remove the protocol and domain
    const pathAfterDomain = url.substring("https://storage.googleapis.com/".length);
    // Split by '/' to get bucket name and path
    const pathSegments = pathAfterDomain.split('/');
    // Remove the first segment (bucket name) and join the rest
    const pathWithinBucket = pathSegments.slice(1).join('/');
    // Remove any query parameters and encode the path
    const cleanPath = pathWithinBucket.split('?')[0];
    return `/api/proxy/image?path=${encodeURIComponent(cleanPath)}`;
  }
  return url;
}

/**
 * Download an image with applied fine-tuning parameters
 * @param imageUrl - The URL of the image to download
 * @param fineTuning - The fine-tuning parameters to apply
 * @param filename - The filename for the downloaded image
 */
export async function downloadImageWithFineTuning(
  imageUrl: string,
  fineTuning: { brightness: number; contrast: number; saturation: number },
  filename: string = "clickatron-variation.png"
): Promise<void> {
  try {
    // Convert to proxy URL if it's a GCS URL to bypass CORS
    const proxyUrl = toProxyUrl(imageUrl);
    
    // Fetch the image
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    // Convert to blob
    const blob = await response.blob();
    
    // Create object URL
    const objectUrl = URL.createObjectURL(blob);
    
    // Create offscreen canvas
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    
    if (!ctx) {
      throw new Error("Could not get canvas context");
    }
    
    // Load image
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = objectUrl;
    });
    
    // Set canvas dimensions
    canvas.width = img.width;
    canvas.height = img.height;
    
    // Apply fine-tuning filters
    const { brightness, contrast, saturation } = fineTuning;
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    
    // Draw image with filters applied
    ctx.drawImage(img, 0, 0);
    
    // Create download link
    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up object URL
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    console.error("Error downloading image with fine-tuning:", error);
    throw error;
  }
}

/**
 * Get a signed URL for a GCS image if needed
 * @param imageRef - The image reference (could be a GCS URL or direct URL)
 * @returns A promise that resolves to the usable image URL
 */
export async function getImageUrl(imageRef: string): Promise<string> {
  // If it's already a direct URL, return it
  if (!imageRef.startsWith("https://storage.googleapis.com")) {
    return imageRef;
  }
  
  // Otherwise, get a signed URL
  try {
    const response = await fetch('/api/services/clickatron/utils/get-signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gcsUrl: imageRef }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to get signed URL');
    }
    
    const data = await response.json();
    return data.signedUrl;
  } catch (error) {
    console.error('Error getting signed URL:', error);
    throw error;
  }
}