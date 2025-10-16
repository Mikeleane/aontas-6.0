import "@/polyfills/repeat-safe"
import { NextRequest, NextResponse } from "next/server";
import { GenerateRequest, GenerateResponse, TGenerateRequest } from "@/lib/schema";
import { targetWords } from "@/lib/cefr";
import { STYLE_GUIDE } from "@/lib/styles";
import { LEVEL_RULES } from "@/lib/levels"; const CODE_TO_LABEL: Record<string,string> = { en:"English", es:"Spanish", fr:"French", de:"German", it:"Italian", pt:"Portuguese", nl:"Dutch", sv:"Swedish", pl:"Polish", el:"Greek", cs:"Czech", ga:"Irish (Gaeilge)", la:"Latin (Latina)" };
import OpenAI from "openai";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function fetchAndExtract(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": "Aontas/1.0" } });
  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  const text = (article?.textContent || dom.window.document.body.textContent || "")
    .replace(/\s+/g, " ").trim();
  return text.slice(0, 12000);
}

function countWords(s: string) {
  if (!s) return 0;
  const tokens = s.trim().match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9’']+/g);
  return tokens ? tokens.length : 0;
}

/* ----------------- Prompts ----------------- */
function systemPrompt() {
  return (
`You are an inclusive education writer.

GOAL
Return JSON for two parallel reading packs:
- STANDARD text + 8 questions
- ADAPTED text + 8 questions (simpler stems/options)
Both packs share a single teacher_key via answer_id.

QUESTION BALANCE (in order):
1–5: comprehension ("comp") — detail/why/how/inference.
6: language ("synonym" or "antonym") — meaning in context; MCQ with options + correct_option.
7: language ("grammar") — e.g., lend/borrow; tense/voice; comparative/superlative; MCQ.
8: language ("collocation" or "reference") — preposition/collocation OR pronoun reference; MCQ.

STANDARD RULES
- Use requested CEFR, text type/register, and OUTPUT language.
- Standard text must be within ±10% of WORD_TARGET (caller may revise if not).
- Avoid bare statement stems; make questions or clear tasks.

ADAPTED RULES (non-simplification)
- SAME CEFR, SAME canonical facts, SAME answer_ids.
- Target length: 75–85% of final Standard length.
- Reduce cognitive load only: chunking, short paragraphs, headings, one idea per sentence, bold key info, explicit connectives (First, Then, Because, As a result).
- Keep Standard’s target vocabulary/grammar; add brief in-language glosses: register (= sign up). No code-switching beyond brief glosses.
- Prefer SVO order; replace pronouns with nouns on first mention in a paragraph.
- Dyslexia/ADHD-friendly cues: left-aligned, no full justification, avoid ALL CAPS/italics; bold only for anchors.
- Adapted questions: same mapping; simpler stems; Q6–Q8 have 3 options (not 4).

SCHEMA KEYS:
(meta, goals, canonical_facts, standard{ text, questions[Question] }, adapted{ text, questions[Question] }, teacher_key)
Question: { id, type, prompt, answer_id, options?, correct_option?, skill }`
  ).trim();
}

function userPrompt(params: TGenerateRequest, source: string, wordTarget: number) {
  const style = (STYLE_GUIDE as any)[params.textType] ?? "";
  const outLang = (CODE_TO_LABEL as any)[params.outputLanguage] ?? params.outputLanguage;
  const spec = LEVEL_RULES[params.targetCefr as keyof typeof LEVEL_RULES];

  const levelLines = [
    "CEFR FOCUS FOR " + params.targetCefr + ":",
    "- Allowed grammar: " + spec.grammar.join("; "),
    "- Allowed structures: " + spec.structures.join("; "),
    "- Vocabulary scope: " + spec.vocabulary.join("; "),
    "- ESL targets (Q6–Q8): " + spec.esl_targets.join("; ")
  ];

  // Helpful server-side log
  console.log("[Aontas][lang]", params.outputLanguage, "→", outLang);

  return [
    "INPUT_LANGUAGE: auto-detect",
    "OUTPUT_LANGUAGE_NAME: " + outLang,
    "OUTPUT_LANGUAGE_CODE: " + params.outputLanguage,
    "LANGUAGE LOCK: Write EVERYTHING in " + outLang + " only. No English except proper nouns.",
    "If any part is not in " + outLang + ", rewrite it before returning.",
    "",
    "TARGET_CEFR: " + params.targetCefr,
    "TEXT_TYPE: " + params.textType,
    "STYLE_GUIDE:",
    style,
    "",
    ...levelLines,
    "",
    "LENGTH: " + params.length,
    "WORD_TARGET: " + (params.length === "long"
  ? Math.min(wordTarget, (params.textType === "report" ? 420 : 400))
  : wordTarget) + " (STANDARD must be within ±10%)",
    "PUBLIC_SCHOOL_MODE: " + (params.publicSchoolMode ? "on" : "off"),
    "DYSLEXIA_FRIENDLY: " + (params.dyslexiaFriendly ? "on" : "off"),
    "",
    "Return JSON with: meta, goals, canonical_facts, standard {text, questions[8]}, adapted {text, questions[8]}, teacher_key.",
    "All human-readable text must be in " + outLang + ".",
    "",
    "SOURCE_TEXT:",
    source
  ].join("\\n");
}

