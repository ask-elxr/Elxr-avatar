import { useState, useEffect } from "react";
import { AvatarChat } from "@/components/avatar-chat";
import { Disclaimer } from "@/components/disclaimer";

export default function Home() {
  const [userId, setUserId] = useState<string>('');

  useEffect(() => {
    // Generate or get placeholder user ID
    let storedUserId = localStorage.getItem('temp-user-id');
    if (!storedUserId) {
      storedUserId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('temp-user-id', storedUserId);
    }
    setUserId(storedUserId);
  }, []);

  // Show avatar chat directly with placeholder user ID
  return <AvatarChat userId={userId} />;
}
