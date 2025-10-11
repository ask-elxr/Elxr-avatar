import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface Avatar {
  id: string;
  name: string;
  description: string;
  heygenAvatarId: string;
  demoMinutes: number;
}

interface AvatarSelectorProps {
  onSelect: (avatarId: string, avatarConfig: Avatar) => void;
}

export function AvatarSelector({ onSelect }: AvatarSelectorProps) {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);

  useEffect(() => {
    fetchAvatars();
  }, []);

  const fetchAvatars = async () => {
    try {
      const response = await fetch('/api/avatars');
      const data = await response.json();
      if (data.success) {
        setAvatars(data.avatars);
      }
    } catch (error) {
      console.error('Error fetching avatars:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (avatar: Avatar) => {
    setSelectedAvatar(avatar.id);
    setTimeout(() => {
      onSelect(avatar.id, avatar);
    }, 300);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
      <div className="max-w-6xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Choose Your AI Guide
          </h1>
          <p className="text-gray-400 text-lg">
            Select an avatar to start your 5-minute demo session
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {avatars.map((avatar) => (
            <Card
              key={avatar.id}
              className={`relative overflow-hidden transition-all duration-300 cursor-pointer ${
                selectedAvatar === avatar.id
                  ? "ring-4 ring-purple-500 scale-105"
                  : "hover:ring-2 hover:ring-purple-400 hover:scale-102"
              } bg-zinc-900 border-zinc-800`}
              onClick={() => handleSelect(avatar)}
              data-testid={`avatar-card-${avatar.id}`}
            >
              <div className="p-6">
                <div className="mb-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-4">
                    {avatar.name.charAt(0)}
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">
                    {avatar.name}
                  </h3>
                  <p className="text-gray-400 text-sm mb-4">
                    {avatar.description}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {avatar.demoMinutes} min demo
                  </span>
                  <Button
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-700"
                    data-testid={`button-select-${avatar.id}`}
                  >
                    {selectedAvatar === avatar.id ? "Starting..." : "Select"}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="mt-8 text-center">
          <p className="text-gray-500 text-sm">
            💡 Tip: Sign in after your demo for long-term memory across sessions
          </p>
        </div>
      </div>
    </div>
  );
}
