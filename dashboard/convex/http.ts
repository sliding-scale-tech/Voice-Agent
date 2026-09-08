import { httpRouter, type GenericActionCtx } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { DataModel, Id } from "./_generated/dataModel";
import { clampSeverity } from "./severity";
import { evaluateQualification } from "./qualifyRules";
import * as waha from "./wahaApi";
import { realPhone } from "./sanitize";
import { handleClerkWebhook } from "./clerkWebhook";

const http = httpRouter();

/**
 * Resolves which user a mid-call tool request belongs to, from the ElevenLabs conversation id
 * every tool call carries. Returns undefined whenever it can't yet be resolved — the public
 * landing-page demo, or a phone call whose Convex conversations row hasn't been created yet
 * (see conversations.ownerByElevenLabsId) — and every caller below already falls back to the
 * pre-multi-tenancy default in that case, exactly as this codebase behaved before.
 */
async function resolveOwner(
  ctx: GenericActionCtx<DataModel>,
  conversationId: string | undefined,
): Promise<Id<"users"> | undefined> {
  if (!conversationId) return undefined;
  // Convex queries can't return `undefined` over the wire — a query handler returning it comes
  // back as `null` here, so this normalizes back to `undefined` for the rest of this file.
  const userId = await ctx.runQuery(internal.conversations.ownerByElevenLabsId, {
    elevenLabsConversationId: conversationId,
  });
  return userId ?? undefined;
}

// Clerk → Convex user sync. Endpoint configured in the Clerk dashboard as
// https://<deployment>.convex.site/auth
http.route({
  path: "/auth",
  method: "POST",
  handler: httpAction(handleClerkWebhook),
});

// --- Server tools (webhooks the ElevenLabs agent calls mid-conversation) --

/**
 * A lightweight, no-capture lookup so the agent can answer a standalone question like
 * "what's the rent for a 2BR?" at any point in the call, without first needing all five
 * qualification fields. check_qualification (below) is the one that captures a lead and
 * makes the qualify/disqualify decision — this tool never does either.
 */
http.route({
  path: "/tools/check-availability",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const bedrooms: string | undefined = body.bedrooms;
    const conversationId: string | undefined = body.conversation_id;

    const userId = await resolveOwner(ctx, conversationId);
    const property = await ctx.runQuery(internal.properties.currentInternal, { userId });
    const unit = bedrooms
      ? property.units.find((u: { bedrooms: string }) => u.bedrooms === bedrooms)
      : undefined;

    return Response.json({
      property_name: property.name,
      pets_allowed: property.petsAllowed,
      move_in_window_days: property.moveInWindowDays,
      requested_unit: unit
        ? { bedrooms: unit.bedrooms, rent_min: unit.rentMin, rent_max: unit.rentMax, available: unit.available }
        : null,
      all_units: property.units.map((u: { bedrooms: string; rentMin: number; rentMax: number; available: boolean }) => ({
        bedrooms: u.bedrooms,
        rent_min: u.rentMin,
        rent_max: u.rentMax,
        available: u.available,
      })),
    });
  }),
});

/**
 * The agent has gathered the five qualification fields; apply the property's actual rules
 * and tell it whether to offer a tour. Deterministic on purpose — this is the fair-housing
 * boundary (PRD §8): the model never decides qualification, this code does.
 */
