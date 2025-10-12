import { useState, useEffect } from "react";
import { AvatarChat } from "@/components/avatar-chat";
import { Disclaimer } from "@/components/disclaimer";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export default function Home() {
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  
  // Check if user is authenticated
  const { user, isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    // Check if disclaimer was previously accepted in this session
    const accepted = localStorage.getItem('disclaimer-accepted');
    if (accepted === 'true') {
      setDisclaimerAccepted(true);
    }
  }, []);

  const handleAcceptDisclaimer = () => {
    setDisclaimerAccepted(true);
  };

  const handleLogin = () => {
    window.location.href = '/auth/login';
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-black to-purple-900">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Show login prompt if not authenticated
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-black to-purple-900 p-4">
        <div className="text-center space-y-6 max-w-md">
          <h1 className="text-4xl font-bold text-white">Welcome to ELXR AI Avatar</h1>
          <p className="text-gray-300 text-lg">
            Sign in to start your personalized conversation with long-term memory
          </p>
          <Button
            onClick={handleLogin}
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-6 px-8 text-lg"
            data-testid="button-login"
          >
            Sign In with Replit
          </Button>
        </div>
      </div>
    );
  }

  // Show disclaimer if not accepted
  if (!disclaimerAccepted) {
    return <Disclaimer onAccept={handleAcceptDisclaimer} />;
  }

  // Show avatar chat
  return <AvatarChat userId={user.id} />;
}
