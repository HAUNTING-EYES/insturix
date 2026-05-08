/**
 * Normalize an image URL for fetching in the browser.
 * @param url - The URL to convert
 * @returns A browser-fetchable URL
 */
function normalizeImageUrl(url: string): string {
  return url;
}

/**
 * Download an image with applied fine-tuning parameters
 * @param imageUrl - The URL of the image to download
 * @param fineTuning - The fine-tuning parameters to apply
 * @param filename - The filename for the downloaded image
 */
import { ColorCurves, CurvePoint } from "@/types/clickatron";

/**
 * Generate a 256-value lookup table from curve points using linear interpolation
 */
function generateLUT(points: CurvePoint[]): Uint8Array {
  const lut = new Uint8Array(256);
  
  // If no points or invalid, return identity mapping
  if (!points || points.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  // Sort points by x just in case
  const sortedPoints = [...points].sort((a, b) => a.x - b.x);

  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    
    // Find the segment that contains x
    let p0 = sortedPoints[0];
    let p1 = sortedPoints[sortedPoints.length - 1];
    
    if (x <= p0.x) {
      // Before first point
      p1 = p0;
    } else if (x >= p1.x) {
      // After last point
      p0 = p1;
    } else {
      // Find the segment
      for (let j = 0; j < sortedPoints.length - 1; j++) {
        if (x >= sortedPoints[j].x && x <= sortedPoints[j + 1].x) {
          p0 = sortedPoints[j];
          p1 = sortedPoints[j + 1];
          break;
        }
      }
    }

    // Interpolate y
    let y;
    if (p0 === p1) {
      y = p0.y;
    } else {
      const t = (x - p0.x) / (p1.x - p0.x);
      y = p0.y + t * (p1.y - p0.y);
    }
    
    // Clamp and scale to 0-255
    lut[i] = Math.max(0, Math.min(255, Math.round(y * 255)));
  }
  
  return lut;
}

/**
 * Download an image with applied fine-tuning parameters including curves
 * @param imageUrl - The URL of the image to download
 * @param fineTuning - The fine-tuning parameters to apply
 * @param filename - The filename for the downloaded image
 */
export async function downloadImageWithFineTuning(
  imageUrl: string,
  fineTuning: { 
    brightness: number; 
    contrast: number; 
    saturation: number;
    curves?: ColorCurves;
  },
  filename: string = "clickatron-variation.png"
): Promise<void> {
  try {
    const fetchUrl = normalizeImageUrl(imageUrl);
    
    // Fetch the image
    const response = await fetch(fetchUrl);
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
    
    // Apply basic filters (brightness, contrast, saturation) first
    const { brightness, contrast, saturation, curves } = fineTuning;
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    
    // Draw image with basic filters applied
    ctx.drawImage(img, 0, 0);
    
    // Apply Curves if present
    if (curves) {
      // Get pixel data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Generate LUTs
      const masterLUT = generateLUT(curves.master);
      const redLUT = generateLUT(curves.red);
      const greenLUT = generateLUT(curves.green);
      const blueLUT = generateLUT(curves.blue);
      
      // Apply LUTs to every pixel
      // Order: Channel curves first, then Master curve (matching SVG feComponentTransfer order)
      for (let i = 0; i < data.length; i += 4) {
        // Red
        data[i] = masterLUT[redLUT[data[i]]];
        // Green
        data[i + 1] = masterLUT[greenLUT[data[i + 1]]];
        // Blue
        data[i + 2] = masterLUT[blueLUT[data[i + 2]]];
        // Alpha (unchanged)
      }
      
      // Put processed data back
      ctx.putImageData(imageData, 0, 0);
    }
    
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
 * Get a usable image URL (signed when needed)
 * @param imageRef - The image reference (could be a GCS URL or direct URL)
 * @returns A promise that resolves to the usable image URL
 */
export async function getImageUrl(imageRef: string): Promise<string> {
  if (!imageRef) return imageRef;

  // Most Clickatron images should already be public (r2.dev) or served by a worker.
  // If a URL is private / signed, refresh via API.
  try {
    const response = await fetch('/api/services/clickatron/utils/get-signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ r2Url: imageRef }),
    });
    
    if (!response.ok) {
      return imageRef;
    }
    
    const data = await response.json();
    return data.signedUrl || imageRef;
  } catch (error) {
    console.error('Error getting signed URL:', error);
    return imageRef;
  }
}
