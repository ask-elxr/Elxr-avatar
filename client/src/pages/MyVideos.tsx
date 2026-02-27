import { useEffect } from "react";
import { useLocation, useSearch } from "wouter";

export default function MyVideos() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get('view') !== 'videos') {
      setLocation('/dashboard?view=videos');
    }
  }, [setLocation, searchString]);

  return null;
}
