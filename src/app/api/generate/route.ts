import { NextRequest, NextResponse } from "next/server";
import { GenerateRequest, GenerateResponse, TGenerateRequest } from "@/lib/schema";
import { targetWords } from "@/lib/cefr";
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
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 12000);
}

function systemPrompt() {
  return `
You are an inclusive education writer.

GOAL: Produce JSON for two parallel reading packs from a given source:
1) STANDARD text + 8 comprehension questions.
2) ADAPTED text (for dyslexia/ADHD/low working memory) + 8 DIFFERENT questions.
Both packs must map to a SINGLE teacher answer key via shared answer IDs.

HARD RULES
- Output ONLY JSON matching the provided schema. No prose.
- Keep canonical facts accurate; do not invent data.
- Constrain vocabulary/syntax to the requested CEFR level.
- Use the requested text type/register and output language.
- Word count: hit the target ±10%.
- ADAPTED text: shorter sentences, chunking, bold key words, explicit sequencing, no idioms, limit numbers.
- ADAPTED questions must be answerable by the adapted text and map to the SAME answers as the standard pack, but be simpler (choices, starters).
- Provide a diverse question mix: retrieval, detail, purpose, mild inference, number, time/place, action.
- The teacher_key answers are short, unambiguous strings.

SCHEMA (exact keys required):
{
  "meta": {
    "input_language": "xx",
    "output_language": "xx",
    "target_cefr": "A1|A2|B1|B2|C1|C2",
    "text_type": "string",
    "length": "short|standard|long",
    "word_target": 123
  },
  "canonical_facts": [{"id":"F1","text":"..."}, ...],
  "standard": {
    "text": "string",
    "questions": [{"id":"S1","type":"string","prompt":"string","answer_id":"F#"}, ...] // 8 items
  },
  "adapted": {
    "text": "string",
    "questions": [{"id":"A1","type":"string","prompt":"string","answer_id":"F#"}, ...] // 8 items
  },
  "teacher_key": [{"answer_id":"F#","answer":"string"}, ...]
}
`.trim();
}

function userPrompt(params: TGenerateRequest, source: string, wordTarget: number) {
  return `
INPUT_LANGUAGE: auto-detect
OUTPUT_LANGUAGE: ${params.outputLanguage}
TARGET_CEFR: ${params.targetCefr}
TEXT_TYPE: ${params.textType}
LENGTH: ${params.length}
WORD_TARGET: ${wordTarget}
PUBLIC_SCHOOL_MODE: ${params.publicSchoolMode ? "on" : "off"}
DYSLEXIA_FRIENDLY: ${params.dyslexiaFriendly ? "on" : "off"}

SOURCE_TEXT:
${source}
`.trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = GenerateRequest.parse(body);

    let source = parsed.sourceText?.trim() || "";
    if (!source && parsed.sourceUrl) source = await fetchAndExtract(parsed.sourceUrl);
    if (!source) throw new Error("No usable source text.");

    const wordTarget = targetWords(parsed.targetCefr, parsed.length);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt() },
        { role: "user", content: userPrompt(parsed, source, wordTarget) }
      ]
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const json = JSON.parse(raw);

    const validated = GenerateResponse.parse(json);
    return NextResponse.json(validated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Bad request" }, { status: 400 });
  }
}
