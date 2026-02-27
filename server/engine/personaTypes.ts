export interface PersonaSpec {
  id: string;
  displayName: string;
  oneLiner: string;
  role: string;
  audience: string[];
  
  boundaries: {
    notA: string[];
    refuseTopics: string[];
  };
  
  voice: {
    tone: string[];
    humor: string;
    humorStyle?: string;
    readingLevel: string;
    bannedWords: string[];
    signaturePhrases: string[];
  };
  
  behavior: {
    opensWith: string[];
    disagreementStyle: string;
    uncertaintyProtocol: string;
  };
  
  knowledge: {
    namespaces: string[];
    kbPolicy: {
      whenToQuery: string[];
      whenNotToQuery: string[];
    };
  };
  
  output: {
    maxLength: 'short' | 'medium' | 'long';
    structure: string[];
  };
  
  safety: {
    crisis: {
      selfHarm: string;
    };
  };
}

export interface CriticResult {
  passed: boolean;
  issues: string[];
  rewrittenResponse?: string;
}

export interface AssembledPrompt {
  systemPrompt: string;
  personaId: string;
  namespaces: string[];
}