/* ----------------- Sanitizer helpers ----------------- */
const ALLOWED_TYPES = new Set(["mcq","tf","tfng","short"]);
const ALLOWED_SKILLS = new Set(["comp","synonym","antonym","grammar","collocation","reference"]);

function asArray<T=any>(val:any): T[] {
  if (Array.isArray(val)) return val as T[];
  if (val && typeof val === "object") return Object.values(val) as T[];
  if (typeof val === "string") {
    try { const j = JSON.parse(val); if (Array.isArray(j)) return j as T[]; } catch {}
    const lines = val.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    if (lines.length) return lines as any;
  }
  return [];
}
function asString(v:any){ return (v===null||v===undefined) ? "" : String(v); }

function normalizeSkill(s:any): "comp"|"synonym"|"antonym"|"grammar"|"collocation"|"reference" {
  const t = asString(s).toLowerCase();
  if (ALLOWED_SKILLS.has(t as any)) return t as any;
  if (t.includes("syn")) return "synonym";
  if (t.includes("ant")) return "antonym";
  if (t.includes("gram") || t.includes("usage") || t.includes("language")) return "grammar";
  if (t.includes("colloc") || t.includes("prep")) return "collocation";
  if (t.includes("refer") || t.includes("pronoun")) return "reference";
  return "comp";
}

function guessType(t:any, options:any[], prompt:string): "mcq"|"tf"|"tfng"|"short" {
  const s = asString(t).toLowerCase();
  if (ALLOWED_TYPES.has(s as any)) return s as any;
  const joined = (options||[]).map(asString).join(" ").toLowerCase();
  if (joined.includes("not given")) return "tfng";
  if ((options||[]).length>=2 && (joined.includes("true")||joined.includes("false"))) return "tf";
  if ((options||[]).length>=2) return "mcq";
  return prompt.trim().endsWith("?") ? "short" : "short";
}
function splitOptions(opt:any): string[] {
  if (!opt) return [];
  if (Array.isArray(opt)) return opt.map(asString).filter(Boolean);
  return asString(opt).split(/\r?\n|;|\||,|\t/).map(x=>x.trim()).filter(Boolean);
}
function bestOptionIndex(options:string[], answer:string): number {
  if (!options.length) return 0;
  const a = answer.toLowerCase();
  let best = 0, bestScore = -1;
  options.forEach((o,i)=>{
    const oLow = o.toLowerCase();
    let score = 0;
    if (oLow === a) score = 3;
    else if (oLow.includes(a) || a.includes(oLow)) score = 2;
    else {
      const at = new Set(a.split(/\W+/).filter(Boolean));
      const ot = new Set(oLow.split(/\W+/).filter(Boolean));
      const inter = [...ot].filter(x=>at.has(x)).length;
      score = inter;
    }
    if (score>bestScore){ bestScore=score; best=i; }
  });
  return best;
}
function buildFacts(raw:any): {id:string,text:string}[] {
  const arr = asArray<any>(raw);
  if (arr.length && typeof arr[0]==="object" && "text" in arr[0]) {
    return arr.map((f:any,idx:number)=>({ id: f.id ? asString(f.id) : `F${idx+1}`, text: asString(f.text)}));
  }
  return arr.map((s:any,idx:number)=>({ id:`F${idx+1}`, text: asString(s)}));
}
function sanitizeTeacherKey(raw:any, facts:{id:string,text:string}[]) {
  const arr = asArray<any>(raw);
  if (arr.length && typeof arr[0]==="object" && "answer_id" in arr[0]) {
    return arr.map((a:any)=>({ answer_id: asString(a.answer_id), answer: asString(a.answer) }));
  }
  const out:{answer_id:string,answer:string}[] = [];
  if (Array.isArray(arr)) {
    arr.forEach((line:any)=>{
      const s = asString(line);
      const m = s.match(/^(F\d+)\s*[:\-]\s*(.+)$/i);
      if (m) out.push({ answer_id: m[1].toUpperCase(), answer: m[2].trim() });
    });
  }
  if (!out.length) return facts.map(f=>({ answer_id: f.id, answer: f.text }));
  return out;
}
function indexKey(key:{answer_id:string,answer:string}[]) {
  const map:Record<string,string> = {};
  key.forEach(k=>{ map[k.answer_id]=k.answer; });
  return map;
}

