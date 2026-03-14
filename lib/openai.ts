import OpenAI from "openai";

/**
 * Server-only singleton OpenAI client.
 * Uses OPENAI_API_KEY from environment variables.
 */
function createOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set in environment variables.");
  }
  return new OpenAI({ apiKey });
}

const globalStore = globalThis as typeof globalThis & {
  __openaiClient?: OpenAI;
};

export function getOpenAI(): OpenAI {
  if (!globalStore.__openaiClient) {
    globalStore.__openaiClient = createOpenAIClient();
  }
  return globalStore.__openaiClient;
}
