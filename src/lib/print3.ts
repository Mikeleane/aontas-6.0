function escapeHtml(s:string){ return (s||"").replace(/[&<>"']/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;", "\"":"&quot;","'":"&#39;" } as any)[c]); }
function asString(v:any){ return (v===null||v===undefined) ? "" : String(v); }

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
  return "—";
}
function qList(pack:any){
  const qs = Array.isArray(pack?.questions)? pack.questions : [];
  return "<ol class=\"q\">"+qs.map((q:any)=>"<li>"+escapeHtml(q?.prompt||"")+"</li>").join("")+"</ol>";
}
function buildCommonKeyHtml(data:any){
  const facts = Array.isArray(data?.canonical_facts)? data.canonical_facts : [];
  const stdQs = Array.isArray(data?.standard?.questions)? data.standard.questions : [];
  const factPart = facts.map((f:any, i:number)=>({ label: "F"+(i+1), text: asString(f?.text||"—") }));
  const qPart    = stdQs.slice(0,8).map((q:any, i:number)=>({ label: String(i+1), text: answerFromQuestion(q, facts) }));
  const all = [...factPart, ...qPart];
  return "<ol class=\"small\">"+all.map((k:any)=>"<li><strong>"+escapeHtml(k.label)+"</strong>: "+escapeHtml(k.text||"—")+"</li>").join("")+"</ol>";
}
function buildHTML(data:any){
  const std = data?.standard ?? { text:"", questions:[] };
  const adp = data?.adapted ?? { text:"", questions:[] };
  const goals = data?.goals ?? { lesson_goals:[], success_criteria:[], cefr_focus:{grammar:[],structures:[],vocabulary:[]} };
  const meta = data?.meta || {};
  const hdr = `<div class="meta">CEFR ${escapeHtml(meta.target_cefr||"")} · ${escapeHtml(meta.text_type||"")} · ${escapeHtml(meta.output_language||"")}</div>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Aontas — Print</title>
<style>
  @page { size: A4; margin: 10mm 10mm 12mm 10mm; }
  html, body { background:#fff; }
  body { font-family: ui-serif, "Noto Serif", Georgia, Cambria, "Times New Roman", serif; margin:0; }
  .page { box-sizing:border-box; height: calc(297mm - 22mm); padding: 4mm 4mm 0 4mm; overflow:hidden; }
  .page h1, .page h2, .page h3 { margin: 0 0 8px; }
  .meta { font-size: 11pt; opacity: .75; margin-bottom: 6px; }
  .text { font-size: 12pt; margin: 8px 0 10px; }
  .q { margin: 4px 0; padding-left: 18px; }
  .q li { margin: 2px 0; }
  .small { font-size: 10pt; }
  .page + .page { page-break-before: always; }
  .kv { display:grid; grid-template-columns: 140px 1fr; gap:6px 10px; margin:6px 0 10px; }
  .kv div { padding:2px 0; }
</style>
</head>
<body>
  <div id="p1" class="page">
    <h1>Standard</h1>
    ${hdr}
    <div class="text">${escapeHtml(std.text).replace(/\n/g,"<br/>")}</div>
    <h2>Questions</h2>
    ${qList(std)}
  </div>
  <div id="p2" class="page">
    <h1>Adapted</h1>
    ${hdr}
    <div class="text">${escapeHtml(adp.text).replace(/\n/g,"<br/>")}</div>
    <h2>Questions</h2>
    ${qList(adp)}
  </div>
  <div id="p3" class="page">
    <h1>Teacher Notes, Goals & Key</h1>
    ${hdr}

    <h2>Common answer key</h2>
    ${buildCommonKeyHtml(data)}

    <h2>Goals</h2>
    <ul class="small">${(goals.lesson_goals||[]).map((g:string)=>`<li>${escapeHtml(g)}</li>`).join("")}</ul>
    <h3>Success criteria</h3>
    <ul class="small">${(goals.success_criteria||[]).map((g:string)=>`<li>${escapeHtml(g)}</li>`).join("")}</ul>
    <h3>CEFR focus</h3>
    <div class="small"><strong>Grammar:</strong> ${(goals.cefr_focus?.grammar||[]).map(escapeHtml).join(", ")}</div>
    <div class="small"><strong>Structures:</strong> ${(goals.cefr_focus?.structures||[]).map(escapeHtml).join(", ")}</div>
    <div class="small"><strong>Vocabulary:</strong> ${(goals.cefr_focus?.vocabulary||[]).map(escapeHtml).join(", ")}</div>
  </div>
<script>
  function mmToPx(mm){ const d=document.createElement("div"); d.style.height=mm+"mm"; d.style.position="absolute"; d.style.visibility="hidden"; document.body.appendChild(d); const px=d.getBoundingClientRect().height; d.remove(); return px; }
  function fit(el, maxH){ let size=100, min=85, tries=0; el.style.fontSize=size+"%"; while (el.scrollHeight>maxH && size>min && tries<12){ size-=5; tries++; el.style.fontSize=size+"%"; } }
  window.addEventListener("load", ()=>{
    const usable = mmToPx(297 - 22);
    ["p1","p2","p3"].forEach(id=>{ const el=document.getElementById(id); if (el) fit(el, usable); });
    setTimeout(()=>{ window.focus(); window.print(); }, 50);
  });
</script>
</body>
</html>`;
}

export function printThreePages(data:any){
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return;
  w.document.open();
  w.document.write(buildHTML(data));
  w.document.close();
}
