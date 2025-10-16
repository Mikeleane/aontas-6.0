import { z } from "zod";


// Treat "", null, undefined as “no URL”
const urlOptional = z.preprocess((v) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? undefined : s;
}, z.string().url().optional());/** ---------- Request ---------- */
export const GenerateRequest = z.object({
  sourceText: z.string().optional(),
  sourceUrl: urlOptional,
  targetCefr: z.enum(["A1","A2","B1","B2","C1","C2"]),
  textType: z.enum(["informal_email","formal_email","article","report","story","essay","blog_post"]),
  outputLanguage: z.string(),
  length: z.enum(["short","standard","long"]),
  publicSchoolMode: z.boolean().default(true),
  dyslexiaFriendly: z.boolean().default(true),
}).refine(v => !!(v.sourceText || v.sourceUrl), { message: "Provide sourceText or sourceUrl" });

export type TGenerateRequest = z.infer<typeof GenerateRequest>;

/** ---------- Common ---------- */
export const Answer = z.object({
  answer_id: z.string(),
  answer: z.string()
});

export const Question = z.object({
  id: z.string(),
  type: z.enum(["mcq","tf","tfng","short"]),
  prompt: z.string(),
  // optional direct answer (used for tf/tfng/short or when the model supplies it)
  answer: z.string().optional(),
  answer_id: z.string(),
  options: z.array(z.string()).optional(),
  correct_option: z.number().optional(),
  skill: z.enum(["comp","synonym","antonym","grammar","collocation","reference"]).default("comp"),
});
export type TQuestion = z.infer<typeof Question>;

/** ---------- Goals ---------- */
const Goals = z.object({
  lesson_goals: z.array(z.string()).min(2).max(4),
  success_criteria: z.array(z.string()).min(3).max(6),
  cefr_focus: z.object({
    grammar: z.array(z.string()),
    structures: z.array(z.string()),
    vocabulary: z.array(z.string()),
  }),
});
export type TGoals = z.infer<typeof Goals>;

/** ---------- Teacher Notes ---------- */
const PreteachItem = z.object({
  term: z.string(),
  definition: z.string(),
  note: z.string().optional(),
});

export const TeacherNotes = z.object({
  input_record: z.object({
    source: z.string().default(""),
    target_cefr: z.string().default(""),
    text_type: z.string().default(""),
    output_language: z.string().default(""),
    length: z.string().default(""),
    dyslexia_friendly: z.boolean().default(true),
    public_school_mode: z.boolean().default(true),
  }),
  preteach_vocab: z.array(PreteachItem).min(4).max(12),
  cefr_justification: z.array(z.string()).min(2).max(8),
  extension_activities: z.array(z.string()).min(2).max(2), // exactly 2
});
export type TTeacherNotes = z.infer<typeof TeacherNotes>;

/** ---------- Response ---------- */
export const GenerateResponse = z.object({
  meta: z.object({
    input_language: z.string(),
    output_language: z.string(),
    target_cefr: z.string(),
    text_type: z.string(),
    length: z.string(),
    word_target: z.number(),
  }),
  goals: Goals,
  canonical_facts: z.array(z.object({ id: z.string(), text: z.string() })),
  standard: z.object({
    text: z.string(),
    questions: z.array(Question).length(8),
  }),
  adapted: z.object({
    text: z.string(),
    questions: z.array(Question).length(8),
  }),
  teacher_key: z.array(Answer),
  teacher_notes: TeacherNotes,
});
export type TGenerateResponse = z.infer<typeof GenerateResponse>;

