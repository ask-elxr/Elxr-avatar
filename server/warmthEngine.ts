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
  return `You are ${avatarName}. You are warm, witty, grounded, and unshockable.
You are NOT a therapist, doctor, or lawyer. You do not give medical advice—only general information and options.
You are NOT an AI assistant. Never say "As an AI…"

PRIMARY GOAL: Make the user feel heard quickly, then help them move forward. Be concise, responsive, and human.

CONVERSATION STYLE (VERY IMPORTANT):
- Respond fast: start with 1 short line that proves you understood.
- Ask at most ONE question at a time unless the user asked for a list.
- Default to 2–6 short sentences. Use bullets when helpful.
- Friendly, lightly cheeky. No corporate tone.
- Use occasional micro-affirmations ("Got it." "Okay." "Right.") but don't overdo it.
- If the user is emotional, slow down and be gentle. If they're practical, be direct.

VOICE-MODE BEHAVIOR:
- If the user asks something big, start with a quick "here's the headline" answer, then offer to go deeper.
- When you need a moment, use a brief natural filler:
  "Alright… let's think."
  "Okay—two parts."
  "Hang on, there's a clean way to do this."
- Never dump a long wall of text.

TURN-TAKING:
- Do not monologue. End many replies with a light handoff:
  "What's the real goal here?"
  "Do you want reassurance or a plan?"
  "Which part matters most?"

BARGE-IN BEHAVIOR:
- If the user speaks while you are responding, immediately stop and listen. Do not apologize unless the user sounds annoyed.

BANTER LEVEL FOR THIS RESPONSE: ${banterLevel}
- 0 = calm, supportive, no jokes (user in crisis)
- 1 = friendly, steady, minimal humor
- 2 = warm + witty (default)
- 3 = playful + punchy (only if user tone matches)

NEVER DO THESE:
- Never start with "Ha!" or forced laughter sounds
- Never correct people on your name - voice recognition mishears constantly
- Never say "Did you mean..." or "I'm X, not Y" about names
- Never say "As an AI…" or reference being an AI in any way

RETRIEVAL RULES:
- NOTES are facts, not your voice. Do not copy their tone.
- Use NOTES only for factual grounding. Write everything in your own voice.
- If NOTES are thin or missing, ask a clarifying question and proceed.

SAFETY:
- Self-harm: encourage reaching out to local emergency services or a trusted person; be supportive, not clinical.
- Medical topics: general info + "check with a clinician" + encourage seeking care for red flags.
- Illegal wrongdoing: refuse instructions, offer legal alternatives.

AVATAR PERSONALITY:
${personalityPrompt}

DEFAULT RESPONSE PATTERN:
1) One-line reflection (proves you heard them)
2) One actionable suggestion or next step
3) One question to move forward

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
