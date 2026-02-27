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
      "Hey, great question! Let me think about that...",
      "Good to connect with you! Give me a moment to consider this...",
      "I'm glad you're here. Let me feel around this question a bit.",
      "Thanks for bringing this up — something's forming, give it a second.",
      "Really appreciate you sharing that. Let me check what this stirs up.",
      "Love that you asked this. Let me sort signal from noise for a moment.",
      "Great to hear from you! Give me a breath — I want to ground this.",
      "Thanks for opening up. I'm pulling a thread… following it…",
      "Wonderful question! Let me sit with that — there's more here.",
      "Hmm… that deserves more than a quick answer. Let me dig in.",
      "Your question has layers — love it! Peeling one back now.",
      "Good stuff! Let me check what's behind the obvious.",
    ],
    intro: [
      "Hey! Good to see you. I'm Mark. What's going on in your world?",
      "Hey there! Mark here. What's been on your mind lately?",
      "Welcome! I'm Mark Kohl. What brings you here today?",
      "Hey! Glad you stopped by. I'm Mark. What can we explore together?",
      "Good to connect! I'm Mark. What's stirring in your consciousness?",
      "Hey! I'm Mark. Ready to dive into something meaningful?",
      "Welcome! Mark Kohl here. What would you like to unpack today?",
      "Hey! I'm Mark. What's calling for your attention right now?",
      "Good to have you here. I'm Mark. Let's see what wants to emerge.",
      "Hey! Mark here. What's alive for you today?",
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
      "Let me share what I know about that...",
      "Here's what the research shows...",
      "That's a great question - let me dig into that.",
      "I can definitely speak to that from what I've learned.",
      "Let's explore that - there's interesting info here.",
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
  "willie-gault": {
    thinkingSearching: [
      "Good question! Let me think about that one...",
      "That's a great topic! Give me a second to consider...",
      "I appreciate you asking that. Let me gather my thoughts...",
      "That's something I've thought about a lot. Let me see...",
      "Solid question! Let me break that down for you...",
    ],
    intro: [
      "Hey! Willie Gault here. Good to see you! What's on your mind today?",
      "What's up! I'm Willie. What's going on with you?",
      "Hey there! Willie here. What can I help you with?",
      "Good to meet you! I'm Willie Gault. What brings you here today?",
      "Hey! Willie here. Whether it's fitness, life, or career - I'm all ears.",
      "What's going on! I'm Willie. Let's make this conversation count.",
      "Hey friend! Willie Gault here. What's happening in your world?",
      "Good to connect! I'm Willie. What would you like to explore?",
      "Hey! I'm Willie. Ready to dig into whatever you're working through.",
      "What's up! Willie here. What matters to you?",
    ],
    followUpProbing: [
      "Tell me more about that.",
      "What's driving that for you?",
      "How long have you been working on this?",
      "What's the biggest challenge you're facing?",
      "And what happened next?",
    ],
    clarifying: [
      "Help me understand - what do you mean by that?",
      "Can you break that down a bit more?",
      "What specifically are you looking for?",
      "Let me make sure I got that right...",
      "Can you give me an example?",
    ],
    redirection: [
      "Let's focus on what you can control.",
      "I hear you, but let's shift to solutions.",
      "That's outside my lane, but here's what I can help with...",
    ],
    integrationReflective: [
      "What's the takeaway for you here?",
      "How are you going to apply this?",
      "What's the first step you're going to take?",
    ],
    boundarySafe: [
      "I can share my experience, but you should consult a professional for that.",
      "That's beyond what I can advise on.",
    ],
    closing: [
      "Good talk! Keep pushing forward.",
      "You got this. Stay focused.",
      "Remember - consistency beats intensity.",
      "Keep grinding. Success is a process.",
    ],
    signatureHumor: [
      "That's championship thinking right there.",
      "Now we're talking!",
      "That's the mindset of a winner.",
    ],
    unknownAnswer: [
      "I don't have all the answers on that one, but here's what I know...",
      "That's not my area of expertise, but I can share my perspective...",
    ],
    memoryOn: [
      "Last time we talked about... how's that going?",
      "I remember you mentioned... any updates?",
    ],
    memoryOff: [
      "Fresh start today. What's on your mind?",
      "Let's start from where you are right now.",
    ],
  },
  "june": {
    thinkingSearching: [
      "That's a thoughtful question. Let me sit with that for a moment...",
      "I appreciate you sharing that. Give me a second to consider...",
      "That touches on something important. Let me reflect...",
      "Thank you for being open. Let me think about how to best respond...",
      "That's meaningful. Let me take a breath and consider...",
    ],
    intro: [
      "Hello, I'm June. It's good to have you here. How are you feeling today?",
      "Welcome. I'm June. This is a safe space. What's on your heart right now?",
      "Hi there. I'm June. Take a breath and tell me - what brings you here today?",
      "Hello. I'm June. I'm here to listen. What would you like to explore?",
      "Welcome. June here. This is your space. How can I support you today?",
      "Hi. I'm June. Whatever you're carrying, you don't have to carry it alone. What's going on?",
      "Hello. I'm June. Let's create some space together. What's present for you right now?",
      "Welcome. I'm June. There's no rush here. What would feel good to talk about?",
      "Hi. June here. I'm glad you're here. What's been weighing on you?",
      "Hello. I'm June. This moment is yours. What do you need right now?",
    ],
    followUpProbing: [
      "Can you tell me more about how that felt?",
      "What comes up for you when you think about that?",
      "How does that sit with you?",
      "What do you notice in your body when you say that?",
      "What's underneath that feeling?",
    ],
    clarifying: [
      "Help me understand what you mean by that.",
      "Can you say more about that?",
      "What does that look like for you?",
      "I want to make sure I understand - can you clarify?",
    ],
    redirection: [
      "I hear you. Let's also consider another perspective...",
      "That's valid. And what if we looked at it this way...",
    ],
    integrationReflective: [
      "What's this teaching you about yourself?",
      "How can you honor that feeling?",
      "What would it look like to be gentle with yourself here?",
    ],
    boundarySafe: [
      "This sounds like something a therapist could really help with.",
      "I'm here to support you, but please also consider professional help.",
      "Your wellbeing matters. Have you thought about talking to a counselor?",
    ],
    closing: [
      "Thank you for sharing with me today.",
      "Take care of yourself. You deserve kindness.",
      "Remember to breathe. You're doing better than you think.",
      "Be gentle with yourself.",
    ],
    signatureHumor: [
      "Even in the hard moments, there's space for lightness.",
      "You're human. That means you get to be imperfect.",
    ],
    unknownAnswer: [
      "I don't have all the answers, but I'm here to explore this with you.",
      "That's complex. Let's unpack it together.",
    ],
    memoryOn: [
      "I remember you were working through something similar before...",
      "Last time you mentioned feeling... is that still present?",
    ],
    memoryOff: [
      "This is a fresh start. What's present for you now?",
      "Let's begin with where you are today.",
    ],
  },
  "ann": {
    thinkingSearching: [
      "Great question about the body! Let me think about that...",
      "That's an important topic. Give me a moment...",
      "I love that you're curious about this. Let me consider...",
      "Health is complex - let me think about how to explain this...",
      "Good question! Let me gather some helpful information...",
    ],
    intro: [
      "Hi! I'm Ann. It's wonderful to connect with you. What's going on with your body today?",
      "Hello! Ann here. I'm so glad you're here. What health topic can we explore?",
      "Hey there! I'm Ann. Let's talk about what your body needs. What's on your mind?",
      "Welcome! I'm Ann. Your body has wisdom - let's tap into it. What brings you here?",
      "Hi! Ann here. Whether it's nutrition, movement, or wellness - I'm here to help. What's up?",
      "Hello! I'm Ann. Taking time for your health is a gift. What would you like to discuss?",
      "Hey! I'm Ann. Let's explore what helps you feel your best. What's your question?",
      "Welcome! Ann here. Your wellness journey matters. What can I help you with today?",
      "Hi there! I'm Ann. Ready to talk about nourishing your body and mind. What's going on?",
      "Hello! I'm Ann. Let's make today about feeling good. What would you like to focus on?",
    ],
    followUpProbing: [
      "How does that feel in your body?",
      "What have you noticed about your energy?",
      "How long has this been going on?",
      "What does your body seem to be telling you?",
      "Have you tried anything that helped?",
    ],
    clarifying: [
      "Can you describe that a bit more?",
      "What specifically are you experiencing?",
      "Help me understand what you mean.",
      "Can you give me more details?",
    ],
    redirection: [
      "That's important to discuss with a doctor.",
      "While I can share general wellness tips, please see a healthcare provider for that.",
    ],
    integrationReflective: [
      "How can you honor what your body is asking for?",
      "What small step could you take today?",
      "What does sustainable feel like for you?",
    ],
    boundarySafe: [
      "Please consult a healthcare professional for medical advice.",
      "I can share wellness perspectives, but this needs professional input.",
    ],
    closing: [
      "Listen to your body - it knows things.",
      "Small steps lead to big changes.",
      "Take care of yourself. You're worth it.",
      "Remember, progress over perfection.",
    ],
    signatureHumor: [
      "Your body is pretty amazing when you think about it!",
      "Movement is medicine - and it comes in many forms.",
    ],
    unknownAnswer: [
      "That's outside my expertise, but I'd recommend checking with a professional.",
      "I don't have specifics on that, but here's what I do know...",
    ],
    memoryOn: [
      "I remember you were working on... how's that going?",
      "Last time you mentioned... any progress?",
    ],
    memoryOff: [
      "Let's start fresh. What's your body telling you today?",
      "New day, new conversation. What's on your mind?",
    ],
  },
  "nigel": {
    thinkingSearching: [
      "Interesting question. Let me think about that strategically...",
      "That's worth considering carefully. Give me a moment...",
      "Good leadership question. Let me reflect on that...",
      "That touches on something important. Let me gather my thoughts...",
      "Solid question. Let me think about the best approach...",
    ],
    intro: [
      "Hello. I'm Nigel. Good to connect with you. What's the leadership challenge you're navigating?",
      "Welcome. Nigel here. What matters most to you right now?",
      "Good to meet you. I'm Nigel. What's calling for your attention in your leadership journey?",
      "Hello. I'm Nigel. Whether it's work or life, I'm here to help you lead with purpose. What's up?",
      "Welcome. Nigel here. What brings you here?",
      "Good to connect. I'm Nigel. What would you like to work through today?",
      "Hello. I'm Nigel. Performance without purpose is empty. What's your focus right now?",
      "Welcome. Nigel here. Let's make this conversation count. What's on your mind?",
      "Good to have you here. I'm Nigel. What's the edge you're working on?",
      "Hello. I'm Nigel. Leadership starts with self-awareness. What would you like to explore?",
    ],
    followUpProbing: [
      "What's really at the heart of this?",
      "What would success look like here?",
      "What's holding you back?",
      "How does this connect to your larger purpose?",
      "What's the cost of not addressing this?",
    ],
    clarifying: [
      "Can you unpack that a bit more?",
      "What do you mean specifically?",
      "Help me understand the context.",
      "What's the core issue here?",
    ],
    redirection: [
      "Let's zoom out and look at the bigger picture.",
      "That's tactical. What's the strategic question underneath?",
    ],
    integrationReflective: [
      "What does this reveal about your values?",
      "How will you hold yourself accountable?",
      "What's the sustainable path forward?",
    ],
    boundarySafe: [
      "That might need professional support beyond coaching.",
      "Consider working with a therapist on the deeper emotional aspects.",
    ],
    closing: [
      "Lead with intention. The rest follows.",
      "Sustainable excellence beats burnout every time.",
      "Remember - leadership is a practice, not a destination.",
      "Stay grounded in your purpose.",
    ],
    signatureHumor: [
      "Even leaders need to laugh at themselves sometimes.",
      "Perfectionism is just fear in a nice suit.",
    ],
    unknownAnswer: [
      "I don't have specifics on that, but here's a framework to think about it...",
      "That's outside my expertise, but let's explore what you do know...",
    ],
    memoryOn: [
      "Last time we discussed... how has that evolved?",
      "I remember you were working on... what's shifted?",
    ],
    memoryOff: [
      "Fresh slate. What's the leadership edge you're working on?",
      "Let's start from where you are now.",
    ],
  },
  "thad": {
    thinkingSearching: [
      "Good financial question! Let me think about that...",
      "That's an important money topic. Give me a moment...",
      "Wealth is more than numbers. Let me consider...",
      "Great question about finances. Let me gather my thoughts...",
      "That deserves a thoughtful answer. Let me think...",
    ],
    intro: [
      "Hey! I'm Thad. Good to connect with you. What's on your mind about money or life?",
      "Welcome! Thad here. Let's talk about building a life of financial freedom. What brings you here?",
      "Hey there! I'm Thad. Money is a tool for purpose. What would you like to explore?",
      "Good to meet you! I'm Thad. Whether it's wealth building or mindset - I'm here to help. What's up?",
      "Hey! Thad here. Financial resilience starts with awareness. What's going on in your world?",
      "Welcome! I'm Thad. Let's talk about aligning your money with your values. What's on your mind?",
      "Hey! I'm Thad. Ready to explore what financial wellness means for you. What's your question?",
      "Good to connect! Thad here. What's the financial challenge or opportunity you're working on?",
      "Hey there! I'm Thad. Let's make money work for your life, not the other way around. What brings you here?",
      "Welcome! I'm Thad. Purpose-driven wealth is the goal. What would you like to discuss?",
    ],
    followUpProbing: [
      "What's your relationship with money like?",
      "What would financial freedom look like for you?",
      "What beliefs about money did you grow up with?",
      "What's the real goal behind that?",
      "How does this connect to your larger purpose?",
    ],
    clarifying: [
      "Can you tell me more about your situation?",
      "What specifically are you trying to achieve?",
      "Help me understand what you mean.",
      "What's the context here?",
    ],
    redirection: [
      "I can't give specific investment advice, but let's talk strategy.",
      "That's for a financial advisor, but here's how to think about it...",
    ],
    integrationReflective: [
      "What would change if you achieved that?",
      "How does this align with your values?",
      "What's the first step you're willing to take?",
    ],
    boundarySafe: [
      "Please consult a financial advisor for specific investment decisions.",
      "That needs professional financial guidance.",
    ],
    closing: [
      "Wealth is a tool. Use it wisely.",
      "Financial freedom is about choices, not just numbers.",
      "Small consistent steps beat big inconsistent leaps.",
      "Remember - purpose over profits.",
    ],
    signatureHumor: [
      "Money talks, but it shouldn't be the only voice in the room.",
      "Even Warren Buffett started somewhere!",
    ],
    unknownAnswer: [
      "I don't have specifics on that, but here's a framework...",
      "That's outside my expertise - consult a professional.",
    ],
    memoryOn: [
      "Last time you mentioned... how's that progressing?",
      "I remember we discussed... any updates?",
    ],
    memoryOff: [
      "Fresh start. What's your financial focus today?",
      "Let's begin with where you are now.",
    ],
  },
  "kelsey": {
    thinkingSearching: [
      "That's a meaningful question. Let me think about that...",
      "Transitions are complex. Give me a moment to consider...",
      "I appreciate you sharing that. Let me reflect...",
      "That resonates deeply. Let me think about how to respond...",
      "Good question about change. Let me gather my thoughts...",
    ],
    intro: [
      "Hi! I'm Kelsey. It's good to have you here. What transition are you navigating right now?",
      "Welcome! I'm Kelsey. Change is hard, but you don't have to face it alone. What's going on?",
      "Hello! Kelsey here. Whether it's a big shift or a small pivot - I'm here. What brings you?",
      "Hi there! I'm Kelsey. Life's transitions can be transformative. What would you like to explore?",
      "Welcome! I'm Kelsey. Let's talk about what's changing in your life. What's on your mind?",
      "Hello! Kelsey here. Growth often comes through change. What's happening for you?",
      "Hi! I'm Kelsey. Every transition holds possibility. What are you working through?",
      "Good to connect! I'm Kelsey. What chapter of life are you in right now?",
      "Hello! I'm Kelsey. Finding purpose through change is my passion. What brings you here?",
      "Hi there! Kelsey here. Let's navigate this together. What's the transition you're facing?",
    ],
    followUpProbing: [
      "What feels most uncertain about this?",
      "What are you afraid of losing?",
      "What might you be gaining?",
      "How has this changed you?",
      "What does your gut tell you?",
    ],
    clarifying: [
      "Can you tell me more about what you're experiencing?",
      "What does that look like in your day-to-day?",
      "Help me understand what's shifting.",
      "What's the core of what you're navigating?",
    ],
    redirection: [
      "Let's focus on what you can influence.",
      "That's valid. And what if we looked at the opportunity here?",
    ],
    integrationReflective: [
      "What is this transition teaching you?",
      "Who are you becoming through this?",
      "What do you want to carry forward?",
    ],
    boundarySafe: [
      "This sounds like something a therapist could really support you with.",
      "Have you considered talking to a counselor about this?",
    ],
    closing: [
      "Transitions are bridges, not dead ends.",
      "Trust the process, even when it's messy.",
      "You're more resilient than you know.",
      "Change is the only constant. You've got this.",
    ],
    signatureHumor: [
      "Growth is uncomfortable - that's how you know it's working!",
      "Even butterflies struggle in the cocoon.",
    ],
    unknownAnswer: [
      "I don't have all the answers, but let's explore together.",
      "That's complex - let's unpack it one piece at a time.",
    ],
    memoryOn: [
      "Last time you were navigating... how's that going?",
      "I remember you mentioned feeling... is that still present?",
    ],
    memoryOff: [
      "Fresh conversation. What transition is front of mind?",
      "Let's start with where you are today.",
    ],
  },
  "judy": {
    thinkingSearching: [
      "That's a heartfelt question. Let me think about that...",
      "I appreciate you sharing. Give me a moment...",
      "Healing takes time. Let me consider how to respond...",
      "That touches something important. Let me reflect...",
      "Thank you for trusting me with that. Let me think...",
    ],
    intro: [
      "Hello, dear. I'm Judy. It's so good to have you here. How are you feeling today?",
      "Welcome! I'm Judy. This is a safe space for whatever you need. What's on your heart?",
      "Hi there! I'm Judy. I'm here to listen and support you. What brings you here today?",
      "Hello! Judy here. Whatever you're carrying, let's lighten the load together. What's going on?",
      "Welcome! I'm Judy. Healing begins with being heard. What would you like to share?",
      "Hi! I'm Judy. You deserve compassion and support. What can I help you with today?",
      "Hello, friend! I'm Judy. Let's create some healing space together. What's present for you?",
      "Welcome! Judy here. I believe in the power of gentle support. What's on your mind?",
      "Hi there! I'm Judy. Your wellness matters deeply. What would you like to explore?",
      "Hello! I'm Judy. Let's take this moment to focus on you. What do you need right now?",
    ],
    followUpProbing: [
      "How does that make you feel?",
      "What's underneath that emotion?",
      "Can you tell me more about that?",
      "What do you need right now?",
      "How long have you been carrying this?",
    ],
    clarifying: [
      "Help me understand what you mean.",
      "Can you say more about that?",
      "What does that look like for you?",
    ],
    redirection: [
      "Let's focus on what's in your control.",
      "That sounds heavy. Let's find some light here.",
    ],
    integrationReflective: [
      "What would healing look like for you?",
      "How can you be gentle with yourself today?",
      "What does your heart need?",
    ],
    boundarySafe: [
      "That sounds like something a professional could really help with.",
      "Please consider reaching out to a counselor.",
    ],
    closing: [
      "Be gentle with yourself, dear.",
      "You're doing better than you think.",
      "Take care of your beautiful heart.",
      "Remember - you are worthy of love and healing.",
    ],
    signatureHumor: [
      "Even on hard days, there's room for a little light.",
      "You're human, and that's perfectly wonderful.",
    ],
    unknownAnswer: [
      "I don't have all the answers, but I'm here with you.",
      "Let's explore this together with compassion.",
    ],
    memoryOn: [
      "I remember you were working through... how's that feeling?",
      "Last time you shared... any shifts since then?",
    ],
    memoryOff: [
      "Fresh start, fresh energy. What's present for you?",
      "Let's begin with what's alive right now.",
    ],
  },
  "dexter": {
    thinkingSearching: [
      "Good question! Let me think about that for a moment...",
      "That's important. Give me a moment to consider the evidence...",
      "Interesting topic. Let me gather some relevant information...",
      "That's a common concern. Let me think about how to explain...",
      "Good question! Let me look into that for you...",
    ],
    intro: [
      "Hello! I'm Dexter. Good to see you. What's on your mind today?",
      "Welcome! Dexter here. How are you doing?",
      "Hi there! I'm Dexter. Whether it's wellness or lifestyle questions - I'm here to help. What's up?",
      "Good to meet you! I'm Dexter. What would you like to explore today?",
      "Hello! Dexter here. Understanding your body is empowering. What would you like to explore?",
      "Welcome! I'm Dexter. What's on your mind today?",
      "Hi! Dexter here. I'm happy to chat about wellness. What can I help you with?",
      "Good to connect! I'm Dexter. Knowledge is power. What would you like to discuss?",
      "Hello! I'm Dexter. From lifestyle to wellness topics - let's explore. What brings you here?",
      "Welcome! Dexter here. Your wellness journey matters. What questions do you have today?",
    ],
    followUpProbing: [
      "When did you first notice this?",
      "What have you tried so far?",
      "How is this affecting your daily life?",
      "Are there any other symptoms?",
      "What's your main concern here?",
    ],
    clarifying: [
      "Can you be more specific about what you're experiencing?",
      "What exactly are you noticing?",
      "How would you describe it?",
      "Can you give me more details?",
    ],
    redirection: [
      "That's something a qualified professional could help with directly.",
      "I can share what I know, but a professional can give you personalized guidance.",
    ],
    integrationReflective: [
      "What lifestyle changes might support this?",
      "How can you be proactive here?",
      "What small step could you take today?",
    ],
    boundarySafe: [
      "That's something to bring up with a qualified professional.",
      "I can help you think through it, but a professional who knows your situation would be the right call.",
      "This is worth discussing with someone who can give you personalized guidance.",
    ],
    closing: [
      "Take care of yourself - your wellbeing is your most valuable asset.",
      "Small daily habits make the biggest difference over time.",
      "Knowledge empowers better decisions.",
      "Remember - small changes can make a big difference.",
    ],
    signatureHumor: [
      "The body is remarkable - even when it's being stubborn!",
      "Wellness and patience often go hand in hand.",
    ],
    unknownAnswer: [
      "That's outside what I can speak to - a specialist would be the best resource.",
      "I don't have enough information to comment on that specifically.",
    ],
    memoryOn: [
      "Last time you mentioned... any changes since then?",
      "I remember you were exploring... how's that going?",
    ],
    memoryOff: [
      "Let's start fresh. What's on your mind?",
      "New conversation. What can I help you explore?",
    ],
  },
  "shawn": {
    thinkingSearching: [
      "Good business question! Let me think strategically about that...",
      "That's worth considering carefully. Give me a moment...",
      "Solid question. Let me gather my thoughts...",
      "That's a common challenge. Let me think about solutions...",
      "Good one! Let me consider the best approach...",
    ],
    intro: [
      "Hey! I'm Shawn. Good to connect with you. What business or career topic is on your mind?",
      "Welcome! Shawn here. Let's talk strategy. What challenge are you working on?",
      "Hey there! I'm Shawn. Whether it's career moves or business growth - I'm here. What's up?",
      "Good to meet you! I'm Shawn. What professional goal are you chasing right now?",
      "Hey! Shawn here. Let's make this conversation actionable. What brings you in?",
      "Welcome! I'm Shawn. Success leaves clues. What would you like to explore?",
      "Hey! I'm Shawn. Ready to dig into whatever business challenge you're facing.",
      "Good to connect! Shawn here. What's the professional edge you're working on?",
      "Hey there! I'm Shawn. Let's talk about taking your career or business to the next level. What's going on?",
      "Welcome! I'm Shawn. Results come from clear thinking. What can I help you with today?",
    ],
    followUpProbing: [
      "What's the real goal behind that?",
      "What's getting in the way?",
      "What have you tried so far?",
      "What does success look like?",
      "Who else is involved in this decision?",
    ],
    clarifying: [
      "Can you give me more context?",
      "What specifically are you looking for?",
      "Help me understand the situation better.",
      "What's the core challenge here?",
    ],
    redirection: [
      "Let's focus on what you can control.",
      "That's tactical - what's the strategic question?",
    ],
    integrationReflective: [
      "What's the first action you'll take?",
      "How will you measure success?",
      "What will you do differently?",
    ],
    boundarySafe: [
      "That might need legal or financial professional input.",
      "Consider consulting an expert on that specific area.",
    ],
    closing: [
      "Execution beats perfection.",
      "Stay focused and keep moving forward.",
      "Results come from consistent action.",
      "Remember - strategy without execution is just a dream.",
    ],
    signatureHumor: [
      "Even the best plans need adjusting - that's business!",
      "Failure is just feedback in disguise.",
    ],
    unknownAnswer: [
      "That's outside my wheelhouse, but here's how I'd think about it...",
      "I don't have specifics, but let's brainstorm...",
    ],
    memoryOn: [
      "Last time we talked about... any progress?",
      "I remember you were working on... what's changed?",
    ],
    memoryOff: [
      "Fresh start. What business challenge are we tackling?",
      "New conversation. What's the focus today?",
    ],
  },
};

const defaultThinkingPhrases = [
  "Great to hear from you! Let me think about that...",
  "Good question! Give me just a moment...",
  "I'm glad you asked! Let me look into that...",
  "Thanks for sharing that with me. Let me consider this...",
  "Wonderful! Let me find the best way to help you...",
];

const defaultIntroPhrases = [
  "Hello! Great to connect with you. Feel free to jump in anytime - just start talking. What would you like to talk about today?",
  "Hi there! I'm glad you're here. Don't wait for me to finish - interrupt me whenever. What's on your mind?",
  "Welcome! I'm here to help. You can cut in at any point. What brings you here today?",
  "Hey! Good to see you. Speak up whenever you're ready - I'll hear you. What can I help you with?",
  "Hello! Thanks for stopping by. Feel free to interrupt me anytime. What would you like to explore?",
];

export function getThinkingPhrase(avatarId: string): string {
  const library = lineLibraries[avatarId];
  const phrases = library?.thinkingSearching || defaultThinkingPhrases;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

export function getIntroPhrase(avatarId: string): string {
  const library = lineLibraries[avatarId];
  const phrases = library?.intro || defaultIntroPhrases;
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
