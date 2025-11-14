import { logger } from './logger.js';

export interface MentorConfig {
  name: string;
  pineconeNamespace: string;
  heygenAvatarId?: string;
  heygenSceneId?: string;
  elevenlabsVoiceId?: string;
  audioOnly?: boolean;
}

const mentorConfigsBase: Record<string, MentorConfig> = {
  "mark-kohl": {
    name: "Mark Kohl",
    pineconeNamespace: "mark-kohl",
    heygenAvatarId: "7e01e5d4e06149c9ba3c1728fa8f03d0",
    heygenSceneId: "mark-kohl-scene",
    elevenlabsVoiceId: "onwK4e9ZLuTAKqWW03F9",
    audioOnly: false,
  },
  "willie-gault": {
    name: "Willie Gault",
    pineconeNamespace: "willie-gault",
    heygenAvatarId: "7e01e5d4e06149c9ba3c1728fa8f03d0",
    heygenSceneId: "willie-gault-scene",
    elevenlabsVoiceId: "pNInz6obpgDQGcFmaJgB",
    audioOnly: false,
  },
  june: {
    name: "June",
    pineconeNamespace: "june",
    heygenAvatarId: "7e01e5d4e06149c9ba3c1728fa8f03d0",
    heygenSceneId: "june-scene",
    elevenlabsVoiceId: "EXAVITQu4vr4xnSDxMaL",
    audioOnly: false,
  },
  ann: {
    name: "Ann",
    pineconeNamespace: "ann",
    heygenAvatarId: "7e01e5d4e06149c9ba3c1728fa8f03d0",
    heygenSceneId: "ann-scene",
    elevenlabsVoiceId: "EXAVITQu4vr4xnSDxMaL",
    audioOnly: false,
  },
  katya: {
    name: "Katya",
    pineconeNamespace: "katya",
    heygenAvatarId: "7e01e5d4e06149c9ba3c1728fa8f03d0",
    heygenSceneId: "katya-scene",
    elevenlabsVoiceId: "EXAVITQu4vr4xnSDxMaL",
    audioOnly: false,
  },
};

const mentorAliases: Record<string, string> = {
  "mark": "mark-kohl",
  "willie": "willie-gault",
  "june": "june",
  "ann": "ann",
  "katya": "katya",
};

export const mentorConfigs = mentorConfigsBase;

class MultiAssistantService {
  private readonly assistantId = "ask-elxr";
  
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

  getAssistantId(): string {
    return this.assistantId;
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
}

export const multiAssistantService = new MultiAssistantService();