function sanitizePackQuestions(pack:any, prefix:"S"|"A", facts:{id:string,text:string}[], tIndex:{[k:string]:string}) {
  let qs = asArray<any>(pack?.questions);
  qs = qs.map((q:any, i:number)=>{
    const id = q?.id ? asString(q.id) : `${prefix}${i+1}`;
    const prompt = asString(q?.prompt || q?.question || "");
    let options = splitOptions(q?.options);
    const type = guessType(q?.type, options, prompt);
    // Adapted: trim to 3 options to reduce load
    if (prefix === "A" && options.length > 3) options = options.slice(0,3);
    let answer_id = asString(q?.answer_id);
    if (!answer_id) answer_id = facts[i % Math.max(1,facts.length)]?.id || "F1";
    let correct_option = q?.correct_option;
    if (typeof correct_option !== "number" && options.length) {
      const answerText = tIndex[answer_id] || facts.find(f=>f.id===answer_id)?.text || "";
      correct_option = bestOptionIndex(options, answerText);
    }
    const skill = normalizeSkill(q?.skill);
    return { id, type, prompt, answer_id, options: options.length? options: undefined, correct_option: (typeof correct_option==="number" ? correct_option : (options.length? 0 : undefined)), skill };
  });
  if (qs.length > 8) qs = qs.slice(0,8);
  if (qs.length < 8) {
    for (let i=qs.length; i<8; i++){
      const f = facts[i % Math.max(1,facts.length)] || {id:"F1",text:"the main idea"};
      qs.push({
        id: `${prefix}${i+1}`,
        type: "short",
        prompt: "What is a key idea mentioned in the text?",
        answer_id: f.id,
        skill: "comp"
      });
    }
  }
  return qs;
}

/* ----------------- Goals builder ----------------- */
function intersect(src:string[], allowed:string[]){ 
  if (!allowed?.length) return src;
  const A = new Set(allowed.map(s=>s.toLowerCase()));
  return src.filter(s=>A.has(s.toLowerCase()));
}
function arr(x:any){ return (Array.isArray(x)? x : (x? [String(x)] : [])).map((s:any)=>String(s)).filter(Boolean); }

function buildGoals(parsed:TGenerateRequest, modelGoals:any){
  const spec = LEVEL_RULES[parsed.targetCefr as keyof typeof LEVEL_RULES];
  const g = modelGoals || {};
  const lesson_goals = arr(g.lesson_goals).slice(0,4);
  const success_criteria = arr(g.success_criteria).slice(0,6);
  let grammar = intersect(arr(g?.cefr_focus?.grammar), spec.grammar);
  let structures = intersect(arr(g?.cefr_focus?.structures), spec.structures);
  let vocabulary = intersect(arr(g?.cefr_focus?.vocabulary), spec.vocabulary);

  if (!grammar.length) grammar = spec.grammar.slice(0,4);
  if (!structures.length) structures = spec.structures.slice(0,3);
  if (!vocabulary.length) vocabulary = spec.vocabulary.slice(0,3);
  const lg = lesson_goals.length ? lesson_goals : ["Understand the main ideas and key details","Use the target language accurately in context"];
  const sc = success_criteria.length ? success_criteria : ["I can find specific information","I can choose the correct synonym in context","I can use the target structure in a new sentence"];

  return {
    lesson_goals: lg,
    success_criteria: sc,
    cefr_focus: { grammar, structures, vocabulary }
  };
}

