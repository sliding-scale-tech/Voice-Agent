/**
 * Thin wrapper over the Resend REST API — same shape as elevenLabsApi.ts's request() helper.
 * Used only for the landing page's "send me the transcript" ask (see convex/transcriptEmail.ts);
 * nothing else in this codebase sends email.
 */

const BASE = "https://api.resend.com";

function apiKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key?.trim()) {
    throw new Error("Missing RESEND_API_KEY. Set it with: npx convex env set RESEND_API_KEY <key>");
  }
  return key;
}

// The only domain verified on this Resend account. Sending "from" an unverified domain gets
// silently rejected or spam-foldered by most providers, so this can't default to something
// guessed — update it here if the account's verified domain ever changes.
const FROM_ADDRESS = "LeaseOps <no-reply@slidingscale.xyz>";

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const res = await fetch(`${BASE}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: input.to,
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    // Surface Resend's own message verbatim — e.g. "invalid `to` field" is more useful than
    // anything synthesised here.
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 500)}`);
  }
}
