/* Auto-fit print with optional 4th page for very long packs */
function escapeHtml(s:string){ return String(s??"").replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;", '"':"&quot;" } as any)[c]); }

function qList(pack:any){
  const qs = Array.isArray(pack?.questions) ? pack.questions : [];
  return `<ol class="q">${qs.map((q:any)=>`<li>${escapeHtml(q?.prompt||"")}</li>`).join("")}</ol>`;
}

function buildHTML(data:any){
  const std = data?.standard ?? { text:"", questions:[] };
  const adp = data?.adapted ?? { text:"", questions:[] };
  const key = Array.isArray(data?.teacher_key) ? data.teacher_key : [];
  const goals = data?.goals ?? { lesson_goals:[], success_criteria:[], cefr_focus:{grammar:[],structures:[],vocabulary:[]} };
  const notes = data?.teacher_notes ?? { input_record:{}, preteach_vocab:[], cefr_justification:[], extension_activities:[] };
  const meta = data?.meta || {};
  const lang = (meta.output_language_code || "en");

  const hdr = `<div class="meta">CEFR ${escapeHtml(meta.target_cefr||"")} · ${escapeHtml(meta.text_type||"")} · ${escapeHtml(meta.output_language||"")}</div>`;

  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8"/>
<title>Aontas — Print</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&family=Noto+Serif:wght@400;700&display=swap" rel="stylesheet"/>
<style>
  @page { size: A4; margin: 8mm 8mm 10mm 8mm; }
  html, body { background:#fff; }
  body      { font-family: "Noto Serif","Noto Sans",system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; margin:0; }
  .page     { box-sizing:border-box; height: calc(297mm - 18mm); padding: 0; overflow:hidden; }
  .wrap     { font-size:100%; line-height:1.36; padding: 1.5mm 0; }
  .page + .page { page-break-before: always; }

  .meta { font-size: 10.5pt; opacity: .75; margin: 2mm 0 1.5mm; }
  h1 { margin: 0 0 1.5mm; font-size: 16pt; }
  h2 { margin: 1mm 0 1mm;  font-size: 13pt; }
  h3 { margin: 1mm 0 1mm;  font-size: 11.5pt; }

  .text { font-size: 12pt; hyphens: auto; overflow-wrap: anywhere; }
  .q    { margin: 1.5mm 0; padding-left: 4mm; }
  ol.q  { font-size: 11.5pt; }

  .small { font-size: 10.5pt; }
  .kv { display:grid; grid-template-columns: 128px 1fr; gap:3px 8px; margin:2mm 0 2mm; }
  .kv div { padding:1px 0; }

  .tight .wrap { line-height:1.28; }
  .tight .text { font-size: 11.25pt; }
  .tight ol.q  { font-size: 10.75pt; }
  .tight h1 { font-size: 15pt; }
  .tight h2 { font-size: 12pt; }
  .tight h3 { font-size: 11pt; }
  /* Long-pack compact mode */
  .tight .page { padding: 3mm 2mm 0 2mm; }
  .tight .meta { font-size: 10.5pt; margin-bottom: 4px; }
  .tight .text { font-size: 11pt; line-height: 1.28; hyphens: auto; }
  .tight h1 { margin: 0 0 4px; font-size: 15pt; }
  .tight h2 { margin: 6px 0 4px; font-size: 12pt; }
  .tight h3 { margin: 4px 0 3px; font-size: 11pt; }
  .tight ol, .tight ul { margin: 4px 0; padding-left: 18px; }
  .tight .q li { margin: 2px 0; }
</style>
</head>
<body>
  <div id="p1" class="page"><div class="wrap">
    <h1>Standard</h1>
    ${hdr}
    <div class="text">${escapeHtml(std.text).replace(/\n/g,"<br/>")}</div>
    <h2>Questions</h2>
    ${qList(std)}
  </div></div>

  <div id="p2" class="page"><div class="wrap">
    <h1>Adapted</h1>
    ${hdr}
    <div class="text">${escapeHtml(adp.text).replace(/\n/g,"<br/>")}</div>
    <h2>Questions</h2>
    ${qList(adp)}
  </div></div>

  <div id="p3" class="page"><div class="wrap">
    <h1>Teacher Notes, Goals & Key</h1>
    ${hdr}

    <section id="tn" class="teacher-notes-split">
      <h2>Input record</h2>
      <div class="kv small">
        <div><strong>Source</strong></div><div>${escapeHtml(notes.input_record?.source||"")}</div>
        <div><strong>Target CEFR</strong></div><div>${escapeHtml(notes.input_record?.target_cefr||"")}</div>
        <div><strong>Text type</strong></div><div>${escapeHtml(notes.input_record?.text_type||"")}</div>
        <div><strong>Output language</strong></div><div>${escapeHtml(notes.input_record?.output_language||"")}</div>
        <div><strong>Length</strong></div><div>${escapeHtml(notes.input_record?.length||"")}</div>
        <div><strong>Dyslexia-friendly</strong></div><div>${String(!!notes.input_record?.dyslexia_friendly)}</div>
      </div>

      <h2>Pre-teach vocabulary</h2>
      <ol class="small">
        ${(notes.preteach_vocab||[]).map((v:any)=>`<li><strong>${escapeHtml(v.term||"")}</strong>: ${escapeHtml(v.definition||"")}${v.note? " — <em>"+escapeHtml(v.note)+"</em>":""}</li>`).join("")}
      </ol>

      <h2>CEFR justification</h2>
      <ul class="small">${(notes.cefr_justification||[]).map((s:string)=>`<li>${escapeHtml(s)}</li>`).join("")}</ul>

      <h2>Extension activities</h2>
      <ol class="small">${(notes.extension_activities||[]).slice(0,2).map((s:string)=>`<li>${escapeHtml(s)}</li>`).join("")}</ol>
    </section>

    <h2>Teacher Key</h2>
    <ol class="small">${(Array.isArray(key)?key:[]).map((k:any)=>`<li><strong>${escapeHtml(k.answer_id||"")}</strong>: ${escapeHtml(k.answer||"")}</li>`).join("")}</ol>
  </div></div>

  <script>
    (function(){
      function mmToPx(mm){ const d=document.createElement("div"); d.style.height=mm+"mm"; d.style.position="absolute"; d.style.visibility="hidden"; document.body.appendChild(d); const px=d.getBoundingClientRect().height; d.remove(); return px; }
      function fit(container, maxH, min){
        let s=100, tries=0;
        container.style.fontSize=s+"%";
        while (container.scrollHeight>maxH && s>min && tries<24){ s-=2; tries++; container.style.fontSize=s+"%"; }
        if (container.scrollHeight>maxH){
          container.closest(".page")?.classList.add("tight");
          while (container.scrollHeight>maxH && s>min-8 && tries<40){ s-=1; tries++; container.style.fontSize=s+"%"; }
        }
      }

      const metaLen = (window).__AONTAS__LENGTH__ || "standard";
      const allowFour = metaLen === "long";
      const usable = mmToPx(297 - 18);

      const pages = Array.from(document.querySelectorAll(".page"));
      pages.forEach(p=>fit(p.querySelector(".wrap"), usable, metaLen==="long"?75:85));

      const p3 = document.getElementById("p3");
      if (allowFour && p3 && p3.scrollHeight>usable){
        const tn = p3.querySelector("#tn");
        if (tn){
          const p4 = document.createElement("div");
          p4.id="p4"; p4.className="page";
          const w4 = document.createElement("div");
          w4.className = "wrap";
          p4.appendChild(w4);
          w4.innerHTML = "<h1>Teacher Notes (cont.)</h1>"+tn.outerHTML;
          tn.remove();
          p3.after(p4);
          [p3, p4].forEach(el=>fit(el.querySelector(".wrap"), usable, 75));
        }
      }

      setTimeout(()=>{ window.focus(); window.print(); }, 40);
    })();
  </script>
</body>
</html>`;
}

/** Public API */
export function printAutoFit(data:any){
  const mount = document.createElement("iframe");
  mount.style.position = "fixed";
  mount.style.inset = "0";
  mount.style.width = "0";
  mount.style.height = "0";
  mount.style.border = "0";
  document.body.appendChild(mount);
  const doc = mount.contentDocument!;
  (doc.defaultView as any).__AONTAS__LENGTH__ = data?.meta?.length || "standard";
  doc.open();
  doc.write(buildHTML(data));
  doc.close();
  const cleanup = ()=>{ mount.remove(); window.removeEventListener("afterprint", cleanup); };
  window.addEventListener("afterprint", cleanup);
}

