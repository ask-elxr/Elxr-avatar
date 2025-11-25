import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Users } from "lucide-react";
import type { AvatarProfile } from "@shared/schema";
import { LoadingSpinner } from "@/components/loading-spinner";

interface AvatarSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentAvatarId: string;
  onSwitch: (newAvatarId: string) => void;
  disabled?: boolean;
}

export function AvatarSwitcher({
  open,
  onOpenChange,
  currentAvatarId,
  onSwitch,
  disabled = false,
}: AvatarSwitcherProps) {
  const [avatars, setAvatars] = useState<AvatarProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAvatarId, setSelectedAvatarId] = useState(currentAvatarId);

  // Avatar GIF mapping (same as avatar-select page)
  const avatarGifs: Record<string, string> = {
    'mark-kohl': '/attached_assets/MArk-kohl-loop_1763964600000.gif',
    'willie-gault': '/attached_assets/Willie gault gif-low_1763964813725.gif',
    'june': '/attached_assets/June-low_1764106896823.gif',
    'thad': '/attached_assets/Thad_1763963906199.gif',
    'nigel': '/attached_assets/Nigel-Loop-avatar_1763964600000.gif',
    'ann': '/attached_assets/Ann_1763966361095.gif',
    'kelsey': '/attached_assets/Kelsey_1764111279103.gif',
    'judy': '/attached_assets/Screen Recording 2025-07-14 at 14.35.37-low_1764106921758.gif',
    'dexter': '/attached_assets/DexterDoctor_1764107339868.gif',
    'shawn': '/attached_assets/Screen Recording 2025-07-14 at 14.41.54-low_1764106970821.gif',
  };

  useEffect(() => {
    setSelectedAvatarId(currentAvatarId);
  }, [currentAvatarId]);

  useEffect(() => {
    const fetchAvatars = async () => {
      try {
        const response = await fetch("/api/avatars");
        if (response.ok) {
          const data = await response.json();
          setAvatars(data.filter((a: AvatarProfile) => a.isActive));
        }
      } catch (error) {
        console.error("Error fetching avatars:", error);
      } finally {
        setLoading(false);
      }
    };

    if (open) {
      fetchAvatars();
    }
  }, [open]);

  const handleSwitch = () => {
    if (selectedAvatarId && selectedAvatarId !== currentAvatarId) {
      onSwitch(selectedAvatarId);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-black border-gray-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl md:text-3xl pr-8 font-satoshi text-white">
            <div className="p-2 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg">
              <Users className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            Switch AI Guide
          </DialogTitle>
          <DialogDescription className="pr-8 text-base text-gray-400 font-satoshi">
            Choose a different AI personality to continue your conversation.
            {disabled && " (Please wait 30 seconds between avatar switches)"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="sm" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 lg:gap-6 my-4">
              {avatars.map((avatar) => (
                <Card
                  key={avatar.id}
                  onClick={() => !disabled && setSelectedAvatarId(avatar.id)}
                  className={`cursor-pointer transition-all duration-200 ${
                    disabled
                      ? "opacity-50 cursor-not-allowed"
                      : selectedAvatarId === avatar.id
                      ? "border-purple-600 border-2 bg-purple-950/20"
                      : "border-gray-700 hover:border-purple-500 bg-gray-900/50"
                  }`}
                  data-testid={`avatar-option-${avatar.id}`}
                >
                  <CardHeader className="p-4 md:p-5 lg:p-6">
                    <div className="flex flex-col gap-4">
                      {/* Avatar Image/GIF - Full Width */}
                      <div className="w-full aspect-square rounded-lg overflow-hidden bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center relative">
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
                        
                        {/* Current Badge */}
                        {avatar.id === currentAvatarId && (
                          <div className="absolute top-2 right-2">
                            <span className="text-xs px-2 py-1 bg-green-500 text-white rounded-full font-satoshi font-medium">
                              Current
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
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
                          <div className="flex-shrink-0 ml-3">
                            <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center">
                              <Check className="w-4 h-4 text-white" />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3 mt-4">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-switch"
                className="text-base font-satoshi border-gray-700 text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSwitch}
                disabled={disabled || selectedAvatarId === currentAvatarId || !selectedAvatarId}
                className="bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900 text-white font-bold px-8 py-2 text-base font-satoshi rounded-full shadow-2xl transition-all duration-300 hover:scale-105 disabled:opacity-50"
                data-testid="button-confirm-switch"
              >
                {selectedAvatarId === currentAvatarId ? "Already Selected" : "Switch Avatar"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
