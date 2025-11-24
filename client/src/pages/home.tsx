import { useState, useEffect } from "react";
import { AvatarChat } from "@/components/avatar-chat";
import { Disclaimer } from "@/components/disclaimer";
import { useLocation } from "wouter";

export default function Home() {
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [avatarId, setAvatarId] = useState<string>('');
  const [, setLocation] = useLocation();

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

    // Read avatar parameter from URL
    const urlParams = new URLSearchParams(window.location.search);
    const avatarParam = urlParams.get('avatar');
    if (avatarParam) {
      setAvatarId(avatarParam);
    } else {
      // No avatar selected - redirect to avatar selection
      setLocation('/avatar-select');
    }
  }, [setLocation]);

  const handleAcceptDisclaimer = (rememberConversations: boolean) => {
    localStorage.setItem('disclaimer-accepted', 'true');
    setDisclaimerAccepted(true);
    console.log('Disclaimer accepted, memory enabled:', rememberConversations);
  };

  // Show disclaimer first
  if (!disclaimerAccepted) {
    return <Disclaimer onAccept={handleAcceptDisclaimer} />;
  }

  // If no avatar selected yet, show loading (will redirect)
  if (!avatarId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-white text-lg font-satoshi">Loading...</div>
      </div>
    );
  }

  // Show avatar chat with placeholder user ID and selected avatar
  return <AvatarChat userId={userId} avatarId={avatarId} />;
}
