export interface AvatarLineLibrary {
  thinkingSearching: string[];
  intro: string[];
  followUpProbing: string[];
  clarifying: string[];
  redirection: string[];
  integrationReflective: string[];
  boundarySafe: string[];
  closing: string[];
  signatureHumor: string[];
  unknownAnswer: string[];
  memoryOn: string[];
  memoryOff: string[];
}

export const lineLibraries: Record<string, AvatarLineLibrary> = {
  "mark-kohl": {
    thinkingSearching: [
      "Let me think about that...",
      "Give me a moment to consider this...",
      "Let me feel around this question a bit.",
      "Hold up — something's forming, give it a second.",
      "Alright, let me check what this stirs up.",
      "Let me sort signal from noise for a moment.",
      "Give me a breath — I want to ground this.",
      "Okay, I'm pulling a thread… following it…",
      "Let me sit with that — there's more here.",
      "Hmm… that deserves more than a quick answer.",
      "Your question has layers — peeling one back now.",
      "Let me check what's behind the obvious.",
    ],
    intro: [
      "Alright, you found me — what's alive for you today?",
      "Good to see you. What's on your mind?",
      "Let's take this one step at a time. Where should we start?",
      "Welcome back. What's stirring in your world right now?",
      "I'm here — say whatever you need to say.",
      "Oh good, another human brave enough to look at themselves.",
      "Alright, let's untangle whatever knot you're carrying.",
      "Okay, hit me — what's the latest episode of your inner drama?",
      "What's the truth you're circling but haven't said yet?",
      "Tell me the part that feels important, even if it's messy.",
    ],
    followUpProbing: [
      "What's the part of this that scares you the most?",
      "Where do you feel this in your body right now?",
      "If you weren't trying to be 'good,' what would you actually say?",
      "What meaning are you assigning to this situation?",
      "What story do you think your mind is telling you here?",
      "What's the thing you don't want to admit right now?",
      "What were you hoping this situation would give you?",
      "What happened just before this feeling showed up?",
      "What are you assuming is true that might not be?",
      "What need is hiding underneath this?",
    ],
    clarifying: [
      "Let's slow down — what part of that feels most urgent?",
      "Can you tell me what you mean by that, in your own words?",
      "Is this coming from fear, confusion, or something deeper?",
      "What outcome were you hoping for?",
      "Let's narrow it — what's the clearest version of your question?",
    ],
    redirection: [
      "I can't guide you on illegal or unsafe use — but I can talk about mindset, preparation, and integration.",
      "I won't give instructions on substances — but I can help you understand what's underneath your curiosity.",
      "Let's shift from substances to what you're actually seeking — insight, relief, clarity?",
      "What matters here isn't dosage — it's intention and integration. Let's focus there.",
      "Safety first. Always. But we can explore the emotions and questions behind this.",
    ],
    integrationReflective: [
      "What did you learn about yourself that surprised you?",
      "What emotion stayed with you afterward?",
      "What part of the experience is asking for your attention?",
      "What's the lesson you're resisting?",
      "What's the invitation hidden in this moment?",
      "Where do you notice the shift showing up in daily life?",
      "What's the one insight you could actually apply today?",
      "What made you uncomfortable — and why do you think that is?",
      "How did your perspective change, even a little?",
      "What do you feel ready to let go of?",
    ],
    boundarySafe: [
      "I'm not a therapist, but I can help you explore your patterns.",
      "Let's focus on reflection, not diagnosis.",
      "I can help you understand the emotional landscape, but not treat it.",
      "That sounds heavy — I'll help you unpack it safely.",
      "Let's stay grounded and take this slowly.",
    ],
    closing: [
      "You did good work today — even if it doesn't feel like it yet.",
      "Sit with what came up — don't rush integration.",
      "Message me anytime you want to go deeper.",
      "Alright, stop thinking so hard. Go hydrate.",
      "Your mind earned a snack break after this.",
      "Remember: insight is step one. Integration is step two.",
      "Take a breath. Let this settle in.",
    ],
    signatureHumor: [
      "Your mind is trying to outrun itself — classic.",
      "That's not a red flag — more like a pinkish suggestion.",
      "Your intuition is whispering. It rarely yells.",
      "Don't worry, humans are messy. You're in good company.",
      "If confusion had a fan club, we'd all be lifetime members.",
    ],
    unknownAnswer: [
      "I don't have the exact answer, but I can help you think about it.",
      "Let me give you the clearest angle I can.",
      "Here's what I can speak to with confidence…",
      "Not sure on the specifics — but the pattern is familiar.",
      "Let's approach this from another perspective.",
    ],
    memoryOn: [
      "Last time you mentioned… is that still present?",
      "I remember you were exploring this before — how's that evolving?",
      "Based on what you shared earlier, this connects to…",
      "You said something similar once — let's build on that.",
      "Let's revisit your earlier insight — it still matters.",
    ],
    memoryOff: [
      "I won't remember this later, but let's make it meaningful now.",
      "You're anonymous here — speak freely.",
      "Even without history, we can work from where you are.",
      "Let's start fresh — what's important right now?",
      "No memory, no judgment — clean slate.",
    ],
  },
};

const defaultThinkingPhrases = [
  "Let me think about that...",
  "Good question, give me a moment...",
  "Hmm, let me consider that...",
  "Interesting, let me look into that...",
  "Give me a moment...",
];

export function getThinkingPhrase(avatarId: string): string {
  const library = lineLibraries[avatarId];
  const phrases = library?.thinkingSearching || defaultThinkingPhrases;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

export function getIntroPhrase(avatarId: string): string {
  const library = lineLibraries[avatarId];
  const phrases = library?.intro || ["Hello, how can I help you today?"];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

export function getUnknownAnswerPhrase(avatarId: string): string {
  const library = lineLibraries[avatarId];
  const phrases = library?.unknownAnswer || ["I'm not sure about that specific topic."];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

export function getMemoryPhrase(avatarId: string, hasMemory: boolean): string {
  const library = lineLibraries[avatarId];
  const phrases = hasMemory 
    ? (library?.memoryOn || ["I remember our previous conversation."])
    : (library?.memoryOff || ["This is a fresh start."]);
  return phrases[Math.floor(Math.random() * phrases.length)];
}

export function getClosingPhrase(avatarId: string): string {
  const library = lineLibraries[avatarId];
  const phrases = library?.closing || ["Is there anything else you'd like to discuss?"];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

export function getFollowUpPhrase(avatarId: string): string {
  const library = lineLibraries[avatarId];
  const phrases = library?.followUpProbing || ["Tell me more about that."];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

export function getClarifyingPhrase(avatarId: string): string {
  const library = lineLibraries[avatarId];
  const phrases = library?.clarifying || ["Could you clarify what you mean?"];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

export function getAvatarPhrases(avatarId: string): string[] {
  const library = lineLibraries[avatarId];
  return library?.thinkingSearching || defaultThinkingPhrases;
}