/* ----------------- Model -> Server object ----------------- */
function sanitizeModelJson_legacy1(modelJson:any, parsed:TGenerateRequest, wordTarget:number) {
  const facts = buildFacts(modelJson?.canonical_facts);
  const teacher_key = sanitizeTeacherKey(modelJson?.teacher_key, facts);
  const tIndex = indexKey(teacher_key);
  const standardQs = sanitizePackQuestions(modelJson?.standard, "S", facts, tIndex);
  const adaptedQs  = sanitizePackQuestions(modelJson?.adapted,  "A", facts, tIndex);

  const known = new Set(teacher_key.map((k:any)=>String(k.answer_id)));
[...standardQs, ...adaptedQs].forEach((q:any) => {
  const qid = String(q?.answer_id || "");
  if (!qid) return;
  if (!known.has(qid)) {
    let text = "";
    if (typeof q?.answer === "string" && q.answer.trim()) {
      text = q.answer.trim();
    } else if (Array.isArray(q?.options)
      && typeof q?.correct_option === "number"
      && q.correct_option >= 0
      && q.correct_option < q.options.length) {
      text = String(q.options[q.correct_option]);
    } else {
      const f = facts.find((f:any) => String(f.id) === qid);
      if (f?.text) text = String(f.text);
    }
    teacher_key.push({ answer_id: qid, answer: text || "—" });
    known.add(qid);
  }
});const goals = buildGoals(parsed, modelJson?.goals);

  return {
    meta: {
      input_language: "auto",
      output_language: parsed.outputLanguage,
      target_cefr: parsed.targetCefr,
      text_type: parsed.textType,
      length: parsed.length,
      word_target: wordTarget
    },
    goals,
    canonical_facts: facts,
    standard: { text: asString(modelJson?.standard?.text || modelJson?.standardText || ""), questions: standardQs },
    adapted:  { text: asString(modelJson?.adapted?.text  || modelJson?.adaptedText  || ""),  questions: adaptedQs  },
    teacher_key
  };
}

/* ----------------- Length enforcers ----------------- */
async function reviseToRange(text: string, min: number, max: number, lang: string, textType: string, cefr: string, label: string) {
  async function pass(curr: string, hint: string) {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content:
`You are a precise editor.
Keep all facts. Keep the same language (${lang}), text type (${textType}), and CEFR (${cefr}).
Target word range: [${min}, ${max}] words.
Perform only compression/expansion phrasing; do not add or remove facts.
Return JSON: {"text":"..."}` },
        { role: "user", content: label + " TEXT:\n" + curr + "\n\n" + hint }
      ]
    });
    const raw = completion.choices[0]?.message?.content || "{}";
    try { return (JSON.parse(raw) as { text?: string }).text ?? curr; } catch { return curr; }
  }
  let out = text;
  for (let i=0;i<3;i++){
    const wc = countWords(out);
    if (wc>=min && wc<=max) return out;
    const delta = wc<min ? (min-wc) : (wc-max);
    const hint = wc<min ? `Expand by about ${delta} words.` : `Tighten by about ${delta} words.`;
    out = await pass(out, hint);
  }
  return out;
}

