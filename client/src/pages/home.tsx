import { useState, useEffect } from "react";
import { AvatarChat } from "@/components/avatar-chat";
import { Disclaimer } from "@/components/disclaimer";
import { useAnonymousUser } from "@/hooks/useAnonymousUser";

export default function Home() {
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const { userId, isLoading } = useAnonymousUser();

  useEffect(() => {
    // Check if disclaimer was previously accepted in this session
    const accepted = localStorage.getItem('disclaimer-accepted');
    if (accepted === 'true') {
      setDisclaimerAccepted(true);
    }
  }, []);

  const handleAcceptDisclaimer = (rememberConversations: boolean) => {
    setDisclaimerAccepted(true);
    // Memory preference is already saved in localStorage by the Disclaimer component
    console.log('User chose:', rememberConversations ? 'Memory enabled' : 'Anonymous mode');
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-black to-purple-900">
        <div className="text-white text-xl">Initializing...</div>
      </div>
    );
  }

  // Show disclaimer if not accepted
  if (!disclaimerAccepted) {
    return <Disclaimer onAccept={handleAcceptDisclaimer} />;
  }

  // Show avatar chat with user ID
  return <AvatarChat userId={userId!} />;
}
