import { useState, useEffect } from "react";
import { AvatarChat } from "@/components/avatar-chat";
import { Disclaimer } from "@/components/disclaimer";

export default function Home() {
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [avatarId, setAvatarId] = useState<string>('mark-kohl');

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
    }
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

  // Show avatar chat with placeholder user ID and selected avatar
  return <AvatarChat userId={userId} avatarId={avatarId} />;
}
