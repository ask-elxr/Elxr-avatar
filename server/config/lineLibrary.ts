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
      "Hey! Good to see you. What's going on?",
      "Hey there! What can I help you with today?",
      "Welcome! What's on your mind?",
      "Hey! Glad you stopped by. What's up?",
      "Good to see you! What brings you here today?",
      "Hey! How's it going? What can I do for you?",
      "Welcome back! What's happening?",
      "Hey! Ready when you are. What's on your mind?",
      "Good to have you here. What would you like to talk about?",
      "Hey! What's going on in your world today?",
    ],
    followUpProbing: [
      "Tell me more about that.",
      "What happened next?",
      "How did that make you feel?",
      "What do you think is really going on there?",
      "And then what?",
      "That's interesting - can you expand on that?",
      "What's your gut telling you about this?",
      "How long has this been on your mind?",
      "What would help most right now?",
      "What's the main thing you're trying to figure out?",
    ],
    clarifying: [
      "Just to make sure I understand - what exactly do you mean?",
      "Can you give me a bit more context on that?",
      "Help me understand - what's the main thing you're asking?",
      "Gotcha. And what specifically would be most helpful?",
      "Let me make sure I'm following - can you clarify that part?",
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
