// Static pool of mock thumbnail images for Clickatron
// These represent different thumbnail styles and compositions

export const MOCK_THUMBNAIL_IMAGES = [
  // Gaming/Tech thumbnails
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1920&h=1080&fit=crop&crop=center',
  'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1920&h=1080&fit=crop&crop=center',
  
  // Creative/Design thumbnails  
  'https://images.unsplash.com/photo-1558655146-d09347e92766?w=1920&h=1080&fit=crop&crop=center',
  'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1920&h=1080&fit=crop&crop=center',
  
  // Business/Professional thumbnails
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1920&h=1080&fit=crop&crop=center',
  'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1920&h=1080&fit=crop&crop=center',
  
  // Lifestyle/Vlog thumbnails
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1920&h=1080&fit=crop&crop=center',
  'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1920&h=1080&fit=crop&crop=center',
  
  // Educational/Tutorial thumbnails
  'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=1920&h=1080&fit=crop&crop=center',
  'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1920&h=1080&fit=crop&crop=center',
];

/**
 * Get a consistent mock image for a given variation ID
 * This ensures the same variation always shows the same image
 */
export function getMockImageForVariation(variationId: string): string {
  // Use a simple hash of the variation ID to pick a consistent image
  let hash = 0;
  for (let i = 0; i < variationId.length; i++) {
    const char = variationId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  const index = Math.abs(hash) % MOCK_THUMBNAIL_IMAGES.length;
  return MOCK_THUMBNAIL_IMAGES[index];
}

/**
 * Get a random mock image (for new variations)
 */
export function getRandomMockImage(): string {
  const index = Math.floor(Math.random() * MOCK_THUMBNAIL_IMAGES.length);
  return MOCK_THUMBNAIL_IMAGES[index];
}