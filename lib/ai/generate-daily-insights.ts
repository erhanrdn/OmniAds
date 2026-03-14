import { getOpenAI } from "@/lib/openai";

const AI_MODEL = "gpt-4.1-nano";

export interface BusinessMetricsSummary {
  businessId: string;
  businessName: string;
  date: string;
  currency: string;
  channels: Record<
    string,
    {
      spend: number;
      revenue: number;
      roas: number;
      purchases: number;
      cpa: number;
    }
  >;
  metrics: {
    totalSpend: number;
    totalRevenue: number;
    roas: number;
    totalPurchases: number;
    cpa: number;
    ctr: number;
  };
  trends7d: Array<{
    label: string;
    spend: number;
    revenue: number;
    purchases: number;
  }>;
  topWinners: Array<{ name: string; roas: number; spend: number }>;
  topLosers: Array<{ name: string; roas: number; spend: number }>;
}

export interface AiDailyInsight {
  summary: string;
  risks: string[];
  opportunities: string[];
  recommendations: string[];
}

const SYSTEM_PROMPT = `You are an advertising performance analyst for a multi-channel marketing platform.
Your job is to analyze structured marketing metrics and return actionable insights.

Rules:
- Return ONLY valid JSON matching the exact schema below. No markdown, no code fences.
- Never hallucinate or invent data that was not provided.
- Keep each string under 200 characters.
- Be specific and reference actual numbers from the data.
- Provide 1-3 items per array.

Required JSON schema:
{
  "summary": "One paragraph overview of performance",
  "risks": ["risk1", "risk2"],
  "opportunities": ["opp1", "opp2"],
  "recommendations": ["rec1", "rec2"]
}`;

function buildUserPrompt(metrics: BusinessMetricsSummary): string {
  const parts = [
    `Business: ${metrics.businessName}`,
    `Date: ${metrics.date}`,
    `Currency: ${metrics.currency}`,
    "",
    "=== Overall Metrics ===",
    `Total Spend: ${metrics.metrics.totalSpend.toFixed(2)}`,
    `Total Revenue: ${metrics.metrics.totalRevenue.toFixed(2)}`,
    `ROAS: ${metrics.metrics.roas.toFixed(2)}`,
    `Total Purchases: ${metrics.metrics.totalPurchases}`,
    `CPA: ${metrics.metrics.cpa.toFixed(2)}`,
    `CTR: ${metrics.metrics.ctr.toFixed(2)}%`,
  ];

  const channelEntries = Object.entries(metrics.channels);
  if (channelEntries.length > 0) {
    parts.push("", "=== Channel Breakdown ===");
    for (const [channel, data] of channelEntries) {
      parts.push(
        `${channel}: spend=${data.spend.toFixed(2)}, revenue=${data.revenue.toFixed(2)}, roas=${data.roas.toFixed(2)}, purchases=${data.purchases}, cpa=${data.cpa.toFixed(2)}`,
      );
    }
  }

  if (metrics.trends7d.length > 0) {
    parts.push("", "=== 7-Day Trend ===");
    for (const day of metrics.trends7d) {
      parts.push(
        `${day.label}: spend=${day.spend.toFixed(2)}, revenue=${day.revenue.toFixed(2)}, purchases=${day.purchases}`,
      );
    }
  }

  if (metrics.topWinners.length > 0) {
    parts.push("", "=== Top Winners (by ROAS) ===");
    for (const w of metrics.topWinners.slice(0, 5)) {
      parts.push(
        `${w.name}: roas=${w.roas.toFixed(2)}, spend=${w.spend.toFixed(2)}`,
      );
    }
  }

  if (metrics.topLosers.length > 0) {
    parts.push("", "=== Top Losers (by ROAS) ===");
    for (const l of metrics.topLosers.slice(0, 5)) {
      parts.push(
        `${l.name}: roas=${l.roas.toFixed(2)}, spend=${l.spend.toFixed(2)}`,
      );
    }
  }

  parts.push("", "Analyze the above data and return the JSON insight.");
  return parts.join("\n");
}

/**
 * Send summarized business metrics to OpenAI and get structured insights.
 * AI is READ-ONLY — it never accesses the database or external APIs.
 */
export async function generateDailyInsights(
  metrics: BusinessMetricsSummary,
): Promise<{ insight: AiDailyInsight; raw: unknown }> {
  const openai = getOpenAI();

  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    temperature: 0.3,
    max_tokens: 1024,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(metrics) },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned an empty response.");
  }

  const parsed = JSON.parse(content) as AiDailyInsight;

  // Validate expected shape
  if (
    typeof parsed.summary !== "string" ||
    !Array.isArray(parsed.risks) ||
    !Array.isArray(parsed.opportunities) ||
    !Array.isArray(parsed.recommendations)
  ) {
    throw new Error("OpenAI response does not match expected JSON schema.");
  }

  return { insight: parsed, raw: parsed };
}
