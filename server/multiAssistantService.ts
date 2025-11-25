import { logger } from './logger.js';

export interface MentorConfig {
  name: string;
  pineconeNamespace: string;
  assistantId: string;
  category?: string;
  heygenAvatarId?: string;
  heygenSceneId?: string;
  elevenlabsVoiceId?: string;
  audioOnly?: boolean;
}

const mentorConfigsBase: Record<string, MentorConfig> = {
  "mark-kohl": {
    name: "Mark Kohl",
    pineconeNamespace: "default",
    assistantId: "ask-elxr",
    category: "psychedelics",
    heygenAvatarId: "7e01e5d4e06149c9ba3c1728fa8f03d0",
    heygenSceneId: "7e01e5d4e06149c9ba3c1728fa8f03d0",
    elevenlabsVoiceId: "onwK4e9ZLuTAKqWW03F9",
    audioOnly: false,
  },
  "willie-gault": {
    name: "Willie Gault",
    pineconeNamespace: "willie-gault",
    assistantId: "ask-elxr",
    category: "work",
    heygenAvatarId: "7e01e5d4e06149c9ba3c1728fa8f03d0",
    heygenSceneId: "7e01e5d4e06149c9ba3c1728fa8f03d0",
    elevenlabsVoiceId: "pNInz6obpgDQGcFmaJgB",
    audioOnly: false,
  },
  june: {
    name: "June",
    pineconeNamespace: "june",
    assistantId: "ask-elxr",
    category: "mind",
    heygenAvatarId: "3b7f24e3906d417db21cd1eddcd52f4c",
    heygenSceneId: "3b7f24e3906d417db21cd1eddcd52f4c",
    elevenlabsVoiceId: "EXAVITQu4vr4xnSDxMaL",
    audioOnly: false,
  },
  ann: {
    name: "Ann",
    pineconeNamespace: "ann",
    assistantId: "ask-elxr",
    category: "body",
    heygenAvatarId: "7e01e5d4e06149c9ba3c1728fa8f03d0",
    heygenSceneId: "7e01e5d4e06149c9ba3c1728fa8f03d0",
    elevenlabsVoiceId: "21m00Tcm4TlvDq8ikWAM",
    audioOnly: false,
  },
  shawn: {
    name: "Shawn",
    pineconeNamespace: "shawn",
    assistantId: "ask-elxr",
    category: "leadership",
    heygenAvatarId: "7e01e5d4e06149c9ba3c1728fa8f03d0",
    heygenSceneId: "7e01e5d4e06149c9ba3c1728fa8f03d0",
    elevenlabsVoiceId: "bVMeCyTHy58xNoL34h3H",
    audioOnly: false,
  },
  thad: {
    name: "Thad",
    pineconeNamespace: "thad",
    assistantId: "ask-elxr",
    category: "finance",
    heygenAvatarId: "7e01e5d4e06149c9ba3c1728fa8f03d0",
    heygenSceneId: "7e01e5d4e06149c9ba3c1728fa8f03d0",
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

  getAssistantId(mentorId: string): string {
    const config = this.getMentorConfig(mentorId);
    if (!config) {
      logger.warn({ mentorId }, 'Using default ask-elxr assistant');
      return "ask-elxr";
    }
    return config.assistantId;
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
    assistantId: string;
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
      assistantId: config.assistantId,
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
