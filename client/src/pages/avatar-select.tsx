import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { useLocation } from "wouter";
import type { AvatarProfile } from "@shared/schema";

export default function AvatarSelect() {
  const [avatars, setAvatars] = useState<AvatarProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>("");
  const [, setLocation] = useLocation();

  useEffect(() => {
    const fetchAvatars = async () => {
      try {
        const response = await fetch("/api/avatars");
        if (response.ok) {
          const data = await response.json();
          setAvatars(data);
          // Pre-select first avatar
          if (data.length > 0) {
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
  }, []);

  const handleConfirm = () => {
    if (selectedAvatarId) {
      setLocation(`/?avatar=${selectedAvatarId}`);
    }
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
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 lg:gap-6 mb-6 md:mb-8">
          {avatars.map((avatar) => (
            <Card
              key={avatar.id}
              onClick={() => setSelectedAvatarId(avatar.id)}
              className={`cursor-pointer transition-all duration-200 ${
                selectedAvatarId === avatar.id
                  ? "border-purple-600 border-2 bg-purple-950/20"
                  : "border-gray-700 hover:border-purple-500 bg-gray-900/50"
              }`}
              data-testid={`card-avatar-${avatar.id}`}
            >
              <CardHeader className="p-4 md:p-5 lg:p-6">
                <div className="flex flex-col gap-4">
                  {/* Avatar Image/GIF - Full Width */}
                  <div className="w-full aspect-square rounded-lg overflow-hidden bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
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

                  {/* Content */}
                  <div className="relative">
                    <div>
                      <CardTitle className="text-white text-lg md:text-xl font-satoshi mb-2">
                        {avatar.name}
                      </CardTitle>
                      <CardDescription className="text-gray-400 text-xs md:text-sm font-satoshi mb-3">
                        {avatar.description}
                      </CardDescription>
                      
                      {/* Tags */}
                      {avatar.tags && avatar.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {avatar.tags.map((tag, index) => (
                            <span
                              key={index}
                              className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded-full border border-purple-500/30 font-satoshi"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Selection Check Mark */}
                    {selectedAvatarId === avatar.id && (
                      <div className="absolute top-0 right-0 w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>

        <div className="text-center">
          <Button
            onClick={handleConfirm}
            disabled={!selectedAvatarId}
            className="bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900 text-white font-bold px-10 py-5 md:px-12 md:py-6 text-base md:text-lg font-satoshi rounded-full shadow-2xl transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-start-chat"
          >
            Start Chat
          </Button>
        </div>
      </div>
    </div>
  );
}
