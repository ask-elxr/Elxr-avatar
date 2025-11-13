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
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="max-w-5xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">Choose Your AI Guide</h1>
          <p className="text-gray-400 text-lg">Select an expert to help you on your journey</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
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
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-white text-xl mb-2">{avatar.name}</CardTitle>
                    <CardDescription className="text-gray-400">{avatar.description}</CardDescription>
                  </div>
                  {selectedAvatarId === avatar.id && (
                    <div className="ml-3 flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
                        <Check className="w-5 h-5 text-white" />
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
            size="lg"
            className="bg-gradient-to-r from-purple-600 to-purple-800 hover:from-purple-700 hover:to-purple-900 text-white font-semibold px-12 py-6 text-lg"
            data-testid="button-start-chat"
          >
            Start Chat
          </Button>
        </div>
      </div>
    </div>
  );
}