/* ----------------- Handler ----------------- */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = GenerateRequest.parse(body);

    let source = (parsed.sourceText || "").trim();
    if (!source && parsed.sourceUrl) source = await fetchAndExtract(parsed.sourceUrl);
    if (!source) throw new Error("No usable source text. The site may block extraction. Try pasting the text, or use an AMP link (…/amp or ?amp=1).");

    console.log("[Aontas][req]", { targetCefr: parsed.targetCefr, textType: parsed.textType, length: parsed.length });
    const wordTarget = targetWords(parsed.targetCefr, parsed.length, parsed.textType);
    console.log("[Aontas][target]", wordTarget);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user",   content: userPrompt(parsed, source, wordTarget) }
      ]
    });
    const raw = completion.choices[0]?.message?.content || "{}";
    const modelJson = JSON.parse(raw);

    let merged = sanitizeModelJson(modelJson, parsed, wordTarget);
    let validated = GenerateResponse.parse(merged);

    // Enforce Standard ±10%
    const stdMin = Math.round(wordTarget*0.9);
    const stdMax = Math.round(wordTarget*1.1);
    const wcStd = countWords(validated.standard.text);
    let stdFixed = false;
    if (wcStd < stdMin || wcStd > stdMax) {
      const patched = await reviseToRange(validated.standard.text, stdMin, stdMax, validated.meta.output_language, validated.meta.text_type, validated.meta.target_cefr, "STANDARD");
      validated = GenerateResponse.parse({ ...validated, standard: { ...validated.standard, text: patched } });
      stdFixed = true;
    }
    const finalStdWc = countWords(validated.standard.text);

    // Enforce Adapted 75–85% of Standard
    const adaptMin = Math.max(50, Math.round(finalStdWc * 0.75));
    const adaptMax = Math.round(finalStdWc * 0.85);
    const wcAdapt = countWords(validated.adapted.text);
    let adaptFixed = false;
    if (wcAdapt < adaptMin || wcAdapt > adaptMax) {
      const patchedA = await reviseToRange(validated.adapted.text, adaptMin, adaptMax, validated.meta.output_language, validated.meta.text_type, validated.meta.target_cefr, "ADAPTED");
      validated = GenerateResponse.parse({ ...validated, adapted: { ...validated.adapted, text: patchedA } });
      adaptFixed = true;
    }
    const finalAdaptWc = countWords(validated.adapted.text);

    console.log("[Aontas] std:", {target: wordTarget, fixed: stdFixed, final_wc: finalStdWc}, "adapt:", {min: adaptMin, max: adaptMax, fixed: adaptFixed, final_wc: finalAdaptWc});
return NextResponse.json(validated);
  } catch (err:any) {
    console.error("[Aontas][400]", err?.message, err?.issues ?? "");
return NextResponse.json({ error: err?.message ?? "Bad request", issues: err?.issues ?? null }, { status: 400 });
  }
}








function arrify(val:any){
  if (Array.isArray(val)) return val;
  if (val && typeof val === "object") return Object.values(val);
  if (typeof val === "string"){
    try { const j = JSON.parse(val); if (Array.isArray(j)) return j; } catch {}
    const lines = val.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    if (lines.length) return lines as any;
  }
  return [];
}

function buildTeacherNotes(
  parsed: TGenerateRequest,
  modelNotes:any,
  outputLabel:string,
  standardText:string,
  cefrFocus:{grammar:string[];structures:string[];vocabulary:string[]}
){
  const focus = (cefrFocus && typeof cefrFocus === "object") ? cefrFocus : { grammar:[], structures:[], vocabulary:[] };
  const inRec = {
    source: parsed.sourceText ? "pasted text" : (parsed.sourceUrl || "unknown"),
    target_cefr: parsed.targetCefr,
    text_type: parsed.textType,
    output_language: outputLabel,
    length: parsed.length,
    dyslexia_friendly: parsed.dyslexiaFriendly,
    public_school_mode: parsed.publicSchoolMode
  };

  const m = modelNotes || {};

  // preteach vocab → normalize to {term,definition,note?}
  let preteach = arrify(m.preteach_vocab).map((x:any)=>({
    term: String(x?.term ?? x?.word ?? x?.term_text ?? "").trim(),
    definition: String(x?.definition ?? x?.gloss ?? x?.meaning ?? "").trim(),
    note: x?.note ? String(x.note) : undefined
  })).filter((x:any)=>x.term && x.definition);

  if (!preteach.length){
    const seeds = ([] as string[])
      .concat(focus.vocabulary || [])
      .concat(focus.grammar || [])
      .slice(0, 8);
    preteach = seeds.map(s=>({ term: s, definition: "Key term to pre-teach in the target language.", note: undefined }));
  }

  let cefrJust = arrify(m.cefr_justification).map(String).filter(Boolean);
  if (!cefrJust.length){
    cefrJust = [
      `Aligns with grammar focus: ${(focus.grammar||[]).slice(0,3).join(", ")}`,
      `Uses structures: ${(focus.structures||[]).slice(0,2).join(", ")}`,
      `Vocabulary scope appropriate to level: ${(focus.vocabulary||[]).slice(0,3).join(", ")}`
    ].filter(Boolean);
  }

  let ext = arrify(m.extension_activities).map(String).filter(Boolean);
  if (ext.length < 2){
    ext = [
      "Pair task: upgrade two sentences from the text using the target structure; peer-check for accuracy.",
      "Short writing (90–120 words) reusing 6+ target items (highlight them); swap and give one improvement each."
    ];
  } else if (ext.length > 2){
    ext = ext.slice(0,2);
  }

  if (preteach.length < 4) { try { const fb = (LEVEL_RULES as any)[parsed.targetCefr] || {vocabulary:[],grammar:[]}; const extras = ([] as string[]).concat((focus?.vocabulary||[]),(focus?.grammar||[]),(fb.vocabulary||[]),(fb.grammar||[])).filter(Boolean).slice(0, Math.max(0, 8 - preteach.length)); preteach = preteach.concat(extras.map((s:string)=>({ term:String(s), definition:"Key term to pre-teach in the target language." }))); } catch {} }
  return {
    input_record: inRec,
    preteach_vocab: preteach.slice(0, 12),
    cefr_justification: cefrJust,
    extension_activities: ext
  };
}

