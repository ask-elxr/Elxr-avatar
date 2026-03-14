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
    console.warn("PEXELS_API_KEY not configured — B-roll image search unavailable. Get a free key at https://www.pexels.com/api/");
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
