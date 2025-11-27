import { useEffect } from "react";
import { useLocation } from "wouter";

export default function MyVideos() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation('/dashboard');
  }, [setLocation]);

  return null;
}
