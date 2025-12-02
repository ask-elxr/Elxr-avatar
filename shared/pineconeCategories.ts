export const PINECONE_CATEGORIES = [
  "ADDICTION",
  "MIND",
  "BODY",
  "SEXUALITY",
  "TRANSITIONS",
  "SPIRITUALITY",
  "SCIENCE",
  "PSYCHEDELICS",
  "NUTRITION",
  "LIFE",
  "LONGEVITY",
  "GRIEF",
  "MIDLIFE",
  "MOVEMENT",
  "WORK",
  "SLEEP",
  "MARK_KOHL",
  "OTHER"
] as const;

export type PineconeCategory = typeof PINECONE_CATEGORIES[number];

export const CATEGORY_DESCRIPTIONS: Record<PineconeCategory, string> = {
  ADDICTION: "Addiction, recovery, and substance-related topics",
  MIND: "Mental health, psychology, and cognitive wellness",
  BODY: "Physical health, anatomy, and body wellness",
  SEXUALITY: "Sexual health, intimacy, and relationships",
  TRANSITIONS: "Life transitions, change, and adaptation",
  SPIRITUALITY: "Spiritual practices, consciousness, and meaning",
  SCIENCE: "Scientific research, studies, and evidence-based knowledge",
  PSYCHEDELICS: "Psychedelic compounds, research, and therapeutic use",
  NUTRITION: "Diet, nutrition, and food-related wellness",
  LIFE: "General life guidance, purpose, and fulfillment",
  LONGEVITY: "Aging, lifespan, and healthspan optimization",
  GRIEF: "Loss, bereavement, and emotional processing",
  MIDLIFE: "Midlife transitions, challenges, and opportunities",
  MOVEMENT: "Exercise, fitness, and physical movement",
  WORK: "Career, professional development, and work-life balance",
  SLEEP: "Sleep health, optimization, and rest",
  MARK_KOHL: "Mark Kohl's personal knowledge, experiences, and expertise",
  OTHER: "Miscellaneous topics not fitting other categories"
};
