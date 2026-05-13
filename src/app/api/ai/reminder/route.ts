import { NextResponse } from "next/server";
import {
  INVOICES,
  draftReminderEmail,
  getClient,
  getMatter,
  eur,
} from "@/lib/demo-data";

export const runtime = "nodejs";

/**
 * POST /api/ai/reminder
 * Body: { invoiceId: string }
 *
 * If OPENROUTER_API_KEY is set, calls a small model for a bilingual draft.
 * Otherwise falls back to the deterministic mock from demo-data.
 *
 * Either way, returns { subject, body, to, language }. The client never knows
 * which path ran — same shape, different source.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const invoice = INVOICES.find((i) => i.id === body.invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    const draft = draftReminderEmail(invoice);
    return NextResponse.json(draft);
  }

  const client = getClient(invoice.clientId);
  const matter = getMatter(invoice.matterId);
  const lang = client?.language ?? "en";
  const due = new Date(invoice.dueAt);
  const today = new Date();
  const daysLate = Math.floor(
    (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24),
  );

  const prompt = `You are a Cyprus law-firm assistant drafting a polite, professional payment-reminder email. Output JSON with keys "subject" and "body" ONLY. Write entirely in ${lang === "el" ? "Greek (formal, polite, no English mixed in)" : "English (formal, courteous)"}.

Context:
- Client: ${lang === "el" ? client?.nameEl : client?.nameEn}
- Invoice: ${invoice.number} for ${eur.format(invoice.total)}
- Matter: ${lang === "el" ? matter?.titleEl : matter?.title}
- Due date: ${due.toLocaleDateString(lang === "el" ? "el-CY" : "en-GB")}
- Days overdue: ${daysLate}
- Firm: Fotini Kandri Law Office
- IBAN to remit: CY17 0020 0128 0000 0012 0052 7600

Keep it under 120 words. End with a courteous sign-off from the firm. Do not invent numbers, dates, or details beyond the context.`;

  try {
    const aiRes = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://flaw.vercel.app",
          "X-Title": "Lex",
        },
        body: JSON.stringify({
          model:
            process.env.OPENROUTER_MODEL ?? "mistralai/mistral-large-latest",
          messages: [
            {
              role: "system",
              content:
                "You produce JSON-only responses. Never include markdown fences, never add commentary.",
            },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
        }),
      },
    );

    if (!aiRes.ok) {
      const draft = draftReminderEmail(invoice);
      return NextResponse.json(draft);
    }

    const data = await aiRes.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      const draft = draftReminderEmail(invoice);
      return NextResponse.json(draft);
    }
    const parsed = JSON.parse(content);
    if (
      typeof parsed?.subject !== "string" ||
      typeof parsed?.body !== "string"
    ) {
      const draft = draftReminderEmail(invoice);
      return NextResponse.json(draft);
    }
    return NextResponse.json({
      subject: parsed.subject,
      body: parsed.body,
      to: client?.email ?? null,
      language: lang,
    });
  } catch {
    const draft = draftReminderEmail(invoice);
    return NextResponse.json(draft);
  }
}
