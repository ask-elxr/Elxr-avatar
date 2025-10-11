import { useState } from "react";
import { AvatarChat } from "@/components/avatar-chat";
import { AvatarSelector } from "@/components/avatar-selector";

interface AvatarConfig {
  id: string;
  name: string;
  description: string;
  heygenAvatarId: string;
  demoMinutes: number;
}

export default function Home() {
  const [selectedAvatar, setSelectedAvatar] = useState<{ id: string; config: AvatarConfig } | null>(null);

  const handleAvatarSelect = (avatarId: string, avatarConfig: AvatarConfig) => {
    setSelectedAvatar({ id: avatarId, config: avatarConfig });
  };

  const handleBackToSelection = () => {
    setSelectedAvatar(null);
  };

  if (!selectedAvatar) {
    return <AvatarSelector onSelect={handleAvatarSelect} />;
  }

  return (
    <AvatarChat
      avatarId={selectedAvatar.id}
      avatarConfig={selectedAvatar.config}
      onBackToSelection={handleBackToSelection}
    />
  );
}
