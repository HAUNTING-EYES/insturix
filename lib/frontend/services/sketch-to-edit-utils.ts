/**
 * Utilities for Sketch to Edit image handling
 */

import { SketchAnnotations, SketchStroke, TextAnnotation } from "@/types/clickatron";

/**
 * Convert an image URL to base64 data URL
 * Handles image sources with proper CORS support
 * 
 * @param imageUrl - The URL of the image to convert
 * @param timeout - Timeout in milliseconds (default: 10000)
 * @returns Base64 data URL (e.g., data:image/png;base64,...)
 */
export async function imageUrlToBase64(
  imageUrl: string,
  timeout: number = 10000
): Promise<string> {
  try {
    // Step 1: Fetch the image
    console.log("[imageUrlToBase64] Fetching image from:", imageUrl);
    
    const response = await Promise.race([
      fetch(imageUrl, { method: 'GET' }),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error('Fetch timeout')), timeout)
      ),
    ]);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Step 2: Convert blob to base64
    const blob = await response.blob();
    return await blobToBase64(blob);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[imageUrlToBase64] Error:", errorMessage);
    throw new Error(`Failed to convert image to base64: ${errorMessage}`);
  }
}

/**
 * Convert a Blob to base64 data URL
 * 
 * @param blob - The blob to convert
 * @returns Base64 data URL
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onloadend = () => {
      const result = reader.result as string;
      if (!result || !result.startsWith('data:')) {
        reject(new Error('Failed to generate data URL from blob'));
      } else {
        resolve(result);
      }
    };
    
    reader.onerror = () => {
      reject(new Error('FileReader error'));
    };
    
    reader.readAsDataURL(blob);
  });
}

/**
 * Validate that a string is a valid data URL
 * 
 * @param data - The string to validate
 * @param name - Name for error messages
 * @returns Object with validation result and error message
 */
export function validateDataUrl(
  data: string,
  name: string = 'Image'
): { valid: boolean; error?: string } {
  if (!data) {
    return { valid: false, error: `${name} is empty` };
  }

  if (!data.startsWith('data:image')) {
    return {
      valid: false,
      error: `${name} is not a valid image data URL. Starts with: ${data.substring(0, 50)}`,
    };
  }

  if (data.length < 100) {
    return {
      valid: false,
      error: `${name} is too small (${data.length} bytes). Image data may be corrupted`,
    };
  }

  return { valid: true };
}

/**
 * Flatten annotations onto a base image to create a combined canvas
 * This is used for sketch-to-edit to create the annotated reference image
 * 
 * @param baseImageUrl - URL of the base image
 * @param annotations - Sketch annotations to overlay
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Base64 data URL of the flattened image
 */
export async function flattenCanvasWithAnnotations(
  baseImageUrl: string,
  annotations: SketchAnnotations,
  width: number,
  height: number
): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Load and draw base image
      const baseImage = new Image();
      baseImage.crossOrigin = 'anonymous';
      
      baseImage.onload = () => {
        // Draw base image
        ctx.drawImage(baseImage, 0, 0, width, height);
        
        // Draw strokes
        annotations.strokes.forEach((stroke: SketchStroke) => {
          if (stroke.points.length < 2) return;
          
          ctx.beginPath();
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = stroke.lineWidth;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          
          if (stroke.tool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
          } else {
            ctx.globalCompositeOperation = 'source-over';
          }
          
          ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
          for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
          }
          ctx.stroke();
        });
        
        // Reset composite operation
        ctx.globalCompositeOperation = 'source-over';
        
        // Draw text elements
        annotations.textElements.forEach((textEl: TextAnnotation) => {
          ctx.fillStyle = textEl.color;
          ctx.font = '24px sans-serif';
          ctx.fillText(textEl.text, textEl.x, textEl.y);
        });
        
        // Convert to data URL
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      };
      
      baseImage.onerror = () => {
        reject(new Error('Failed to load base image'));
      };
      
      // Load base image
      baseImage.src = baseImageUrl;
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Check if annotations have any content
 * 
 * @param annotations - Sketch annotations to check
 * @returns True if there are any annotations
 */
export function hasAnnotationContent(annotations: SketchAnnotations | undefined): boolean {
  if (!annotations) return false;
  return (
    (annotations.strokes?.length ?? 0) > 0 ||
    (annotations.textElements?.length ?? 0) > 0 ||
    (annotations.imageOverlays?.length ?? 0) > 0
  );
}