function sanitizeModelJson(modelJson:any, parsed:TGenerateRequest, wordTarget:number){
  const facts = buildFacts(modelJson?.canonical_facts);
  const teacher_key = sanitizeTeacherKey(modelJson?.teacher_key, facts);
  const tIndex = indexKey(teacher_key);
  const standardQs = sanitizePackQuestions(modelJson?.standard, "S", facts, tIndex);
  const adaptedQs  = sanitizePackQuestions(modelJson?.adapted,  "A", facts, tIndex);

  const spec = LEVEL_RULES[parsed.targetCefr as keyof typeof LEVEL_RULES];
  const outputLabel = (CODE_TO_LABEL as any)[parsed.outputLanguage] ?? parsed.outputLanguage;

  const goals = coerceGoals(modelJson?.goals, spec);return {
    meta: {
      input_language: "auto",
      output_language: parsed.outputLanguage,
      target_cefr: parsed.targetCefr,
      text_type: parsed.textType,
      length: parsed.length,
      word_target: wordTarget
    },
    goals,
    canonical_facts: facts,
    standard: { text: asString(modelJson?.standard?.text || modelJson?.standardText || ""), questions: standardQs },
    adapted:  { text: asString(modelJson?.adapted?.text  || modelJson?.adaptedText  || ""),  questions: adaptedQs  },
    teacher_key,
    teacher_notes: buildTeacherNotes(parsed, modelJson?.teacher_notes, outputLabel, asString(modelJson?.standard?.text || ""), (goals && goals.cefr_focus ? goals.cefr_focus : { grammar:[], structures:[], vocabulary:[] }))
  };
}





/** Coerce loose model goals (array or partial object) into strict Goals shape. */
function coerceGoals(inGoals:any, spec:any){
  const arr = (x:any)=> (Array.isArray(x)? x : (x? [String(x)] : []))
    .map((s:any)=>String(s)).filter(Boolean);
  function intersect(src:string[], allowed:string[]){
    if (!Array.isArray(allowed) || !allowed.length) return src;
    const A = new Set(allowed.map(s=>String(s).toLowerCase()));
    return src.filter(s=>A.has(String(s).toLowerCase()));
  }

  // If model sent an array, treat it as lesson_goals bullets.
  const lesson_goals =
    Array.isArray(inGoals?.lesson_goals) ? arr(inGoals.lesson_goals).slice(0,4) :
    Array.isArray(inGoals)               ? arr(inGoals).slice(0,4) :
    ["Understand the main ideas and key details","Use target language accurately in context"];

  const success_criteria =
    Array.isArray(inGoals?.success_criteria) ? arr(inGoals.success_criteria).slice(0,6) :
    ["I can find specific information","I can choose the correct synonym in context","I can use the target structure in a new sentence"];

  const focusIn = (inGoals && inGoals.cefr_focus) ? inGoals.cefr_focus : {};
  let grammar    = arr(focusIn.grammar);
  let structures = arr(focusIn.structures);
  let vocabulary = arr(focusIn.vocabulary);

  if (!grammar.length)    grammar    = (spec?.grammar    || []).slice(0,4);
  if (!structures.length) structures = (spec?.structures || []).slice(0,3);
  if (!vocabulary.length) vocabulary = (spec?.vocabulary || []).slice(0,3);

  // Enforce allow-list
  grammar    = intersect(grammar,    spec?.grammar    || grammar);
  structures = intersect(structures, spec?.structures || structures);
  vocabulary = intersect(vocabulary, spec?.vocabulary || vocabulary);

  return {
    lesson_goals,
    success_criteria,
    cefr_focus: { grammar, structures, vocabulary }
  };
}






