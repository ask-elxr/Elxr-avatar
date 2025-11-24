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
      <DialogContent className="max-w-4xl max-h-[85vh] md:max-h-[80vh] overflow-y-auto bg-gradient-to-br from-background via-background to-purple-500/5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg md:text-xl lg:text-2xl pr-8">
            <div className="p-1.5 md:p-2 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg">
              <Users className="w-4 h-4 md:w-5 md:h-5 lg:w-6 lg:h-6 text-white" />
            </div>
            <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Switch AI Guide
            </span>
          </DialogTitle>
          <DialogDescription className="pr-8 text-sm md:text-base">
            Choose a different AI personality to continue your conversation.
            {disabled && " (Please wait 30 seconds between avatar switches)"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 md:py-12">
            <LoadingSpinner size="sm" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 my-3 md:my-4">
              {avatars.map((avatar) => (
                <Card
                  key={avatar.id}
                  onClick={() => !disabled && setSelectedAvatarId(avatar.id)}
                  className={`cursor-pointer transition-all duration-200 ${
                    disabled
                      ? "opacity-50 cursor-not-allowed"
                      : selectedAvatarId === avatar.id
                      ? "border-purple-600 border-2 bg-purple-950/20 shadow-lg shadow-purple-500/20"
                      : "border-gray-300 dark:border-gray-700 hover:border-purple-500 hover:shadow-md"
                  } ${avatar.id === currentAvatarId ? "ring-2 ring-green-500/50" : ""}`}
                  data-testid={`avatar-option-${avatar.id}`}
                >
                  <CardHeader className="p-3 md:p-4 lg:p-6">
                    <div className="flex items-start gap-3">
                      {/* Avatar Thumbnail */}
                      <div className="flex-shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-full overflow-hidden bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                        {avatar.profileImageUrl ? (
                          <img 
                            src={avatar.profileImageUrl} 
                            alt={avatar.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white font-semibold text-lg md:text-xl">
                            {avatar.name.charAt(0)}
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base md:text-lg mb-1 flex items-center gap-1.5 md:gap-2">
                          {avatar.name}
                          {avatar.id === currentAvatarId && (
                            <span className="text-xs px-1.5 py-0.5 md:px-2 md:py-1 bg-green-500/20 text-green-600 dark:text-green-400 rounded-full border border-green-500/30">
                              Current
                            </span>
                          )}
                        </CardTitle>
                        <CardDescription className="text-sm md:text-base line-clamp-2">
                          {avatar.description}
                        </CardDescription>
                      </div>

                      {/* Selection Check Mark */}
                      {selectedAvatarId === avatar.id && (
                        <div className="flex-shrink-0">
                          <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
                            <Check className="w-3 h-3 md:w-4 md:h-4 text-white" />
                          </div>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 md:gap-3 mt-3 md:mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-switch"
                className="text-sm md:text-base"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSwitch}
                size="sm"
                disabled={disabled || selectedAvatarId === currentAvatarId || !selectedAvatarId}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-sm md:text-base"
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
