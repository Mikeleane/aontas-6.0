"use client";

import React, { useState } from "react";
import TeacherPanel from "../../components/TeacherPanel";

type Question = {
  id?: string;
  type?: "mcq" | "tf" | "tfng" | "short";
  prompt?: string;
  options?: string[];
  correct_option?: number;
  answer_id?: string;
  answer?: string;
  skill?: string;
};

type Pack = { text: string; questions: Question[] };

type Result = {
  meta: {
    output_language: string;
    target_cefr: string;
    text_type: string;
    length: string;
    word_target: number;
  };
  canonical_facts: { id: string; text: string }[];
  standard: Pack;
  adapted: Pack;
  goals: any;
  teacher_notes?: any;
  teacher_key?: { answer_id: string; answer: string }[];
  teacher_key_common?: { label: string; text: string }[];
};

const initialForm = {
  targetCefr: "B1",
  textType: "article",
  length: "standard",
  outputLanguage: "en",
  sourceText: "",
  sourceUrl: "",
  dyslexiaFriendly: true,
  publicSchoolMode: false,
};

function QList({ qs }: { qs: Question[] }) {
  const list = Array.isArray(qs) ? qs.slice(0, 8) : [];
  return (
    <ol className="list-decimal pl-5 space-y-2">
      {list.map((q, i) => (
        <li key={i} className="no-break-inside">
          <div className="font-medium">{q?.prompt || ""}</div>
          {q?.type === "mcq" && Array.isArray(q?.options) && q.options.length > 0 && (
            <ul className="pl-4 list-disc mt-1">
              {q.options.map((opt, j) => (
                <li key={j}>
                  {opt}
                  {typeof q.correct_option === "number" && j === q.correct_option ? (
                    <span className="ml-2 text-xs text-green-700">(answer)</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {(q?.type === "tf" || q?.type === "tfng") && (
            <div className="text-sm text-slate-600 mt-1">({q.type.toUpperCase()})</div>
          )}
        </li>
      ))}
    </ol>
  );
}

const LANGS = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "sv", label: "Swedish" },
  { code: "pl", label: "Polish" },
  { code: "el", label: "Greek" },
  { code: "cs", label: "Czech" },
  { code: "ga", label: "Irish (Gaeilge)" },
  { code: "la", label: "Latin (Latina)" },
];
export default function Page() {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Request failed");
      } else {
        setResult(data);
      }
    } catch (err: any) {
      setError(err?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page container-narrow mx-auto p-4 space-y-6">
      <header className="flex items-center justify-between print-hidden">
        <h1 className="text-xl font-semibold">Aontas Builder</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-1.5 rounded bg-slate-900 text-white hover:opacity-90"
          >
            Print
          </button>
        </div>
      </header>

      <form onSubmit={onSubmit} className="card p-4 print-hidden">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Target CEFR</span>
            <select
              className="border rounded px-2 py-1"
              value={form.targetCefr}
              onChange={(e) => setForm((f) => ({ ...f, targetCefr: e.target.value }))}
            >
              {["A2","B1","B2","C1","C2"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Text type</span>
            <select
              className="border rounded px-2 py-1"
              value={form.textType}
              onChange={(e) => setForm((f) => ({ ...f, textType: e.target.value }))}
            >
              {["article","report","informal_email","formal_email","narrative"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Length</span>
            <select
              className="border rounded px-2 py-1"
              value={form.length}
              onChange={(e) => setForm((f) => ({ ...f, length: e.target.value }))}
            >
              {["short","standard","long"].map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium">Output language (code)</span>
            <input
              className="border rounded px-2 py-1"
              value={form.outputLanguage}
              onChange={(e) => setForm((f) => ({ ...f, outputLanguage: e.target.value }))}
              placeholder="en, fr, es…"
            />
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
            <span className="text-xs font-medium">Source URL (optional)</span>
            <input
              className="border rounded px-2 py-1"
              value={form.sourceUrl}
              onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))}
              placeholder="https://…"
            />
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
            <span className="text-xs font-medium">Or paste source text</span>
            <textarea
  name="sourceText"
  id="sourceText"
  rows={12}
  className="border rounded px-2 py-1"
  placeholder="Paste article text or leave empty to use URL"
  value={form.sourceText}
  onChange={(e) => setForm(f => ({ ...f, sourceText: e.target.value }))}
></textarea>
          </label>

          <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.dyslexiaFriendly}
                onChange={(e) => setForm((f) => ({ ...f, dyslexiaFriendly: e.target.checked }))}
              />
              <span className="text-sm">Dyslexia-friendly</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.publicSchoolMode}
                onChange={(e) => setForm((f) => ({ ...f, publicSchoolMode: e.target.checked }))}
              />
              <span className="text-sm">Public-school mode</span>
            </label>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Generating…" : "Generate"}
          </button>
          {error && <div className="text-red-600 text-sm">{error}</div>}
        </div>
      </form>

      {result && (
        <div className="grid lg:grid-cols-[1fr_minmax(340px,420px)] gap-6">
          <section className="space-y-6">
            <div className="card p-4">
              <h2 className="mb-2">Standard text</h2>
              <p className="whitespace-pre-wrap leading-relaxed">{result.standard?.text || ""}</p>
            </div>

            <div className="card p-4">
              <h2 className="mb-3">Standard — 8 questions</h2>
              <QList qs={result.standard?.questions || []} />
            </div>

            <div className="card p-4">
              <h2 className="mb-2">Adapted text</h2>
              <p className="whitespace-pre-wrap leading-relaxed">{result.adapted?.text || ""}</p>
            </div>

            <div className="card p-4">
              <h2 className="mb-3">Adapted — 8 questions</h2>
              <QList qs={result.adapted?.questions || []} />
            </div>
          </section>

          <aside className="lg:sticky lg:top-4 h-fit">
            <TeacherPanel data={result as any} />
          </aside>
        </div>
      )}
    </main>
  );
}





