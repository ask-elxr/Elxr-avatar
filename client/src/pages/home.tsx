import { useState, useEffect } from "react";
import { AvatarChat } from "@/components/avatar-chat";
import { Disclaimer } from "@/components/disclaimer";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export default function Home() {
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    // ALWAYS show disclaimer on first load (reset each session)
    // Remove this line to persist acceptance across sessions
    localStorage.removeItem('disclaimer-accepted');
    localStorage.removeItem('memory-enabled');
    
    const accepted = localStorage.getItem('disclaimer-accepted');
    if (accepted === 'true') {
      setDisclaimerAccepted(true);
    }
  }, []);

  const handleAcceptDisclaimer = (rememberConversations: boolean) => {
    setDisclaimerAccepted(true);
    // Memory preference is already saved in localStorage by the Disclaimer component
  };

  // Show disclaimer first
  if (!disclaimerAccepted) {
    return <Disclaimer onAccept={handleAcceptDisclaimer} />;
  }

  // After disclaimer, check authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // If not authenticated, show login screen
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900">
        <div className="text-center space-y-6 p-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-white">Welcome to ELXR</h1>
            <p className="text-purple-200 text-lg">Sign in to start your conversation with Mark</p>
          </div>
          <Button 
            onClick={() => window.location.href = '/api/login'}
            className="bg-white text-purple-900 hover:bg-purple-100 px-8 py-6 text-lg font-semibold"
            data-testid="button-login"
          >
            Sign In to Continue
          </Button>
        </div>
      </div>
    );
  }

  // User is authenticated, show avatar chat
  return <AvatarChat userId={user?.id || ''} />;
}
