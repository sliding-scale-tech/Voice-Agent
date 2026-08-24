/**
 * Phone normalization, used as the identity key for matching a caller against the resident
 * roster. Plain TypeScript with no Convex imports so pages can import it too, the same way
 * app/settings/page.tsx imports RUBRIC from leadScoring.
 *
 * Why the last 10 digits rather than full E.164: the two phone fields already in this schema
 * disagree about format. conversations.callerNumber is E.164 straight from telephony
 * (+15551234567), while qualifications.callerPhone is whatever the caller *spoke aloud* and
 * the ASR transcribed ("555 123 4567"). Comparing the last 10 digits is the only rule that
 * survives both, and it also survives the +92 numbers this deployment uses.
 *
 * The trade-off: two numbers in different countries sharing their last 10 digits would
 * collide. Acceptable for a single-property dashboard; revisit if this ever goes multi-tenant.
 */

/** Digits only, last 10, or undefined if there aren't enough digits to be a phone number. */
export function normalizePhone(input?: string | null): string | undefined {
  if (!input) return undefined;

  let digits = input.replace(/\D/g, "");
  // International dialing prefix — "0044..." and "+44..." should normalize alike.
  if (digits.startsWith("00")) digits = digits.slice(2);

  // Guards against the agent putting something that isn't a phone number into a phone field
  // ("unit 4B", "extension 12"). Better to return no match than a wrong one.
  if (digits.length < 7) return undefined;

  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** True only when both inputs normalize to the same real number. */
export function samePhone(a?: string | null, b?: string | null): boolean {
  const left = normalizePhone(a);
  const right = normalizePhone(b);
  return left !== undefined && left === right;
}
