import axios from "axios";

const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

export interface StockImage {
  id: number;
  url: string;
  photographer: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    landscape: string;
  };
  alt: string;
}

/**
 * Search Pexels for stock images matching a query.
 * Returns landscape-oriented images suitable for video backgrounds.
 */
export async function searchStockImages(
  query: string,
  perPage: number = 6
): Promise<StockImage[]> {
  if (!PEXELS_API_KEY) {
    console.warn("PEXELS_API_KEY not configured - stock image search unavailable");
    return [];
  }

  try {
    const response = await axios.get("https://api.pexels.com/v1/search", {
      headers: { Authorization: PEXELS_API_KEY },
      params: {
        query,
        per_page: perPage,
        orientation: "landscape",
        size: "large",
      },
    });

    return (response.data.photos || []).map((photo: any) => ({
      id: photo.id,
      url: photo.url,
      photographer: photo.photographer,
      src: photo.src,
      alt: photo.alt || query,
    }));
  } catch (error: any) {
    console.error("Pexels search error:", error.message);
    return [];
  }
}

/**
 * Upload an image URL to HeyGen as an asset for use as a video background.
 * Returns the HeyGen asset URL (HeyGen accepts direct URLs for backgrounds).
 */
export function getBackgroundImageUrl(image: StockImage): string {
  // HeyGen v2 accepts direct image URLs for backgrounds
  // Use the landscape crop which is 1280px wide - perfect for 1280x720 video
  return image.src.landscape;
}
