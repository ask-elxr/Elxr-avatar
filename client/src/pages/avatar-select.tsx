import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, MessageCircle, Lock, Crown, GraduationCap } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { AvatarProfile } from "@shared/schema";
import { getNamespaceDisplayName } from "@shared/pineconeCategories";

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
  usage: {
    avatarsUsed: number;
  } | null;
  isExpired: boolean;
}

export default function AvatarSelect() {
  const [avatars, setAvatars] = useState<AvatarProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>("");
  const [, setLocation] = useLocation();

  const { data: planInfo } = useQuery<UserPlanInfo>({
    queryKey: ['/api/subscription/user-plan'],
  });

  useEffect(() => {
    const fetchAvatars = async () => {
      try {
        const response = await fetch("/api/avatars");
        if (response.ok) {
          const data = await response.json();
          setAvatars(data);
          // Pre-select the user's selected avatar if they have one, otherwise first available
          if (planInfo?.subscription?.selectedAvatarId) {
            setSelectedAvatarId(planInfo.subscription.selectedAvatarId);
          } else if (data.length > 0) {
            setSelectedAvatarId(data[0].id);
          }
        }
      } catch (error) {
        console.error("Error fetching avatars:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAvatars();
  }, [planInfo?.subscription?.selectedAvatarId]);

  const isAvatarLocked = (avatarId: string): boolean => {
    // No subscription = all locked except during trial selection
    if (!planInfo?.subscription) {
      return false; // Allow selection if no subscription (they'll start trial)
    }
    
    // Expired subscription = all locked
    if (planInfo.isExpired) {
      return true;
    }
    
    // Pro plan (null avatarLimit) = unlimited access
    if (planInfo.plan?.avatarLimit === null) {
      return false;
    }
    
    // Free trial or Basic plan with 1 avatar limit
    if (planInfo.plan?.avatarLimit === 1) {
      // Only the selected avatar is unlocked
      return avatarId !== planInfo.subscription.selectedAvatarId;
    }
    
    return false;
  };

  const handleConfirm = () => {
    if (selectedAvatarId) {
      setLocation(`/chat?avatar=${selectedAvatarId}`);
    }
  };

  const handleStartChat = (avatarId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (isAvatarLocked(avatarId)) {
      // Redirect to dashboard to upgrade
      setLocation('/dashboard?view=plan');
      return;
    }
    
    setLocation(`/chat?avatar=${avatarId}`);
  };

  // Avatar GIF mapping
  const avatarGifs: Record<string, string> = {
    'mark-kohl': '/attached_assets/MArk-kohl-loop_1763964600000.gif',
    'willie-gault': '/attached_assets/Willie gault gif-low_1763964813725.gif',
    'june': '/attached_assets/June-low_1764106896823.gif',
    'thad': '/attached_assets/Thad_1763963906199.gif',
    'nigel': '/attached_assets/Nigel-Loop-avatar_1763964600000.gif',
    'ann': '/attached_assets/Ann_1763966361095.gif',
    'kelsey': '/attached_assets/Kelsey_1764111279103.gif',
    'judy': '/attached_assets/Screen Recording 2025-07-14 at 14.35.37-low_1764106921758.gif',
    'dexter': '/attached_assets/DexterDoctor-ezgif.com-loop-count_1764111811631.gif',
    'shawn': '/attached_assets/Screen Recording 2025-07-14 at 14.41.54-low_1764106970821.gif',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-white text-lg font-satoshi">Loading avatars...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-3 md:p-4 lg:p-6">
      <div className="max-w-6xl w-full">
        <div className="text-center mb-8 md:mb-10 lg:mb-12">
          <div className="flex items-center justify-center gap-4 mb-4">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white font-satoshi">
              Choose Your AI Guide
            </h1>
          </div>
          <p className="text-gray-400 text-sm md:text-base lg:text-lg font-satoshi">
            Select an expert to help you on your journey
          </p>
          {planInfo?.plan?.avatarLimit === 1 && planInfo?.subscription?.selectedAvatarId && (
            <p className="text-purple-400 text-sm mt-2 font-satoshi">
              Your plan includes 1 avatar. <button onClick={() => setLocation('/dashboard?view=plan')} className="underline hover:text-purple-300">Upgrade to Pro</button> for unlimited access.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 lg:gap-6 mb-6 md:mb-8">
          {avatars.map((avatar) => {
            const locked = isAvatarLocked(avatar.id);
            
            return (
              <Card
                key={avatar.id}
                onClick={() => !locked && setSelectedAvatarId(avatar.id)}
                className={`cursor-pointer transition-all duration-200 flex flex-col h-full relative ${
                  locked 
                    ? "border-gray-700 bg-gray-900/30 opacity-60"
                    : selectedAvatarId === avatar.id
                      ? "border-purple-600 border-2 bg-purple-950/20"
                      : "border-gray-700 hover:border-purple-500 bg-gray-900/50"
                }`}
                data-testid={`card-avatar-${avatar.id}`}
              >
                {locked && (
                  <div className="absolute inset-0 bg-black/40 z-10 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <Lock className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-400 text-sm font-satoshi">Upgrade to unlock</p>
                    </div>
                  </div>
                )}
                
                <CardHeader className="p-4 md:p-5 lg:p-6 flex-1 flex flex-col">
                  <div className="flex flex-col h-full">
                    {/* Avatar Image/GIF - Full Width */}
                    <div className="w-full aspect-square rounded-lg overflow-hidden bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mb-4">
                      {avatarGifs[avatar.id] ? (
                        <img 
                          src={avatarGifs[avatar.id]} 
                          alt={avatar.name}
                          className="w-full h-full object-cover"
                        />
                      ) : avatar.profileImageUrl ? (
                        <img 
                          src={avatar.profileImageUrl} 
                          alt={avatar.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white font-bold text-4xl font-satoshi">
                          {avatar.name.charAt(0)}
                        </div>
                      )}
                    </div>

                    {/* Content - Fixed structure for alignment */}
                    <div className="relative flex-1 flex flex-col">
                      <div className="pr-10 flex-1 flex flex-col">
                        {/* Name */}
                        <CardTitle className="text-white text-lg md:text-xl font-satoshi mb-2 flex items-center gap-2">
                          {avatar.name}
                          {planInfo?.subscription?.selectedAvatarId === avatar.id && (
                            <Crown className="w-4 h-4 text-yellow-400" />
                          )}
                        </CardTitle>
                        
                        {/* Description - Fixed height with line clamp */}
                        <CardDescription className="text-gray-400 text-xs md:text-sm font-satoshi mb-3 line-clamp-3 min-h-[3.5rem]">
                          {avatar.description}
                        </CardDescription>
                        
                        {/* Knowledge Categories - Fixed height area */}
                        <div className="flex flex-wrap gap-1.5 mb-4 min-h-[2.5rem]">
                          {avatar.pineconeNamespaces && avatar.pineconeNamespaces.length > 0 && avatar.pineconeNamespaces
                            .map((ns) => getNamespaceDisplayName(ns, avatar.id))
                            .filter((name): name is string => name !== null)
                            .map((displayName, index) => (
                            <span
                              key={index}
                              className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded-full border border-purple-500/30 font-satoshi h-fit"
                            >
                              {displayName}
                            </span>
                          ))}
                        </div>

                        {/* Buttons - Always at bottom */}
                        <div className="mt-auto space-y-2">
                          <Button
                            onClick={(e) => handleStartChat(avatar.id, e)}
                            className={`w-full font-semibold py-2.5 text-sm font-satoshi rounded-lg transition-all duration-200 shadow-lg ${
                              locked 
                                ? "bg-gray-700 hover:bg-gray-600 text-gray-300 shadow-none"
                                : "bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white hover:scale-[1.02] shadow-purple-500/20"
                            }`}
                            data-testid={`button-chat-${avatar.id}`}
                          >
                            {locked ? (
                              <>
                                <Lock className="w-4 h-4 mr-2" />
                                Upgrade to Unlock
                              </>
                            ) : (
                              <>
                                <MessageCircle className="w-4 h-4 mr-2" />
                                Start Chat
                              </>
                            )}
                          </Button>
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!locked) {
                                setLocation(`/dashboard/courses?avatar=${avatar.id}`);
                              }
                            }}
                            variant="outline"
                            className={`w-full font-semibold py-2.5 text-sm font-satoshi rounded-lg transition-all duration-200 ${
                              locked 
                                ? "border-gray-700 text-gray-500 cursor-not-allowed"
                                : "border-purple-500/30 text-purple-300 hover:bg-purple-500/10 hover:border-purple-500/50 hover:scale-[1.02]"
                            }`}
                            disabled={locked}
                            data-testid={`button-courses-${avatar.id}`}
                          >
                            <GraduationCap className="w-4 h-4 mr-2" />
                            Courses
                          </Button>
                        </div>
                      </div>

                      {/* Selection Check Mark */}
                      {selectedAvatarId === avatar.id && !locked && (
                        <div className="absolute top-0 right-0 w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>

      </div>
    </div>
  );
}
