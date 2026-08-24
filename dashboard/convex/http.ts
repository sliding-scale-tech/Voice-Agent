import { httpRouter, type GenericActionCtx } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { normalizePhone } from "./phone";
import { clampSeverity } from "./severity";

const http = httpRouter();

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

    const property = await ctx.runQuery(internal.properties.currentInternal, {});
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

    const property = await ctx.runQuery(internal.properties.currentInternal, {});
    const unit = property.units.find((u: { bedrooms: string }) => u.bedrooms === bedrooms);

    let qualifies = true;
    let disqualifyReason: string | undefined;

    if (!unit || !unit.available) {
      qualifies = false;
      disqualifyReason = `No available ${bedrooms} units right now.`;
    } else if (typeof budget === "number" && budget < unit.rentMin) {
      qualifies = false;
      disqualifyReason = `Rent for a ${bedrooms} starts at $${unit.rentMin}, above the stated budget.`;
    } else if (petsWanted === true && !property.petsAllowed) {
      qualifies = false;
      disqualifyReason = `${property.name} does not allow pets.`;
    }

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
 * Answers "is this number already on the resident roster?" so the agent can greet a known
 * resident by name instead of interrogating them.
 *
 * caller_id is bound to ElevenLabs' system__caller_id dynamic variable and is absent on
 * browser/WebRTC calls, where there is no telephony leg at all. A miss is a completely normal
 * result, not an error — this route must never 400 on a missing number, or the agent ends up
 * apologising to the caller for a failure that didn't happen.
 */
http.route({
  path: "/tools/lookup-tenant",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.json();
    const { conversation_id: conversationId, caller_id: callerId } = body;

    if (!conversationId) {
      return Response.json({ error: "missing conversation_id" }, { status: 400 });
    }

    const normalized = normalizePhone(callerId);
    const tenant = normalized
      ? await ctx.runQuery(internal.tenants.findByPhoneInternal, {
          phoneNormalized: normalized,
        })
      : null;

    return Response.json({
      is_known_tenant: Boolean(tenant),
      tenant_name: tenant?.name ?? null,
      unit: tenant?.unit ?? null,
      // Always true. Caller ID identifies a phone, not a person — households and roommates
      // share numbers, so the agent confirms the name out loud either way.
      needs_verification: true,
      caller_id_available: Boolean(normalized),
    });
  }),
});

/**
 * Records that an existing resident called, why, and how bad it is.
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

    // Telephony's number beats a spoken one: the caller reciting digits is the lossier path.
    const phone = callerId?.trim() || callerPhone?.trim() || undefined;
    const identifiedBy = callerId?.trim() ? ("caller_id" as const) : ("self_reported" as const);

    const tenantId = await ctx.runMutation(internal.tenants.upsertFromCall, {
      name: callerName,
      unit,
      phone,
      identifiedBy,
    });

    const clamped = clampSeverity(severity);

    await ctx.runMutation(internal.tenants.logIssue, {
      elevenLabsConversationId: conversationId,
      tenantId: tenantId ?? undefined,
      callerName,
      unit,
      callerNumber: phone,
      reason,
      category,
      severity: clamped,
      severityReason,
    });

    await ctx.runMutation(internal.conversations.markTenantIssue, {
      elevenLabsConversationId: conversationId,
      reason,
      severity: clamped,
      callerNumber: phone,
    });

    return Response.json({ logged: true, severity: clamped });
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
