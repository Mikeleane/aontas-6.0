import { NextRequest, NextResponse } from "next/server";
import { GenerateRequest, GenerateResponse, TGenerateRequest } from "@/lib/schema";
import { targetWords } from "@/lib/cefr";
import { STYLE_GUIDE } from "@/lib/styles";
import { LEVEL_RULES } from "@/lib/levels";
import OpenAI from "openai";
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

let __openai:any;
function getOpenAI(){ if (!__openai) { __openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" }); } return __openai; }

/* ---------------- utilities ---------------- */
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
  const tokens = s.trim().match(/[A-Za-zÃƒÆ\u2019Ã¢â€šÂ¬-ÃƒÆ\u2019Ã¢â‚¬â€œÃƒÆ\u2019Ã‹Å“-ÃƒÆ\u2019Ã‚Â¶ÃƒÆ\u2019Ã‚Â¸-ÃƒÆ\u2019Ã‚Â¿0-9ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢']+/g);
  return tokens ? tokens.length : 0;
}
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
function answerFromQuestion(q:any, facts:any[]=[]): string {
  const id = (q?.answer_id ?? "").toString().trim();
  if (q?.type === "mcq" && Array.isArray(q?.options)) {
    const idx = typeof q?.correct_option === "number" ? q.correct_option : -1;
    if (idx >= 0 && idx < q.options.length) return String(q.options[idx]).trim();
  }
  if (typeof q?.answer === "string" && q.answer.trim()) return q.answer.trim();
  if (id) {
    const f = facts.find((x:any) => String(x.id).toLowerCase() === id.toLowerCase());
    if (f?.text) return String(f.text).trim();
  }
  return "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â";
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
function normaliseQuestions(raw:any, facts:any[]){
  const arr = Array.isArray(raw) ? raw : [];
  const out = arr.slice(0,8).map((q:any,i:number)=>({
    id: q?.id ?? ("q"+(i+1)),
    prompt: asString(q?.prompt || q?.question || "").trim(),
    type: q?.type || "short",
    options: Array.isArray(q?.options) ? q.options : undefined,
    correct_option: (typeof q?.correct_option === "number" ? q.correct_option : undefined),
    answer_id: asString(q?.answer_id || "").trim(),
    answer: answerFromQuestion(q, facts),
    skill: q?.skill
  }));
  while (out.length < 8) out.push({ id: "q"+(out.length+1), prompt: "", type: "short", answer: "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â" } as any);
  return out;
}
function alignAdaptedToStandard(stdQs:any[], adpQs:any[]){
  const a = Array.isArray(adpQs)? adpQs : [];
  return a.map((q:any,i:number)=>{
    const s = stdQs[i] || {};
    return {
      ...q,
      answer_id: q?.answer_id || s?.answer_id || "",
      answer: (q?.answer && String(q.answer).trim()) ? String(q.answer).trim() : (s?.answer || "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â"),
    };
  });
}
function sanitizePackQuestions(pack:any, prefix:"S"|"A", facts:{id:string,text:string}[], tIndex:{[k:string]:string}) {
  let qs = asArray<any>(pack?.questions);
  qs = qs.map((q:any, i:number)=>{
    const id = q?.id ? asString(q.id) : `${prefix}${i+1}`;
    const prompt = asString(q?.prompt || q?.question || "");
    let options = splitOptions(q?.options);
    const type = (()=>{
      const s = asString(q?.type).toLowerCase();
      if (ALLOWED_TYPES.has(s as any)) return s as any;
      if ((options||[]).length>=2) return "mcq";
      return prompt.trim().endsWith("?") ? "short" : "short";
    })();
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
  while (qs.length < 8) {
    const f = facts[qs.length % Math.max(1,facts.length)] || {id:"F1",text:"the main idea"};
    qs.push({ id: `${prefix}${qs.length+1}`, type: "short", prompt: "What is a key idea mentioned in the text?", answer_id: f.id, skill: "comp" } as any);
  }
  return qs;
}
function fillTeacherKeyFromQuestions(teacher_key:any[], packs:any[], facts:any[]){
  const known = new Set(teacher_key.map((k:any)=>String(k.answer_id)));
  for (const p of packs) {
    const qs = Array.isArray(p?.questions)? p.questions : [];
    for (const q of qs) {
      const id = String(q?.answer_id || "");
      if (!id || known.has(id)) continue;
      const text = answerFromQuestion(q, facts);
      teacher_key.push({ answer_id: id, answer: text || "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â" });
      known.add(id);
    }
  }
  return teacher_key;
}
function coerceGoals(inGoals:any, spec:any){
  const arr = (x:any)=> (Array.isArray(x)? x : (x? [String(x)] : [])).map((s:any)=>String(s)).filter(Boolean);
  function intersect(src:string[], allowed:string[]){
    if (!Array.isArray(allowed) || !allowed.length) return src;
    const A = new Set(allowed.map(s=>String(s).toLowerCase()));
    return src.filter(s=>A.has(String(s).toLowerCase()));
  }
  const lesson_goals =
    Array.isArray(inGoals?.lesson_goals) ? arr(inGoals.lesson_goals).slice(0,4) :
    Array.isArray(inGoals)               ? arr(inGoals).slice(0,4) :
    ["Understand the main ideas and key details","Use target language accurately in context"];
  const success_criteria =
    Array.isArray(inGoals?.success_criteria) ? arr(inGoals.success_criteria).slice(0,6) :
    ["I can find specific information","I can choose the correct synonym in context","I can use the target structure in a new sentence"];
  const focusIn = (inGoals && inGoals.cefr_focus) ? inGoals.cefr_focus : {};
  let grammar    = arr(focusIn?.grammar);
  let structures = arr(focusIn?.structures);
  let vocabulary = arr(focusIn?.vocabulary);
  if (!grammar.length)    grammar    = (spec?.grammar    || []).slice(0,4);
  if (!structures.length) structures = (spec?.structures || []).slice(0,3);
  if (!vocabulary.length) vocabulary = (spec?.vocabulary || []).slice(0,3);
  grammar    = intersect(grammar,    spec?.grammar    || grammar);
  structures = intersect(structures, spec?.structures || structures);
  vocabulary = intersect(vocabulary, spec?.vocabulary || vocabulary);
  return { lesson_goals, success_criteria, cefr_focus: { grammar, structures, vocabulary } };
}
/** Extract preteach candidates from Standard text. */
function extractPreteachFromText(text:string){
  text = (text || "").replace(/[\u2010-\u2015]/g,"-");
  const lower = text.toLowerCase();
  const stop = new Set(("the a an and but or so nor for of to in on at by from into over about as is are was were be been being this that these those it its their his her our your i you he she we they them who whom which what when where why how with without than then also just very really more most much many few any some each every other another can could should would may might do does did done not no yes one two three four five six seven eight nine ten").split(/\s+/).filter(Boolean));
  const tokens = (lower.match(/[a-zÃƒÆ\u2019Ã‚Â¡ÃƒÆ\u2019Ã‚Â©ÃƒÆ\u2019Ã‚Â­ÃƒÆ\u2019Ã‚Â³ÃƒÆ\u2019Ã‚ÂºÃƒÆ\u2019Ã‚Â¼ÃƒÆ\u2019Ã‚Â±ÃƒÆ\u2019Ã‚Â§Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ\u2019Ã‚Â¦][a-zÃƒÆ\u2019Ã‚Â¡ÃƒÆ\u2019Ã‚Â©ÃƒÆ\u2019Ã‚Â­ÃƒÆ\u2019Ã‚Â³ÃƒÆ\u2019Ã‚ÂºÃƒÆ\u2019Ã‚Â¼ÃƒÆ\u2019Ã‚Â±ÃƒÆ\u2019Ã‚Â§Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ\u2019Ã‚Â¦'\-]{2,}/gi) || []).map(t => t.replace(/^'+|'+$/g,""));
  const freq: Record<string, number> = {};
  for (const w of tokens) { if (w.length<4) continue; if (stop.has(w)) continue; freq[w]=(freq[w]||0)+1; }
  const singles = Object.entries(freq).sort((a,b)=>b[1]-a[1]).map(([t])=>t);
  const raw = lower.split(/\s+/);
  const phraseFreq: Record<string, number> = {};
  const clean = (w:string)=> (w||"").replace(/[^a-zÃƒÆ\u2019Ã‚Â¡ÃƒÆ\u2019Ã‚Â©ÃƒÆ\u2019Ã‚Â­ÃƒÆ\u2019Ã‚Â³ÃƒÆ\u2019Ã‚ÂºÃƒÆ\u2019Ã‚Â¼ÃƒÆ\u2019Ã‚Â±ÃƒÆ\u2019Ã‚Â§Ãƒâ€¦Ã¢â‚¬Å“ÃƒÆ\u2019Ã‚Â¦'\-]/gi,"");
  const ok = (w:string)=> w.length>2 && !stop.has(w);
  for (let i=0;i<raw.length;i++){
    const w1=clean(raw[i]), w2=clean(raw[i+1]||""), w3=clean(raw[i+2]||"");
    if (w1&&w2&&ok(w1)&&ok(w2)) phraseFreq[`${w1} ${w2}`]=(phraseFreq[`${w1} ${w2}`]||0)+1;
    if (w1&&w2&&w3&&ok(w1)&&ok(w2)&&ok(w3)) phraseFreq[`${w1} ${w2} ${w3}`]=(phraseFreq[`${w1} ${w2} ${w3}`]||0)+1;
  }
  const phrases = Object.entries(phraseFreq).sort((a,b)=>b[1]-a[1]).map(([t])=>t);
  const candidates:string[] = [];
  const seen = new Set<string>();
  for (const t of [...phrases, ...singles]) {
    const key = t.trim().replace(/\s+/g," ");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    candidates.push(key);
    if (candidates.length >= 16) break;
  }
  return candidates.slice(0, 12).map(t => ({
    term: t,
    definition: "From the passage ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â pre-teach meaning and one example sentence.",
    note: undefined
  }));
}
function buildTeacherNotes(
  parsed: TGenerateRequest,
  modelNotes: any,
  outputLabel: string,
  stdText: string,
  cefrFocus: { grammar: string[]; structures: string[]; vocabulary: string[] }
) {
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
  const arr = asArray<any>;
  let preteach = arr(m.preteach_vocab).map((x:any)=>({
    term: String(x?.term ?? x?.word ?? x?.term_text ?? x ?? "").trim(),
    definition: String(x?.definition ?? x?.gloss ?? x?.meaning ?? "Key item for pre-teaching.").trim(),
    note: x?.note ? String(x.note) : undefined
  })).filter((x:any)=>x.term && x.definition);
  if (!preteach.length) preteach = extractPreteachFromText(stdText || "");
  if (preteach.length < 4) preteach = preteach.concat(extractPreteachFromText(stdText)).slice(0,12);
  let cefrJust = arr(m.cefr_justification).map(String).filter(Boolean);
  if (!cefrJust.length) {
    cefrJust = [
      "Aligns with grammar focus: " + (cefrFocus?.grammar || []).slice(0,3).join(", "),
      "Uses structures: " + (cefrFocus?.structures || []).slice(0,2).join(", "),
      "Vocabulary scope: " + (cefrFocus?.vocabulary || []).slice(0,3).join(", ")
    ].filter(Boolean);
  }
  let ext = arr(m.extension_activities).map(String).filter(Boolean);
  if (ext.length < 2) {
    ext = [
      "Pair task: upgrade two sentences from the text using the target structure; peer-check for accuracy.",
      "Short writing: 90ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“120 words reusing 6+ target items (highlight them); swap and give one improvement each."
    ];
  } else if (ext.length > 2) ext = ext.slice(0,2);
  return { input_record: inRec, preteach_vocab: preteach, cefr_justification: cefrJust, extension_activities: ext };
}

/* ---------------- prompts ---------------- */
function systemPrompt() {
  return (
`You are an inclusive education writer.
GOAL
Return JSON for two parallel reading packs:
- STANDARD text + 8 questions
- ADAPTED text + 8 questions (simpler stems/options)
Both packs share a single teacher_key via answer_id.
QUESTION BALANCE (in order):
1ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“5: comprehension ("comp")
6: language ("synonym" or "antonym") ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â MCQ
7: language ("grammar") ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â MCQ
8: language ("collocation" or "reference") ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â MCQ
STANDARD RULES
- Use requested CEFR, text type/register, and OUTPUT language.
- Standard text must be close to WORD_TARGET.
ADAPTED RULES
- SAME CEFR and canonical facts; 75ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“85% of Standard length.
- Reduce cognitive load only (chunking, shorter sentences, clearer cohesion).
SCHEMA KEYS:
(meta, goals, canonical_facts, standard{ text, questions[Question] }, adapted{ text, questions[Question] }, teacher_key)
Question: { id, type, prompt, answer_id, options?, correct_option?, skill }`
  ).trim();
}
function userPrompt(params: TGenerateRequest, source: string, wordTarget: number) {
  const style = (STYLE_GUIDE as any)[params.textType] ?? "";
  const outLang = ({"en":"English","es":"Spanish","fr":"French","de":"German","it":"Italian","pt":"Portuguese","nl":"Dutch","sv":"Swedish","pl":"Polish","el":"Greek","cs":"Czech","ga":"Irish (Gaeilge)","la":"Latin (Latina)"} as any)[params.outputLanguage] ?? params.outputLanguage;
  const spec = LEVEL_RULES[params.targetCefr as keyof typeof LEVEL_RULES];
  const levelLines = [
    "CEFR FOCUS FOR " + params.targetCefr + ":",
    "- Allowed grammar: " + spec.grammar.join("; "),
    "- Allowed structures: " + spec.structures.join("; "),
    "- Vocabulary scope: " + spec.vocabulary.join("; "),
    "- ESL targets (Q6ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“Q8): " + spec.esl_targets.join("; ")
  ];
  return [
    "INPUT_LANGUAGE: auto-detect",
    "OUTPUT_LANGUAGE_NAME: " + outLang,
    "OUTPUT_LANGUAGE_CODE: " + params.outputLanguage,
    "LANGUAGE LOCK: Write EVERYTHING in " + outLang + " only.",
    "",
    "TARGET_CEFR: " + params.targetCefr,
    "TEXT_TYPE: " + params.textType,
    "STYLE_GUIDE:",
    style,
    "",
    ...levelLines,
    "",
    "LENGTH: " + params.length,
    "WORD_TARGET: " + wordTarget,
    "PUBLIC_SCHOOL_MODE: " + (params.publicSchoolMode ? "on" : "off"),
    "DYSLEXIA_FRIENDLY: " + (params.dyslexiaFriendly ? "on" : "off"),
    "",
    "Return JSON with: meta, goals, canonical_facts, standard {text, questions[8]}, adapted {text, questions[8]}, teacher_key.",
    "All human-readable text must be in " + outLang + ".",
    "",
    "SOURCE_TEXT:",
    source
  ].join("\n");
}

/* --------------- post-process --------------- */
async function reviseToRange(text: string, min: number, max: number, lang: string, textType: string, cefr: string, label: string) {
  async function pass(curr: string, hint: string) {
    const completion = await getOpenAI().chat.completions.create({
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

/* ----------------- handler ----------------- */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = GenerateRequest.parse(body);
    let source = (parsed.sourceText || "").trim();
    if (!source && parsed.sourceUrl) source = await fetchAndExtract(parsed.sourceUrl);
    if (!source) throw new Error("No usable source text. Try pasting the text, or use an AMP link.");
    const wordTarget = targetWords(parsed.targetCefr, parsed.length, parsed.textType);

    const completion = await getOpenAI().chat.completions.create({
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

    // --- sanitize model payload ---
    const facts = buildFacts(modelJson?.canonical_facts);
    let teacher_key = sanitizeTeacherKey(modelJson?.teacher_key, facts);
    const tIndex = indexKey(teacher_key);

    const standardQs0 = sanitizePackQuestions(modelJson?.standard, "S", facts, tIndex);
    const adaptedQs0  = sanitizePackQuestions(modelJson?.adapted,  "A", facts, tIndex);
    const stdQsNorm   = normaliseQuestions(standardQs0, facts);
    const adpQsNorm   = normaliseQuestions(adaptedQs0,  facts);
    const adpQsAligned = alignAdaptedToStandard(stdQsNorm, adpQsNorm);

    teacher_key = fillTeacherKeyFromQuestions(teacher_key, [{questions: stdQsNorm}, {questions: adpQsAligned}], facts);

    const spec = LEVEL_RULES[parsed.targetCefr as keyof typeof LEVEL_RULES];
    const goals = coerceGoals(modelJson?.goals, spec);
    const outputLabel = ({en:"English",es:"Spanish",fr:"French",de:"German",it:"Italian",pt:"Portuguese",nl:"Dutch",sv:"Swedish",pl:"Polish",el:"Greek",cs:"Czech",ga:"Irish (Gaeilge)",la:"Latin (Latina)"} as any)[parsed.outputLanguage] ?? parsed.outputLanguage;

    const teacher_key_common = [
      ...(facts || []).map((f:any, i:number)=>({ label: "F"+(i+1), text: asString(f.text).trim() || "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â" })),
      ...stdQsNorm.slice(0,8).map((q:any,i:number)=>({ label: String(i+1), text: answerFromQuestion(q, facts) }))
    ];

    const merged = {
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
      standard: { text: asString(modelJson?.standard?.text || modelJson?.standardText || ""), questions: stdQsNorm },
      adapted:  { text: asString(modelJson?.adapted?.text  || modelJson?.adaptedText  || ""),  questions: adpQsAligned },
      teacher_key,
      teacher_key_common,
      teacher_notes: buildTeacherNotes(parsed, modelJson?.teacher_notes, outputLabel, asString(modelJson?.standard?.text||""), goals?.cefr_focus || {grammar:[],structures:[],vocabulary:[]})
    };

    // Validate + length enforcement
    let validated = GenerateResponse.parse(merged);

    const stdMin = Math.round(wordTarget*0.9);
    const stdMax = Math.round(wordTarget*1.1);
    const wcStd  = countWords(validated.standard.text);
    if (wcStd < stdMin || wcStd > stdMax) {
      const patched = await reviseToRange(validated.standard.text, stdMin, stdMax, validated.meta.output_language, validated.meta.text_type, validated.meta.target_cefr, "STANDARD");
      validated = GenerateResponse.parse({ ...validated, standard: { ...validated.standard, text: patched } });
    }
    const finalStdWc = countWords(validated.standard.text);
    const adaptMin = Math.max(50, Math.round(finalStdWc * 0.75));
    const adaptMax = Math.round(finalStdWc * 0.85);
    const wcAdapt  = countWords(validated.adapted.text);
    if (wcAdapt < adaptMin || wcAdapt > adaptMax) {
      const patchedA = await reviseToRange(validated.adapted.text, adaptMin, adaptMax, validated.meta.output_language, validated.meta.text_type, validated.meta.target_cefr, "ADAPTED");
      validated = GenerateResponse.parse({ ...validated, adapted: { ...validated.adapted, text: patchedA } });
    }

    return NextResponse.json(validated);
  } catch (err:any) {
    console.error("[Aontas][400]", err?.message, err?.issues ?? "");
    return NextResponse.json({ error: err?.message ?? "Bad request", issues: err?.issues ?? null }, { status: 400 });
  }
}
/* ---------- QA harmoniser v2 (appended) ---------- */
function answerFromQuestion2(q:any, facts:any[]=[]): string {
  const id = (q?.answer_id ?? "").toString().trim();
  if (q?.type === "mcq" && Array.isArray(q?.options) && typeof q?.correct_option === "number") {
    const i = q.correct_option; if (i>=0 && i<q.options.length) return String(q.options[i]).trim();
  }
  if (typeof q?.answer === "string" && q.answer.trim()) return q.answer.trim();
  if (id) { const f = facts.find((x:any)=>String(x.id)===id); if (f?.text) return String(f.text).trim(); }
  return "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â";
}
function normaliseQuestions2(raw:any, facts:any[]) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = arr.slice(0,8).map((q:any,i:number)=>({
    id: q?.id ?? ("q"+(i+1)),
    prompt: String(q?.prompt || "").trim(),
    type: q?.type || "short",
    options: Array.isArray(q?.options)? q.options : undefined,
    correct_option: (typeof q?.correct_option==="number" ? q.correct_option : undefined),
    answer_id: String(q?.answer_id || "").trim() || (facts[i % Math.max(1,facts.length)]?.id || "F1"),
    answer: answerFromQuestion2(q,facts),
    skill: q?.skill
  }));
  while (out.length<8) out.push({ id: "q"+(out.length+1), prompt: "", type: "short", answer_id: "F1", answer:"ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â", skill:"comp" });
  return out;
}
function alignAdaptedToStandard2(stdQs:any[], adpQs:any[]){
  return adpQs.map((q:any,i:number)=>{
    const s = stdQs[i] || {};
    return {
      ...q,
      answer_id: q?.answer_id || s?.answer_id || "",
      answer: (typeof q?.answer==="string" && q.answer.trim()) ? q.answer.trim() : (s?.answer || "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â")
    };
  });
}
function fillTeacherKeyFromQuestions2(teacher_key:any[], packs:any[], facts:any[]){
  const known = new Set(teacher_key.map((k:any)=>String(k.answer_id)));
  for (const p of packs){
    const qs = Array.isArray(p?.questions)? p.questions : [];
    for (const q of qs){
      const id = String(q?.answer_id || "");
      if (!id || known.has(id)) continue;
      const text = answerFromQuestion2(q, facts);
      teacher_key.push({ answer_id: id, answer: text || "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â" });
      known.add(id);
    }
  }
  return teacher_key;
}
function sanitizeModelJson2(modelJson:any, parsed:TGenerateRequest, wordTarget:number){
  const facts = buildFacts(modelJson?.canonical_facts);
  let teacher_key = sanitizeTeacherKey(modelJson?.teacher_key, facts);
  const stdRaw = modelJson?.standard; const adpRaw = modelJson?.adapted;
  const stdQsNorm = normaliseQuestions2(stdRaw?.questions, facts);
  const adpQsNorm = normaliseQuestions2(adpRaw?.questions,  facts);
  const adpQsAligned = alignAdaptedToStandard2(stdQsNorm, adpQsNorm);
  teacher_key = fillTeacherKeyFromQuestions2(teacher_key, [ {questions: stdQsNorm}, {questions: adpQsAligned} ], facts);

  const spec = LEVEL_RULES[parsed.targetCefr as keyof typeof LEVEL_RULES];
  const outputLabel = (CODE_TO_LABEL as any)[parsed.outputLanguage] ?? parsed.outputLanguage;
  const goals = buildGoals(parsed, modelJson?.goals);
  const notes = buildTeacherNotes(
    parsed, modelJson?.teacher_notes, outputLabel,
    String(stdRaw?.text || ""),
    goals?.cefr_focus || { grammar:[], structures:[], vocabulary:[] }
  );

  const teacher_key_common = [
    ...(facts||[]).map((f:any,i:number)=>({ label: "F"+(i+1), text: String(f?.text ?? "").trim() || "ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â" })),
    ...stdQsNorm.map((q:any,i:number)=>({ label: String(i+1), text: answerFromQuestion2(q, facts) }))
  ];

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
    standard: { text: String(stdRaw?.text || ""), questions: stdQsNorm },
    adapted:  { text: String(adpRaw?.text || ""), questions: adpQsAligned },
    teacher_key,
    teacher_key_common,
    teacher_notes: notes
  };
}

