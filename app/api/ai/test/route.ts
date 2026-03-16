import { NextResponse } from "next/server";
import { getOpenAI } from "@/lib/openai";

/**
 * GET /api/ai/test
 *
 * Verifies OpenAI connectivity and API key validity.
 */
export async function GET() {
  try {
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-5-nano",
      max_tokens: 20,
      messages: [{ role: "user", content: "Reply with exactly: OK" }],
    });

    const content = response.choices[0]?.message?.content ?? "";

    return NextResponse.json({
      ok: true,
      message: "OpenAI connection successful",
      model: response.model,
      reply: content.trim(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, message, error: "openai_connection_failed" },
      { status: 500 },
    );
  }
}
