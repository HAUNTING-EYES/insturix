// Image compression utilities
export class ImageCompressor {
  static async compressImage(
    file: File, 
    maxWidth: number = 800, 
    maxHeight: number = 600, 
    quality: number = 0.8
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        // Calculate new dimensions
        let { width, height } = img;
        
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and compress
        ctx?.drawImage(img, 0, 0, width, height);
        
        try {
          const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedDataUrl);
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  static getImageSize(dataUrl: string): number {
    // Rough estimate of base64 size in bytes
    return Math.round((dataUrl.length * 3) / 4);
  }
}