http.route({
  path: "/tools/check-qualification",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const {
      conversation_id: conversationId,
      bedrooms,
      move_in_date: moveInDate,
      budget,
      pets_wanted: petsWanted,
      pet_type: petType,
      caller_name: callerName,
      caller_phone: callerPhone,
    } = body;

    if (!conversationId) {
      return Response.json({ error: "missing conversation_id" }, { status: 400 });
    }

    const userId = await resolveOwner(ctx, conversationId);
    const property = await ctx.runQuery(internal.properties.currentInternal, { userId });

    // Shared with the WhatsApp bot on purpose — see convex/qualifyRules.ts. Two copies of
    // this decision would let the same person be told "yes" on one channel and "no" on the
    // other.
    const { qualifies, disqualifyReason } = evaluateQualification(property, {
      bedrooms,
      budget: typeof budget === "number" ? budget : undefined,
      petsWanted: typeof petsWanted === "boolean" ? petsWanted : undefined,
    });

    await ctx.runMutation(internal.qualifications.upsertByConversationId, {
      elevenLabsConversationId: conversationId,
      bedrooms,
      moveInDate,
      budget: typeof budget === "number" ? budget : undefined,
      petsWanted: typeof petsWanted === "boolean" ? petsWanted : undefined,
      petType,
      callerName,
      callerPhone,
      qualifies,
      disqualifyReason,
    });

    return Response.json({
      qualifies,
      reason: disqualifyReason ?? null,
      property_name: property.name,
      available_units: property.units
        .filter((u: { available: boolean }) => u.available)
        .map((u: { bedrooms: string; rentMin: number; rentMax: number }) => ({
          bedrooms: u.bedrooms,
          rent_min: u.rentMin,
          rent_max: u.rentMax,
        })),
    });
  }),
});

/**
 * Captures a preferred tour slot for a qualified caller and sends an SMS confirmation.
 * There is no real calendar behind this yet — it is "captured and confirmed," not an actual
 * calendar write. Known, explicit v1 gap (see spec).
 */
http.route({
  path: "/tools/request-tour",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const {
      conversation_id: conversationId,
      preferred_slot: preferredSlot,
      caller_name: callerName,
      caller_phone: callerPhone,
    } = body;

    if (!conversationId || !preferredSlot || !callerPhone) {
      return Response.json(
        { error: "missing conversation_id, preferred_slot, or caller_phone" },
        { status: 400 },
      );
    }

    await ctx.runMutation(internal.qualifications.upsertByConversationId, {
      elevenLabsConversationId: conversationId,
      callerName,
      callerPhone,
      tourSlot: preferredSlot,
      tourConfirmed: true,
    });

    // Disabled: tour confirmation SMS to the customer — turned off per request. The tour is
    // still captured above and visible in the dashboard; only the outbound text is skipped.
    // Re-enable by uncommenting this block (and the property lookup it needs).
    // const property = await ctx.runQuery(internal.properties.currentInternal, {});
    const smsSent = false;
    try {
      // await ctx.runAction(internal.notifications.sendTourConfirmation, {
      //   to: callerPhone,
      //   propertyName: property.name,
      //   slot: preferredSlot,
      // });
    } catch {
      // The tour is still captured even if the SMS fails to send — the agent should not
      // tell the caller the request failed over a texting problem.
    }

    return Response.json({ confirmed: true, sms_sent: smsSent });
  }),
});

/**
 * Hands the call to a human: texts the on-call staff number with the reason and a short
 * summary, and marks the call so it's unmissable in the dashboard.
 */
http.route({
  path: "/tools/escalate",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const {
      conversation_id: conversationId,
      reason,
      summary,
      caller_name: callerName,
      caller_phone: callerPhone,
      living_area: livingArea,
    } = body;

    if (!conversationId || !reason) {
      return Response.json({ error: "missing conversation_id or reason" }, { status: 400 });
    }

    const fullSummary = [
      summary ?? "",
      callerName ? `Name: ${callerName}.` : "",
      callerPhone ? `Phone: ${callerPhone}.` : "",
      livingArea ? `Area: ${livingArea}.` : "",
    ]
      .filter(Boolean)
      .join(" ");

    // Disabled: SMS alert to staff on escalation — turned off per request. The dashboard still
    // marks the call as escalated below; only the outbound text is skipped. Re-enable by
    // uncommenting this block.
    const staffNumber = await ctx.runQuery(internal.orgSettings.staffPhoneNumberInternal, {});
    const notified = false;
    if (staffNumber) {
      try {
        // await ctx.runAction(internal.notifications.sendEscalationAlert, {
        //   to: staffNumber,
        //   reason,
        //   summary: fullSummary,
        //   callerPhone: callerPhone ?? "unknown",
        // });
        // notified = true;
      } catch {
        // Logged via the dashboard regardless; SMS delivery failure shouldn't break the call.
      }
    }

    await ctx.runMutation(internal.qualifications.upsertByConversationId, {
      elevenLabsConversationId: conversationId,
      callerName,
      callerPhone,
    });
    await ctx.runMutation(internal.conversations.markEscalation, {
      elevenLabsConversationId: conversationId,
      reason,
      summary: fullSummary,
      escalatedTo: notified ? staffNumber! : "unassigned",
    });

    return Response.json({ escalated: true, staff_notified: notified });
  }),
});

