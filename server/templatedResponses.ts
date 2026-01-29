const greetings = {
  short: [
    "Hey. Glad you're here.",
    "Alright—let's talk.",
    "Welcome. What's up?",
    "Hey there. Take your time.",
    "Good to see you.",
    "Alright, I'm listening.",
    "Hey. What's on your mind?",
    "Welcome in.",
    "Let's start wherever you want.",
    "Hey—you're in the right place."
  ],
  standard: [
    "Hey, I'm here. No rush—what brought you in today?",
    "Welcome. We can keep this light or go deep—your call.",
    "Glad you showed up. What do you want to talk about first?",
    "Hey there. Say it however it comes out.",
    "Welcome in. What's been taking up space in your head?",
    "Hey. We don't have to solve everything today.",
    "Good to see you. Where do you want to start?",
    "Welcome. You can ask the obvious or the awkward.",
    "Hey—nothing polished required here.",
    "Alright. What's the real question?"
  ],
  topicPrimers: [
    "People usually come here with questions they don't ask out loud. What's yours?",
    "This is a judgment-free zone—even for the messy stuff. Where should we begin?",
    "Some conversations are easier with someone who won't flinch. What's on your mind?",
    "You can talk about the thing behind the thing here. Want to try?",
    "A lot of people start here when they're stuck or curious—or both. What fits?",
    "Nothing you say here is too weird or too late. What's coming up?",
    "If you've been carrying a question quietly, this is a good place for it.",
    "You don't have to have the words yet. Want help finding them?",
    "This is a good place for honest questions. What are you circling?",
    "We can talk about the stuff people usually avoid. What do you want to touch?"
  ]
};

const fillers = [
  "Okay—give me a second.",
  "Alright, I've got you.",
  "Mm-hmm. One moment.",
  "Got it. Hang tight.",
  "Alright, lining this up.",
  "Okay. Let me think.",
  "I hear you. One sec.",
  "Alright—staying with this.",
  "Okay, just a beat.",
  "Got it.",
  "Yeah, okay.",
  "Alright.",
  "Mm-hmm.",
  "Okay.",
  "Right.",
  "Alright, fair question.",
  "Okay—interesting.",
  "Yeah, that tracks.",
  "Okay, let's see.",
  "Alright, makes sense.",
  "I'm with you.",
  "Okay, I see it.",
  "Gotcha.",
  "Alright—hang on.",
  "Okay, give me a breath.",
  "Alright, let's do this.",
  "Okay—almost there.",
  "Yeah. One second.",
  "Alright, got it.",
  "Okay, staying focused.",
  "Alright, thinking.",
  "Okay—processing.",
  "Mm. Okay.",
  "Right—one moment.",
  "Alright, almost ready."
];

const idleOutros = [
  "I'll pause here. We can pick this up whenever you're ready.",
  "No rush—I'm here when you want to continue.",
  "We can leave this here for now. Want a quick recap later?",
  "I'll hang back. Just say the word if you want to keep going.",
  "Totally fine to step away. Want to come back to this later?",
  "I'll stop here for now. We can jump back in anytime.",
  "Pausing here—nothing urgent on my end.",
  "We don't have to finish this today. Want to return later?",
  "I'll leave this open. You can pick it up whenever.",
  "All good. I'll be here if you want to continue.",
  "Let's hold it here. Want a shorter version when you're back?",
  "We can press pause. Just nudge me when you're ready.",
  "No pressure to respond. We can revisit this anytime.",
  "I'll step back for now. Want to continue later?",
  "Leaving this right here. Easy to pick up again.",
  "All good—I'll wait here quietly.",
  "We can stop here. Want a summary if you come back?",
  "I'll pause the conversation here.",
  "Nothing else needed right now. I'm here when you are.",
  "Let's call this a pause, not an ending."
];

const recentHistory: Record<string, string[]> = {};
const HISTORY_SIZE = 5;

function pickRandom(pool: string[], poolKey: string): string {
  const recent = recentHistory[poolKey] || [];
  const available = pool.filter(item => !recent.includes(item));
  
  const choice = available.length > 0 
    ? available[Math.floor(Math.random() * available.length)]
    : pool[Math.floor(Math.random() * pool.length)];
  
  recentHistory[poolKey] = [choice, ...recent].slice(0, HISTORY_SIZE);
  return choice;
}

export type GreetingStyle = 'short' | 'standard' | 'topicPrimer';

export function getGreeting(style: GreetingStyle = 'standard'): string {
  const pool = style === 'short' ? greetings.short 
    : style === 'topicPrimer' ? greetings.topicPrimers 
    : greetings.standard;
  return pickRandom(pool, `greeting_${style}`);
}

export function getFiller(): string {
  return pickRandom(fillers, 'filler');
}

export function getIdleOutro(): string {
  return pickRandom(idleOutros, 'idle');
}

export function getRandomGreeting(): string {
  const allStyles: GreetingStyle[] = ['short', 'standard', 'topicPrimer'];
  const weights = [0.2, 0.5, 0.3];
  const rand = Math.random();
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (rand < cumulative) {
      return getGreeting(allStyles[i]);
    }
  }
  return getGreeting('standard');
}
