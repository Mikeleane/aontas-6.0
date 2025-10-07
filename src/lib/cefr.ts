export const CEFR_WORD_TARGET: Record<string, [number, number]> = {
  A1: [60, 90],
  A2: [90, 120],
  B1: [140, 180],
  B2: [160, 200],
  C1: [220, 260],
  C2: [280, 320],
};

export type LengthChoice = "short" | "standard" | "long";

export function targetWords(
  level: keyof typeof CEFR_WORD_TARGET,
  length: LengthChoice
) {
  const avg = (CEFR_WORD_TARGET[level][0] + CEFR_WORD_TARGET[level][1]) / 2;
  const mult = length === "short" ? 0.7 : length === "long" ? 1.3 : 1.0;
  return Math.round(avg * mult);
}