// --- Resident triage ------------------------------------------------------

/**
 * Records that a resident called, why, and how bad it is. Nothing is verified and nothing is
 * matched against a roster — the name and unit are stored exactly as the caller gave them.
 *
 * Unlike check_qualification, the severity here is the model's judgment rather than a
 * deterministic rule — triage has to weigh what the caller describes. clampSeverity is the
 * guard on that trust, and staff can override the score on the Tenants page with the
 * original preserved.
 *
 * Deliberately sends no SMS: the product decision is to store and surface, and the existing
 * escalation alert stays commented out rather than gaining a second notification path here.
 */
http.route({
  path: "/tools/log-tenant-issue",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const {
      conversation_id: conversationId,
      caller_id: callerId,
      caller_name: callerName,
      unit,
      caller_phone: callerPhone,
      reason,
      category,
      severity,
      severity_reason: severityReason,
    } = body;

    if (!conversationId || !reason) {
      return Response.json({ error: "missing conversation_id or reason" }, { status: 400 });
    }

    // Kept apart rather than collapsed into one field. The telephony number is always
    // correct; a spoken one is what they actually want to be called back on but goes through
    // ASR, so digits get misheard. On a browser call there is no telephony leg at all, and
    // the spoken number is the only number we will ever have.
    const telephony = realPhone(callerId);
    const spoken = realPhone(callerPhone);

    const clamped = clampSeverity(severity);

    await ctx.runMutation(internal.tenants.logIssue, {
      elevenLabsConversationId: conversationId,
      callerName,
      unit,
      callerNumber: telephony ?? spoken,
      callbackNumber: spoken,
      reason,
      category,
      severity: clamped,
      severityReason,
    });

    await ctx.runMutation(internal.conversations.markTenantIssue, {
      elevenLabsConversationId: conversationId,
      reason,
      severity: clamped,
      callerNumber: telephony ?? spoken,
    });

    return Response.json({ logged: true, severity: clamped });
  }),
});

// --- WhatsApp (WAHA) ------------------------------------------------------

/**
 * Inbound WhatsApp messages from self-hosted WAHA.
 *
 * WAHA is configured to send our own WAHA_API_KEY back as X-Api-Key (see wahaApi.startSession).
 * Without that check anyone who knows this deployment's URL could inject fake WhatsApp
 * messages into the inbox, and the bot would answer them.
 *
 * The payload is parsed defensively: WAHA's engines (GOWS/WEBJS/NOWEB) do not agree on
 * shape, so an unrecognised body is logged in full rather than dropped silently. See
 * infra/waha/README.md.
 */
http.route({
  path: "/wa/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const expected = process.env.WAHA_API_KEY;
    if (!expected || request.headers.get("x-api-key") !== expected) {
      return new Response("unauthorized", { status: 401 });
    }

    const raw = await request.text();

    let payload: {
      event?: string;
      session?: string;
      payload?: { from?: string; body?: string; fromMe?: boolean };
    };
    try {
      payload = JSON.parse(raw);
    } catch {
      console.error("[wa webhook] invalid JSON:", raw.slice(0, 500));
      return new Response("bad request", { status: 400 });
    }

    // Our own outgoing messages echo back through the webhook. Without this the bot
    // replies to itself, forever.
    if (payload.event !== "message" || payload.payload?.fromMe) {
      return new Response(null, { status: 200 });
    }

    const from = payload.payload?.from;
    const text = payload.payload?.body;
    if (!from || !text) {
      console.error(
        `[wa webhook] unrecognized payload shape: ${JSON.stringify(payload).slice(0, 1000)}`,
      );
      return new Response(null, { status: 200 });
    }

    // WhatsApp is moving to LID identifiers, so `from` can be "123@lid" rather than a phone
    // number. Resolve it when we can. When we cannot, keep the FULL JID as the chat id — a
    // bare LID with "@c.us" appended is undeliverable, so replies would vanish silently.
    let chatId = from.replace(/@.*/, "");
    let displayName = `+${chatId}`;
    if (from.endsWith("@lid")) {
      const resolved = await waha.resolveLid(from);
      if (resolved) {
        chatId = resolved;
        displayName = `+${resolved}`;
      } else {
        chatId = from;
        displayName = from;
      }
    }

    await ctx.runMutation(internal.waBot.ingestInbound, { chatId, displayName, text });

    return new Response(null, { status: 200 });
  }),
});

