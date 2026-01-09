import { logger } from './logger.js';

export interface MentorConfig {
  name: string;
  pineconeNamespace: string;
  category?: string;
  heygenAvatarId?: string;
  heygenSceneId?: string;
  elevenlabsVoiceId?: string;
  audioOnly?: boolean;
}

const mentorConfigsBase: Record<string, MentorConfig> = {
  "mark-kohl": {
    name: "Mark Kohl",
    pineconeNamespace: "MARK_KOHL",
    category: "psychedelics",
    heygenAvatarId: "7e01e5d4e06149c9ba3c1728fa8f03d0",
    heygenSceneId: "7e01e5d4e06149c9ba3c1728fa8f03d0",
    elevenlabsVoiceId: "onwK4e9ZLuTAKqWW03F9",
    audioOnly: false,
  },
  "willie-gault": {
    name: "Willie Gault",
    pineconeNamespace: "willie-gault",
    category: "work",
    heygenAvatarId: "7e01e5d4e06149c9ba3c1728fa8f03d0",
    heygenSceneId: "7e01e5d4e06149c9ba3c1728fa8f03d0",
    elevenlabsVoiceId: "oNLn7a7xv87XHdamxgeT",
    audioOnly: false,
  },
  june: {
    name: "June",
    pineconeNamespace: "june",
    category: "mind",
    heygenAvatarId: "3b7f24e3906d417db21cd1eddcd52f4c",
    heygenSceneId: "3b7f24e3906d417db21cd1eddcd52f4c",
    elevenlabsVoiceId: "EXAVITQu4vr4xnSDxMaL",
    audioOnly: false,
  },
  ann: {
    name: "Ann",
    pineconeNamespace: "ann",
    category: "body",
    heygenAvatarId: "7e01e5d4e06149c9ba3c1728fa8f03d0",
    heygenSceneId: "7e01e5d4e06149c9ba3c1728fa8f03d0",
    elevenlabsVoiceId: "21m00Tcm4TlvDq8ikWAM",
    audioOnly: false,
  },
  shawn: {
    name: "Shawn",
    pineconeNamespace: "shawn",
    category: "business",
    heygenAvatarId: "Shawn_Therapist_public",
    heygenSceneId: "Shawn_Therapist_public",
    elevenlabsVoiceId: "bVMeCyTHy58xNoL34h3H",
    audioOnly: false,
  },
  thad: {
    name: "Thad",
    pineconeNamespace: "thad",
    category: "finance",
    heygenAvatarId: "7e01e5d4e06149c9ba3c1728fa8f03d0",
    heygenSceneId: "7e01e5d4e06149c9ba3c1728fa8f03d0",
    elevenlabsVoiceId: "VR6AewLTigWG4xSOukaG",
    audioOnly: false,
  },
  kelsey: {
    name: "Kelsey",
    pineconeNamespace: "kelsey",
    category: "transitions",
    heygenAvatarId: "Katya_CasualLook_public",
    heygenSceneId: "Katya_CasualLook_public",
    elevenlabsVoiceId: "EXAVITQu4vr4xnSDxMaL",
    audioOnly: false,
  },
  judy: {
    name: "Judy",
    pineconeNamespace: "judy",
    category: "wellness",
    heygenAvatarId: "Judy_Teacher_Sitting_public",
    heygenSceneId: "Judy_Teacher_Sitting_public",
    elevenlabsVoiceId: "EXAVITQu4vr4xnSDxMaL",
    audioOnly: false,
  },
  dexter: {
    name: "Dexter",
    pineconeNamespace: "dexter",
    category: "medical",
    heygenAvatarId: "Dexter_Doctor_Sitting2_public",
    heygenSceneId: "Dexter_Doctor_Sitting2_public",
    elevenlabsVoiceId: "VR6AewLTigWG4xSOukaG",
    audioOnly: false,
  },
};

const mentorAliases: Record<string, string> = {
  "mark": "mark-kohl",
  "willie": "willie-gault",
  "june": "june",
  "ann": "ann",
  "shawn": "shawn",
  "thad": "thad",
  "kelsey": "kelsey",
  "judy": "judy",
  "dexter": "dexter",
};

export const mentorConfigs = mentorConfigsBase;

class MultiAssistantService {
  private normalizeMentorId(mentorId: string): string {
    const normalized = mentorId.toLowerCase();
    return mentorAliases[normalized] || normalized;
  }
  
  getMentorConfig(mentorId: string): MentorConfig | null {
    const normalizedId = this.normalizeMentorId(mentorId);
    const config = mentorConfigs[normalizedId];
    if (!config) {
      logger.warn({ mentorId, normalizedId }, 'Mentor configuration not found');
      return null;
    }
    return config;
  }

  getPineconeNamespace(mentorId: string): string {
    const config = this.getMentorConfig(mentorId);
    if (!config) {
      logger.warn({ mentorId }, 'Using default ask-elxr namespace');
      return "ask-elxr";
    }
    return config.pineconeNamespace;
  }

  listMentors(): MentorConfig[] {
    return Object.values(mentorConfigs);
  }

  getEmbedConfig(mentorId: string): {
    sceneId: string | null;
    voiceConfig: {
      elevenlabsVoiceId: string | null;
      voiceRate: string;
    };
    audioOnly: boolean;
  } | null {
    const config = this.getMentorConfig(mentorId);
    if (!config) {
      return null;
    }

    return {
      sceneId: config.heygenSceneId || null,
      voiceConfig: {
        elevenlabsVoiceId: config.elevenlabsVoiceId || null,
        voiceRate: "1.0",
      },
      audioOnly: config.audioOnly || false,
    };
  }

  getMetadataForMentor(mentorId: string): Record<string, any> {
    const config = this.getMentorConfig(mentorId);
    if (!config) {
      return {};
    }

    return {
      mentorId: this.normalizeMentorId(mentorId),
      category: config.category,
      userId: 'user-1',
    };
  }
}

export const multiAssistantService = new MultiAssistantService();
