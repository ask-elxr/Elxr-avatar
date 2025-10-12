import { useState, useEffect } from "react";
import { AvatarChat } from "@/components/avatar-chat";
import { Disclaimer } from "@/components/disclaimer";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export default function Home() {
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    // Check if disclaimer was already accepted
    const accepted = localStorage.getItem('disclaimer-accepted');
    if (accepted === 'true') {
      setDisclaimerAccepted(true);
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

  // After disclaimer, check authentication
  if (isLoading) {
    console.log('[Home] Auth loading...');
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // If not authenticated, show login screen
  console.log('[Home] Auth state:', { isAuthenticated, user });
  if (!isAuthenticated) {
    console.log('[Home] Showing sign-in screen');
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
