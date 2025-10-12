import { useState, useEffect } from "react";
import { AvatarChat } from "@/components/avatar-chat";
import { Disclaimer } from "@/components/disclaimer";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import elxrLogo from "@assets/Asset 2_1760249308314.png";

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
        <div className="text-center space-y-8 p-8 max-w-md">
          <div className="flex items-center justify-center mb-4">
            <img 
              src={elxrLogo} 
              alt="ELXR" 
              className="h-10 w-auto"
              data-testid="img-elxr-logo-signin"
            />
          </div>
          <div className="space-y-4">
            <h1 className="text-3xl font-bold text-white">Welcome</h1>
            <p className="text-purple-200 text-lg">Sign in to start your conversation with Mark</p>
          </div>
          <Button 
            onClick={() => window.location.href = '/api/login'}
            className="bg-white text-purple-900 hover:bg-purple-100 px-8 py-6 text-lg font-semibold w-full"
            data-testid="button-login"
          >
            Sign In to Continue
          </Button>
          <p className="text-sm text-purple-300">
            Sign in with email, Google, GitHub, or other providers
          </p>
        </div>
      </div>
    );
  }

  // User is authenticated, show avatar chat
  return <AvatarChat userId={user?.id || ''} />;
}
