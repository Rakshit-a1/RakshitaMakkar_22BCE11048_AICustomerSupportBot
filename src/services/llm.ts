import { GoogleGenerativeAI } from "@google/generative-ai";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface LLMService {
  generate(
    messages: ChatMessage[],
    opts?: { temperature?: number }
  ): Promise<string>;
  summarize(messages: ChatMessage[]): Promise<string>;
  suggestNextActions(messages: ChatMessage[]): Promise<string[]>;
}

export function createLLM(): LLMService {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for createLLM");
  const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });
  // Surface Gemini errors directly to the caller; do not fallback to a mock LLM.

  return {
    async generate(messages, opts) {
      try {
        // Gemini expects roles 'user' and 'model'. Map 'assistant'->'model', 'system'->'user'.
        const contents = messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));
        const res = await model.generateContent({
          contents,
          generationConfig: { temperature: opts?.temperature ?? 0.2 },
        });
        return res.response.text();
      } catch (err) {
        console.error("Gemini generate error, propagating:", err);
        throw err;
      }
    },
    async summarize(messages) {
      const system: ChatMessage = {
        role: "system",
        content:
          "Summarize the conversation in 2-3 bullet points, concise and actionable.",
      };
      return this.generate([system, ...messages]);
    },
    async suggestNextActions(messages) {
      const system: ChatMessage = {
        role: "system",
        content:
          "List 3 short next best actions for the agent, as a JSON array of strings.",
      };
      const raw = await this.generate([system, ...messages], {
        temperature: 0.3,
      });
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.slice(0, 5).map(String);
      } catch {}
      return raw
        .split(/\n|\d+\.|-|•/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3);
    },
  };
}

// No mock LLM: Gemini API key is required and errors are propagated.
