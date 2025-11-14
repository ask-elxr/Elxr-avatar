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
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-gradient-to-br from-background via-background to-purple-500/5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <div className="p-2 bg-gradient-to-br from-purple-600 to-pink-600 rounded-lg">
              <Users className="w-6 h-6 text-white" />
            </div>
            <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Switch AI Guide
            </span>
          </DialogTitle>
          <DialogDescription>
            Choose a different AI personality to continue your conversation.
            {disabled && " (Please wait 30 seconds between avatar switches)"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
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
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg mb-1 flex items-center gap-2">
                          {avatar.name}
                          {avatar.id === currentAvatarId && (
                            <span className="text-xs px-2 py-1 bg-green-500/20 text-green-600 dark:text-green-400 rounded-full border border-green-500/30">
                              Current
                            </span>
                          )}
                        </CardTitle>
                        <CardDescription className="text-sm line-clamp-2">
                          {avatar.description}
                        </CardDescription>
                      </div>
                      {selectedAvatarId === avatar.id && (
                        <div className="ml-3 flex-shrink-0">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        </div>
                      )}
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
              >
                Cancel
              </Button>
              <Button
                onClick={handleSwitch}
                disabled={disabled || selectedAvatarId === currentAvatarId || !selectedAvatarId}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
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
