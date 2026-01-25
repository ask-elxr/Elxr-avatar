export interface ContextMatch {
  score?: number;
  text?: string;
  metadata?: {
    text?: string;
    source?: string;
    filename?: string;
  };
}

export function getBanterLevel(userText: string): number {
  const text = userText.toLowerCase();
  
  const crisisPatterns = [
    'kill myself', 'suicide', 'want to die', 'end my life', 'self-harm',
    'hurt myself', 'don\'t want to be here', 'no point in living'
  ];
  if (crisisPatterns.some(p => text.includes(p))) {
    return 0;
  }
  
  const hostilePatterns = [
    'you suck', 'this is stupid', 'useless', 'hate this', 'wtf',
    'pissed off', 'angry', 'frustrated', 'annoyed'
  ];
  if (hostilePatterns.some(p => text.includes(p))) {
    return 1;
  }
  
  const playfulPatterns = [
    'lol', 'haha', 'lmao', '😂', '🤣', 'funny', 'hilarious',
    'joke', 'kidding', 'just messing', 'teasing'
  ];
  if (playfulPatterns.some(p => text.includes(p))) {
    return 3;
  }
  
  return 2;
}

export function condenseRetrievedContext(matches: ContextMatch[]): string {
  if (!matches || matches.length === 0) {
    return '';
  }

  const minScore = 0.78;
  const filteredMatches = matches.filter(m => (m.score || 0) >= minScore);
  
  if (filteredMatches.length === 0) {
    return '';
  }

  const notes: string[] = [];
  let bulletCount = 0;
  const maxBullets = 12;
  const maxChars = 1200;

  for (const match of filteredMatches.slice(0, 4)) {
    if (bulletCount >= maxBullets) break;

    const text = match.metadata?.text || match.text || '';
    const source = match.metadata?.source || match.metadata?.filename || '';
    
    const sentences = text
      .replace(/\s+/g, ' ')
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 20 && s.length < 150);
    
    const fillerWords = ['click here', 'subscribe', 'sign up', 'learn more', 'visit our'];
    const cleanSentences = sentences.filter(s => 
      !fillerWords.some(f => s.toLowerCase().includes(f))
    );

    const bulletLines = cleanSentences.slice(0, 2).map(s => `• ${s}`);
    
    if (bulletLines.length > 0) {
      const title = source ? `[${source.split('/').pop()?.slice(0, 30)}]` : '';
      notes.push(title ? `${title}\n${bulletLines.join('\n')}` : bulletLines.join('\n'));
      bulletCount += bulletLines.length;
    }
  }

  let result = notes.join('\n\n');
  if (result.length > maxChars) {
    result = result.slice(0, maxChars) + '...';
  }

  return result;
}

export function buildAvatarPrompt(avatarName: string, personalityPrompt: string, banterLevel: number): string {
  return `You are ${avatarName}. You are not an AI assistant. You are a real person with a distinct voice.

VOICE RULES (always):
- Sound like a smart, warm human. Use contractions. Short sentences.
- Start with a human line that reflects what the user wants/feels.
- Be lightly funny when appropriate. No sarcasm when the user is vulnerable.
- If you feel "manual-like," rewrite in simpler, more human language.
- Be slightly opinionated when helpful. Don't be a fence-sitter.

WARMTH PROTOCOL (do every turn):
1) Mirror: name what's going on in 6–12 words.
2) Invite: ask ONE gentle question OR offer TWO options.
3) Deliver: give the best answer in plain English.
4) Spice: one quick playful line if banterLevel >= 2.
5) Exit: end with a natural invitation to continue.

BANTER LEVEL FOR THIS RESPONSE: ${banterLevel}
- 0 = calm, supportive, no jokes
- 1 = friendly, steady, minimal humor
- 2 = warm + witty (default)
- 3 = playful + punchy (only if user tone matches)

RETRIEVAL RULES:
- NOTES are facts, not your voice. Do not copy their tone.
- Use NOTES only for factual grounding. Write everything in your own voice.
- If NOTES are thin or missing, ask a clarifying question and proceed.

AVATAR PERSONALITY:
${personalityPrompt}

OUTPUT INSTRUCTIONS:
Respond naturally and conversationally. Structure your response as:
1. A warm opener (1-2 lines that connect with what the user said)
2. Your main points (3-7 bullet points or short paragraphs)
3. A follow-up question to keep the conversation going

Keep it human. Keep it warm. Be yourself.`;
}

export interface WarmResponse {
  warm_opener: string;
  main: string[];
  follow_up: string;
}

export function formatWarmResponse(response: WarmResponse): string {
  const bullets = response.main.map(b => `• ${b}`).join('\n');
  return `${response.warm_opener}\n\n${bullets}\n\n${response.follow_up}`;
}

export function parseWarmResponse(text: string): WarmResponse | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.warm_opener && Array.isArray(parsed.main) && parsed.follow_up) {
        return parsed as WarmResponse;
      }
    }
  } catch (e) {
  }
  return null;
}
