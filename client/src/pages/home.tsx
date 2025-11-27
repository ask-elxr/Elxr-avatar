import { useState, useEffect } from "react";
import { AvatarChat } from "@/components/avatar-chat";
import { Disclaimer } from "@/components/disclaimer";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

interface UserPlanInfo {
  plan: {
    id: string;
    slug: string;
    name: string;
    avatarLimit: number | null;
  } | null;
  subscription: {
    id: string;
    status: string;
    selectedAvatarId: string | null;
  } | null;
  isExpired: boolean;
}

export default function Home() {
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [userId, setUserId] = useState<string>('');
  const [avatarId, setAvatarId] = useState<string>('');
  const [, setLocation] = useLocation();

  const { data: planInfo, isLoading: planLoading } = useQuery<UserPlanInfo>({
    queryKey: ['/api/subscription/user-plan'],
  });

  const isAvatarAllowed = (avatarId: string): boolean => {
    // No subscription yet = redirect to avatar-select to start trial
    if (!planInfo?.subscription) {
      return false;
    }
    
    // Expired subscription = not allowed
    if (planInfo.isExpired) {
      return false;
    }
    
    // Pro plan (null avatarLimit) = unlimited access
    if (planInfo.plan?.avatarLimit === null) {
      return true;
    }
    
    // Free trial or Basic plan with 1 avatar limit
    if (planInfo.plan?.avatarLimit === 1) {
      // Only the selected avatar is allowed
      return avatarId === planInfo.subscription.selectedAvatarId;
    }
    
    return true;
  };

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

  // Check if user can access the selected avatar
  useEffect(() => {
    if (!planLoading && avatarId && planInfo) {
      if (!isAvatarAllowed(avatarId)) {
        // Redirect to avatar-select if avatar is not allowed
        setLocation('/avatar-select');
      }
    }
  }, [planLoading, avatarId, planInfo, setLocation]);

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