// --- Inbound SMS / WhatsApp (Twilio "A message comes in" webhooks) --------

/**
 * Twilio POSTs form-encoded fields, not JSON. Returns empty TwiML so Twilio doesn't also send
 * its own auto-reply — every outbound message goes through our own Twilio REST API call
 * instead, so the bot and staff replies are the only things that ever get texted back.
 * Shared by both the SMS number's webhook and the WhatsApp Sandbox's webhook.
 */
async function handleInboundMessage(
  ctx: GenericActionCtx<DataModel>,
  request: Request,
  channel: "sms" | "whatsapp",
): Promise<Response> {
  const form = new URLSearchParams(await request.text());
  const from = form.get("From")?.replace(/^whatsapp:/, "");
  const body = form.get("Body");
  const sid = form.get("MessageSid") ?? undefined;

  if (from && body) {
    await ctx.runMutation(internal.threads.ingestInbound, {
      channel,
      customerPhone: from,
      text: body,
      twilioSid: sid,
    });
  }

  return new Response("<Response></Response>", {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

http.route({
  path: "/webhooks/twilio/sms",
  method: "POST",
  handler: httpAction((ctx, request) => handleInboundMessage(ctx, request, "sms")),
});

http.route({
  path: "/webhooks/twilio/whatsapp",
  method: "POST",
  handler: httpAction((ctx, request) => handleInboundMessage(ctx, request, "whatsapp")),
});

// --- Post-call webhook -----------------------------------------------------

/**
 * Fires when ElevenLabs finishes processing a call — the only path phone calls have into the
 * dashboard, since there is no browser to stream a live transcript from. Also reconciles
 * browser calls (already logged live) by conversation id rather than duplicating them.
 *
 * HMAC verification against ELEVENLABS_POST_CALL_WEBHOOK_SECRET — exact header name to be
 * confirmed against a real fired webhook once configured in the ElevenLabs dashboard.
 */
http.route({
  path: "/webhooks/elevenlabs/post-call",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = process.env.ELEVENLABS_POST_CALL_WEBHOOK_SECRET;
    const signature = request.headers.get("ElevenLabs-Signature");
    const rawBody = await request.text();

    // Temporary — see debugWebhookLogs in schema.ts. Captures the real payload shape so the
    // parser in ingestFromWebhook can be corrected against actual data instead of guesses.
    await ctx.runMutation(internal.conversations.logDebugWebhook, { body: rawBody });

    if (secret && signature) {
      const valid = await verifyHmacSignature(rawBody, signature, secret);
      if (!valid) return new Response("invalid signature", { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    await ctx.runMutation(internal.conversations.ingestFromWebhook, { payload });

    return new Response("ok", { status: 200 });
  }),
});

async function verifyHmacSignature(
  body: string,
  header: string,
  secret: string,
): Promise<boolean> {
  // ElevenLabs' documented format is "t=<timestamp>,v0=<hex hmac-sha256 of `${timestamp}.${body}`>".
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k, v];
    }),
  );
  const timestamp = parts.t;
  const providedSig = parts.v0;
  if (!timestamp || !providedSig) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const computedHex = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computedHex === providedSig;
}

export default http;
