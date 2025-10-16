export type Level = "A1"|"A2"|"B1"|"B2"|"C1"|"C2";
export type LengthChoice = "short" | "standard" | "long";
export type TextType =
  | "informal_email"
  | "formal_email"
  | "article"
  | "report"
  | "story"
  | "essay"
  | "blog_post";

/** Classroom reading-passage targets (not exam writing limits). */
export const CEFR_WORD_TARGET: Record<Level, [number, number]> = {
  A1: [120, 180],
  A2: [160, 220],
  B1: [220, 300],
  B2: [280, 380],
  C1: [350, 450],
  C2: [420, 550],
};

const TEXT_TYPE_MULTIPLIER: Record<TextType, number> = {
  informal_email: 0.80,
  formal_email:   0.85,
  article:        1.00,
  report:         1.10,
  story:          1.05,
  essay:          1.15,
  blog_post:      1.00,
};

function lengthMult(length: LengthChoice) {
  return length === "short" ? 0.85 : length === "long" ? 1.25 : 1.0;
}

export function targetWords(level: Level, length: LengthChoice, textType: TextType) {
  const [lo, hi] = CEFR_WORD_TARGET[level];
  const avg = (lo + hi) / 2;
  return Math.round(avg * lengthMult(length) * (TEXT_TYPE_MULTIPLIER[textType] ?? 1));
}
