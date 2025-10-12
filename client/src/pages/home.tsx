import { useState, useEffect } from "react";
import { AvatarChat } from "@/components/avatar-chat";
import { Disclaimer } from "@/components/disclaimer";

export default function Home() {
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [userId, setUserId] = useState<string>('');

  useEffect(() => {
    // Check if disclaimer was already accepted
    const accepted = localStorage.getItem('disclaimer-accepted');
    if (accepted === 'true') {
      setDisclaimerAccepted(true);
    }

    // Generate or get placeholder user ID
    let storedUserId = localStorage.getItem('temp-user-id');
    if (!storedUserId) {
      storedUserId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('temp-user-id', storedUserId);
    }
    setUserId(storedUserId);
  }, []);

  const handleAcceptDisclaimer = (rememberConversations: boolean) => {
    localStorage.setItem('disclaimer-accepted', 'true');
    setDisclaimerAccepted(true);
    console.log('Disclaimer accepted, memory enabled:', rememberConversations);
  };

  // Show disclaimer first
  if (!disclaimerAccepted) {
    return <Disclaimer onAccept={handleAcceptDisclaimer} />;
  }

  // Show avatar chat with placeholder user ID
  return <AvatarChat userId={userId} />;
}
