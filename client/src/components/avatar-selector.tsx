import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import type { AvatarProfile } from "@shared/schema";

interface AvatarSelectorProps {
  selectedAvatarId: string;
  onSelect: (avatarId: string) => void;
  onConfirm: () => void;
}

export function AvatarSelector({ selectedAvatarId, onSelect, onConfirm }: AvatarSelectorProps) {
  const [avatars, setAvatars] = useState<AvatarProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAvatars = async () => {
      try {
        const response = await fetch("/api/avatars");
        if (response.ok) {
          const data = await response.json();
          setAvatars(data);
        }
      } catch (error) {
        console.error("Error fetching avatars:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAvatars();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-white text-lg">Loading avatars...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-3 md:p-4 lg:p-6">
      <div className="max-w-5xl w-full">
        <div className="text-center mb-8 md:mb-10 lg:mb-12">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-3 md:mb-4">Choose Your AI Guide</h1>
          <p className="text-gray-400 text-sm md:text-base lg:text-lg">Select an expert to help you on your journey</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 lg:gap-6 mb-6 md:mb-8">
          {avatars.map((avatar) => (
            <Card
              key={avatar.id}
              onClick={() => onSelect(avatar.id)}
              className={`cursor-pointer transition-all duration-200 ${
                selectedAvatarId === avatar.id
                  ? "border-purple-600 border-2 bg-purple-950/20"
                  : "border-gray-700 hover:border-purple-500 bg-gray-900/50"
              }`}
              data-testid={`card-avatar-${avatar.id}`}
            >
              <CardHeader className="p-4 md:p-5 lg:p-6">
                <div className="flex items-start gap-3 md:gap-4">
                  {/* Avatar Thumbnail */}
                  <div className="flex-shrink-0 w-14 h-14 md:w-16 md:h-16 rounded-full overflow-hidden bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                    {avatar.profileImageUrl ? (
                      <img 
                        src={avatar.profileImageUrl} 
                        alt={avatar.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white font-semibold text-xl md:text-2xl">
                        {avatar.name.charAt(0)}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-white text-base md:text-lg lg:text-xl mb-1.5 md:mb-2">{avatar.name}</CardTitle>
                    <CardDescription className="text-gray-400 text-xs md:text-sm line-clamp-2">{avatar.description}</CardDescription>
                  </div>

                  {/* Selection Check Mark */}
                  {selectedAvatarId === avatar.id && (
                    <div className="flex-shrink-0">
                      <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-purple-600 flex items-center justify-center">
                        <Check className="w-4 h-4 md:w-5 md:h-5 text-white" />
                      </div>
                    </div>
                  )}
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>

        <div className="text-center">
          <Button
            onClick={onConfirm}
            className="bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900 text-white font-semibold px-8 py-4 md:px-10 md:py-5 lg:px-12 lg:py-6 text-base md:text-lg"
            data-testid="button-start-chat"
          >
            Start Chat
          </Button>
        </div>
      </div>
    </div>
  );
}
