import { z } from "zod";

export const GenerateRequest = z.object({
  sourceText: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  targetCefr: z.enum(["A1","A2","B1","B2","C1","C2"]),
  textType: z.enum(["informal_email","formal_email","article","report","story","essay","blog_post"]),
  outputLanguage: z.string(), // e.g. en, es, fr, de, it, pt...
  length: z.enum(["short","standard","long"]),
  publicSchoolMode: z.boolean().default(true),
  dyslexiaFriendly: z.boolean().default(true)
}).refine(v => v.sourceText || v.sourceUrl, { message: "Provide sourceText or sourceUrl" });

export type TGenerateRequest = z.infer<typeof GenerateRequest>;

export const Answer = z.object({ answer_id: z.string(), answer: z.string() });
export const Question = z.object({
  id: z.string(),
  type: z.string(),
  prompt: z.string(),
  answer_id: z.string()
});

export const GenerateResponse = z.object({
  meta: z.object({
    input_language: z.string(),
    output_language: z.string(),
    target_cefr: z.string(),
    text_type: z.string(),
    length: z.string(),
    word_target: z.number()
  }),
  canonical_facts: z.array(z.object({ id: z.string(), text: z.string() })),
  standard: z.object({
    text: z.string(),
    questions: z.array(Question).length(8)
  }),
  adapted: z.object({
    text: z.string(),
    questions: z.array(Question).length(8)
  }),
  teacher_key: z.array(Answer)
});
export type TGenerateResponse = z.infer<typeof GenerateResponse>;
