"use client";
import React from "react";

const LETTERS = ["A","B","C","D","E","F","G","H"];

type AnyRec = Record<string, any>;
export default function AnswerSheet({ data }: { data: AnyRec }) {
  const qs: AnyRec[] = Array.isArray(data?.questions) ? data.questions : [];
  return (
    <div className="print-only sheet print-page">
      <h2 className="text-xl font-semibold mb-3">Answer Sheet</h2>

      <div className="answer-grid">
        <div></div>
        {LETTERS.map((L) => (
          <div key={"h"+L} className="hdr">{L}</div>
        ))}

        {qs.map((q, i) => {
          const ansRaw = (q?.answer_id ?? q?.answer ?? "").toString().trim().toUpperCase();
          // If answer_id is like "B" fill that bubble; if numeric, map 1->A, etc.
          const letterFromNum = (n: number) => (n>=1 && n<=8 ? LETTERS[n-1] : "");
          const chosen = /^[A-H]$/.test(ansRaw) ? ansRaw
                       : (/^\d+$/.test(ansRaw) ? letterFromNum(parseInt(ansRaw,10)) : "");
          return (
            <React.Fragment key={i}>
              <div className="qnum">{i+1}</div>
              {LETTERS.map((L) => (
                <div key={L+i} className={"bubble" + (chosen === L ? " fill" : "")}>
                  {/* empty circle with letter already in header */}
                </div>
              ))}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}