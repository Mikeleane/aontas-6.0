export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { GenerateResponse } from "@/lib/schema";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

// Split long text into readable paragraphs
function makeParagraphs(text: string, size: number, line: number) {
  const chunks = text
    .trim()
    .split(/\n{2,}|(?<=\.)\s+(?=[A-ZÁÉÍÓÚÑÄËÏÖÜ])/u) // split on blank lines or sentence boundaries
    .map((s) => s.trim())
    .filter(Boolean);

  return chunks.map(
    (s) =>
      new Paragraph({
        spacing: { line, after: 120 },
        children: [new TextRun({ text: s, size })],
      })
  );
}

// Estimate how many pages; simple heuristic on chars
function estimatePages(payload: any) {
  const toCount = [
    payload.standard?.text ?? "",
    payload.adapted?.text ?? "",
    (payload.standard?.questions ?? []).map((q: any) => q.prompt).join(" "),
    (payload.adapted?.questions ?? []).map((q: any) => q.prompt).join(" "),
    (payload.teacher_key ?? []).map((a: any) => a.answer).join(" "),
  ].join(" ");
  const chars = toCount.length;
  const charsPerPage = 2800; // ~ 11pt, A4, 1" margins
  return Math.max(1, chars / charsPerPage);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Expect { data: <GenerateResponse> , title?: string }
    const validated = GenerateResponse.parse(body.data);
    const title: string =
      (body.title as string) ||
      `Aontas_${validated.meta.target_cefr}_${validated.meta.text_type}_${validated.meta.output_language}`;

    // --- Fit-to-3-pages heuristics ---
    const pages = estimatePages(validated);
    const scale = Math.min(1, 3 / pages);
    // docx sizes are HALF-points (22 = 11pt)
    const baseSize = 22; // 11pt
    const minSize = 18;  // 9pt safety floor
    const size = Math.max(minSize, Math.floor(baseSize * Math.sqrt(scale)));
    // line: 276 ≈ 1.15, 240 ≈ 1.0
    const line = scale < 1 ? 240 : 276;

    const marginTwips = 1440; // 1 inch margins
    const sectionProps = {
      properties: {
        page: { margin: { top: marginTwips, right: marginTwips, bottom: marginTwips, left: marginTwips } },
      },
    } as const;

    const h2 = (t: string) =>
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: t, bold: true })],
        spacing: { after: 160 },
      });

    const list = (items: string[]) =>
      items.map(
        (t, i) =>
          new Paragraph({
            children: [new TextRun({ text: `${i + 1}. ${t}`, size })],
            spacing: { line, after: 80 },
          })
      );

    const doc = new Document({
      sections: [
        {
          ...sectionProps,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 240 },
              children: [
                new TextRun({ text: "Aontas — Standard Pack", bold: true, size: size + 2 }),
                new TextRun({
                  text: `\n${validated.meta.text_type.toUpperCase()} — CEFR ${validated.meta.target_cefr} — ${validated.meta.output_language.toUpperCase()}`,
                  size,
                }),
              ],
            }),
            h2("Reading"),
            ...makeParagraphs(validated.standard.text, size, line),
            h2("Comprehension questions"),
            ...list(validated.standard.questions.map((q) => q.prompt)),
          ],
        },
        {
          ...sectionProps,
          children: [
            h2("Adaptive content (LD)"),
            ...makeParagraphs(validated.adapted.text, size, line),
            h2("Comprehension questions (adapted)"),
            ...list(validated.adapted.questions.map((q) => q.prompt)),
          ],
        },
        {
          ...sectionProps,
          children: [
            h2("Teacher notes + Answer key"),
            ...validated.teacher_key.map(
              (a) =>
                new Paragraph({
                  spacing: { line, after: 60 },
                  children: [
                    new TextRun({ text: `${a.answer_id}: `, bold: true, size }),
                    new TextRun({ text: a.answer, size }),
                  ],
                })
            ),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${title}.docx"`,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "DOCX build failed" }, { status: 400 });
  }
}
