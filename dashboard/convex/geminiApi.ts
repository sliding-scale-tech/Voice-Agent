/**
 * Thin fetch wrapper over the Gemini API, mirroring the style of elevenLabsApi.ts and
 * twilioApi.ts — no SDK, runs on Convex's default runtime. Verified live against a real key
 * (gemini-2.5-flash, generateContent) on 2026-07-30.
 */

const MODEL = "gemini-2.5-flash";

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("Missing GEMINI_API_KEY. Set it with: npx convex env set GEMINI_API_KEY <key>");
  }
  return key;
}

export type SmsReplyDecision = {
  canAnswer: boolean;
  reply: string;
  escalationReason?: string;
};

const REPLY_SCHEMA = {
  type: "object",
  properties: {
    can_answer: { type: "boolean" },
    reply: { type: "string" },
    escalation_reason: { type: "string" },
  },
  required: ["can_answer", "reply"],
};

/**
 * Structured-output call so escalation is a reliable boolean the code branches on, not
 * something guessed from free text. If Gemini's response fails to parse as the expected
 * shape, the safe default is to escalate rather than silently drop the message.
 */
export async function generateSmsReply(
  systemContext: string,
  history: Array<{ sender: "customer" | "bot" | "staff"; text: string }>,
): Promise<SmsReplyDecision> {
  const contents = history.map((m) => ({
    role: m.sender === "customer" ? "user" : "model",
    parts: [{ text: m.text }],
  }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemContext }] },
        contents,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: REPLY_SCHEMA,
        },
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini ${res.status}: ${detail.slice(0, 500)}`);
  }

  const data = await res.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return { canAnswer: false, reply: "", escalationReason: "empty model response" };
  }

  try {
    const parsed = JSON.parse(text);
    return {
      canAnswer: Boolean(parsed.can_answer),
      reply: typeof parsed.reply === "string" ? parsed.reply : "",
      escalationReason: parsed.escalation_reason,
    };
  } catch {
    return { canAnswer: false, reply: "", escalationReason: "unparseable model response" };
  }
}
