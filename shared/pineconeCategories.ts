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
  "WILLIE_GAULT",
  "NIGEL_WILLIAMS",
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
  WILLIE_GAULT: "Willie Gault's athletic expertise, wellness, and personal insights",
  NIGEL_WILLIAMS: "Nigel Williams's expertise and knowledge",
  OTHER: "Miscellaneous topics not fitting other categories"
};

export const GOOGLE_DRIVE_SOURCE_FOLDER_ID = "0AL_h7e92I2C8Uk9PVA";

export const FOLDER_TO_NAMESPACE_MAP: Record<string, PineconeCategory> = {
  "Addiction": "ADDICTION",
  "Body": "BODY",
  "Career": "WORK",
  "Evolve": "TRANSITIONS",
  "grief": "GRIEF",
  "life": "LIFE",
  "longevity": "LONGEVITY",
  "Mark Kohl Brain": "MARK_KOHL",
  "Mark Kohl Brain ": "MARK_KOHL",
  "Mind": "MIND",
  "movement": "MOVEMENT",
  "Nigel Williams": "NIGEL_WILLIAMS",
  "Nutrition": "NUTRITION",
  "On commune": "OTHER",
  "other": "OTHER",
  "science": "SCIENCE",
  "Sexuality": "SEXUALITY",
  "Sleep": "SLEEP",
  "Sleep N8N": "SLEEP",
  "Spirituality": "SPIRITUALITY",
  "Transitions": "TRANSITIONS",
  "Willie Gault": "WILLIE_GAULT"
};

export function getFolderNamespace(folderName: string): PineconeCategory {
  const trimmedName = folderName.trim();
  
  // Try exact match first
  if (FOLDER_TO_NAMESPACE_MAP[trimmedName]) {
    return FOLDER_TO_NAMESPACE_MAP[trimmedName];
  }
  
  // Try case-insensitive match
  const lowerName = trimmedName.toLowerCase();
  for (const [key, value] of Object.entries(FOLDER_TO_NAMESPACE_MAP)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }
  
  return "OTHER";
}
