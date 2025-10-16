"use client";
import React from "react";
import { type TGenerateResponse } from "@/lib/schema";

function answerFromQuestion(q:any, facts:any[]=[]): string {
  const id = (q?.answer_id ?? "").toString().trim();
  if (q?.type === "mcq" && Array.isArray(q?.options)) {
    const i = typeof q?.correct_option === "number" ? q.correct_option : -1;
    if (i >= 0 && i < q.options.length) return String(q.options[i]).trim();
  }
  if (typeof q?.answer === "string" && q.answer.trim()) return q.answer.trim();
  if (id) {
    const f = facts.find((x:any) => String(x.id).toLowerCase() === id.toLowerCase());
    if (f?.text) return String(f.text).trim();
  }
  return "—";
}

export default function TeacherPanel({ data }: { data: TGenerateResponse }) {
  const facts = data?.canonical_facts ?? [];
  const stdQs = data?.standard?.questions ?? [];
  const mergedQKey = stdQs.slice(0,8).map((q:any, i:number) => ({
    n: i+1, answer: answerFromQuestion(q, facts)
  }));

  const notes = data.teacher_notes || {
    input_record: {},
    preteach_vocab: [],
    cefr_justification: [],
    extension_activities: []
  };
  const goals = data.goals || {
    lesson_goals: [],
    success_criteria: [],
    cefr_focus: { grammar: [], structures: [], vocabulary: [] }
  };
  const preteach = Array.isArray(notes.preteach_vocab) ? notes.preteach_vocab : [];

  return (
    <div className="sheet teacher-panel rounded border p-4 text-sm space-y-4">
      <h3 className="font-semibold">Teacher notes · Goals · Answer key</h3>

      <div>
        <div className="font-semibold">Input record</div>
        <div className="grid grid-cols-[150px_1fr] gap-x-3">
          <div>Source</div><div>{notes.input_record?.source || ""}</div>
          <div>Target CEFR</div><div>{notes.input_record?.target_cefr || ""}</div>
          <div>Text type</div><div>{notes.input_record?.text_type || ""}</div>
          <div>Output language</div><div>{notes.input_record?.output_language || ""}</div>
          <div>Length</div><div>{notes.input_record?.length || ""}</div>
          <div>Dyslexia-friendly</div><div>{String(!!notes.input_record?.dyslexia_friendly)}</div>
        </div>
      </div>

      <div>
        <div className="font-semibold">Pre-teach vocabulary</div>
        <ol className="list-decimal pl-5">
          {preteach.map((v:any, idx:number) => (
            <li key={idx}>
              <strong>{v.term}</strong>: {v.definition}
              {v.note ? <> — <em>{v.note}</em></> : null}
            </li>
          ))}
        </ol>
      </div>

      <div>
        <div className="font-semibold">CEFR justification</div>
        <ul className="list-disc pl-5">
          {(notes.cefr_justification || []).map((s:string, i:number) => <li key={i}>{s}</li>)}
        </ul>
      </div>

      <div>
        <div className="font-semibold">Extension activities</div>
        <ol className="list-decimal pl-5">
          {(notes.extension_activities || []).slice(0,2).map((s:string, i:number) => <li key={i}>{s}</li>)}
        </ol>
      </div>

      <div>
        <div className="font-semibold">Answer key (common)</div>
        <ol className="list-decimal pl-5">
          {mergedQKey.map(k => <li key={k.n}>{k.answer || "—"}</li>)}
        </ol>
      </div>
    </div>
  );
}

