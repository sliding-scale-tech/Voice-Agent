import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import * as el from "./elevenLabsApi";
import { SEVERITY_RUBRIC } from "./severity";

// Jessica — premade, American, female, "conversational" use case. Premade rather than a
// professional clone on purpose: a PVC run at the wrong similarity_boost is what made the
// previous voice sound uncanny, and premade voices track model upgrades.
const DEFAULT_VOICE_ID = "cgSgspJ2msm6clMCkdW9";

/**
 * Voice and turn-taking settings live here rather than in the agents table on purpose: they
 * are product decisions, not per-user settings, and keeping them in code is what stops them
 * drifting in the ElevenLabs dashboard. The audit behind these numbers, including the
 * latency trade-offs, is in docs/voice-quality-research.md.
 */
const VOICE_TUNING: el.VoiceTuning = {
  // Measured time-to-first-audio on 2026-08-23, 5 interleaved runs each:
  //   eleven_flash_v2_5        0.687s
  //   eleven_flash_v2          0.717s  (what we ran before; slower AND older)
  //   eleven_v3_conversational 0.872s  <- chosen
  // The +185ms was accepted deliberately after an A/B listen: this is the only model that
  // supports expressive mode, and the difference in warmth was audible enough to pay for.
  // Drop to "eleven_flash_v2_5" with expressiveMode: false to buy that time back.
  modelId: "eleven_v3_conversational",
  // 0.40–0.50 is the documented conversational band: dynamic delivery without the
  // instability of going lower. 0.60+ is where voices start sounding monotonous.
  stability: 0.45,
  // The premade-voice default. Pushing this higher chases the source recording at the
  // cost of audible distortion artifacts.
  similarityBoost: 0.75,
  speed: 1.0,
  // The reason we are on eleven_v3_conversational at all.
  expressiveMode: true,
};

const TURN_TUNING: el.TurnTuning = {
  // 7s cut callers off while they worked out a budget or a move-in date.
  turnTimeout: 10,
  // The qualification flow collects a name and a callback number digit by digit, which is
  // the documented case for "patient" — "eager" clips people mid-number.
  eagerness: "patient",
  softTimeoutSeconds: 3,
  fillerMessages: ["Just a sec…", "One moment…", "Let me pull that up…"],
  interruptionIgnoreTerms: [
    "okay",
    "ok",
    "mm-hmm",
    "uh-huh",
    "yeah",
    "yep",
    "right",
    "sure",
    "got it",
  ],
};

/**
 * The resident-triage instructions, exported so the Settings page can append them to a prompt
 * that has already been hand-edited. The severity bands are generated from SEVERITY_RUBRIC so
 * the agent and the Tenants page can never disagree about what a 7 means.
 *
 * The first line matters: a customized prompt in the database may still carry the old
 * "escalate every existing tenant issue" instruction, and this block has to win.
 */
export const RESIDENT_TRIAGE_BLOCK = `RESIDENT CALLS:
This section supersedes any earlier instruction to escalate resident issues directly.

Once you know you're talking to a current resident, don't run the leasing questions. Get
four things IN THIS ORDER, and get all four before you log anything: their name, their unit,
the best number to call them back on, and one plain sentence on what's wrong. If they lead
with the problem, say you'll get it logged, then ask "Can I get your name, your unit number,
and the best number to reach you on?" and wait for the answer.

Always ask for the callback number, even when they are already on the phone — the number
they are calling from is often not the one they want to be reached on. Read it back to them
digit by digit to confirm you heard it right, then pass it as caller_phone. If they say to
just use the number they are calling from, that is fine — say so and move on, and leave
caller_phone out rather than guessing at digits.

Do not call log_tenant_issue until you actually have the name, the unit and the callback
number. Never pass "unknown" or a made-up value to satisfy the tool — leave a field out
instead. If you only find something out after you have already logged it, call
log_tenant_issue again with the full details; the second call updates the same record rather
than creating a new one.

Never tell the caller you have recorded their name, unit or number unless you have actually
called log_tenant_issue with it.

Call log_tenant_issue with a severity from 1 to 10:
${SEVERITY_RUBRIC.map((r) => `${r.band} ${r.label} — ${r.detail}`).join("\n")}

Score the issue, never the caller. A calm person with no heat is a 9; someone furious about a
parking space is still a 3. If two things are wrong, score the worse one. If you're between
two bands, take the lower one. Never say the number out loud — it's for staff, not the caller.

Score what is still wrong, not what caused it. If the cause has passed but the problem is
still happening — the cooking smoke cleared but the alarm is still sounding — score the thing
that is still happening. A resolved cause does not make a live problem routine.

If severity is 8 or higher, call log_tenant_issue first, then escalate, then tell them someone
will call them back shortly. Below 8, tell them it's logged and someone will follow up, then
close the call. Never try to troubleshoot a repair yourself.`;

const LEASING_PROMPT = `You are Emily, the leasing receptionist for Maple Court Apartments, answering by phone or
voice chat, 24/7. You are warm, brief, and efficient — the way a good in-person leasing
agent sounds on a phone call, not a chatbot. Introduce yourself by name only in your first
message, not repeatedly. Never mention that you are AI unless directly asked; if asked
directly, say so honestly and keep going.

CURRENT DATE AND TIME: {{system__time_utc}}
Use this whenever dates come up. If someone says "Thursday," work out the actual calendar
date from the current date and say it back to them ("Thursday the 6th"), and confirm the
real date when booking a tour. Never claim you don't know what today's date is.

YOUR JOB, IN ORDER:
0. If someone asks a standalone question about rent, availability, or pet policy at any
   point — even before you've gathered anything else — call check_availability and answer
   from that. It never captures a lead or decides qualification, it's just a lookup.
1. Figure out why they're calling.
1a. Existing resident or prospect? If they say or imply they already live here — "my
   apartment," "my unit," "the heat's out" — treat them as a resident straight away and don't
   ask. Only if you genuinely can't tell, ask once: "Are you a current resident with us?"
   Take their answer at face value; there is nothing to check it against. If they are a
   resident, get their name and unit, then follow the RESIDENT CALLS section below instead of
   the leasing steps.
2. If it's a leasing inquiry, gather exactly five things — no more, no fewer — before
   deciding anything: unit type/bedroom count wanted, move-in timeline, budget range,
   whether they have pets (and what kind, if yes), and their name plus a callback number.
   Ask for these conversationally, one or two at a time, not as an interrogation. If they
   already told you one in passing, don't ask again.
3. Once you have all five, call check_qualification with exactly those fields. Do not
   guess or estimate any of them yourself — the tool applies the actual property rules.
4. Speak the tool's result plainly. If it says qualified, offer to book a tour. If it says
   disqualified, say so clearly and kindly, state the real reason (e.g. "this building
   doesn't allow pets" or "our lowest rent is above your budget"), and do NOT offer a tour
   you already know will be rejected — that is the one thing you must never do, it breaks
   trust with the property manager.
5. If qualified and they want a tour, ask for a preferred day and time, then call
   request_tour with that plus their name and callback number. Tell them a confirmation
   text is on its way.
6. Once the reason for the call is resolved — a tour is booked, a disqualification and
   alternative has been given, or you've handed off with escalate — the call is done. Ask
   one time, "Is there anything else I can help with?" If no, say a short, warm goodbye and
   end the call yourself right away using end_call. Do not keep talking, recap what already
   happened, or wait for them to hang up first — a call that has done its job should end
   promptly, not linger.

PACING:
Move at a natural, brisk pace. Once you have a piece of information, use it and move on —
don't repeat it back for confirmation unless you genuinely didn't catch it. Don't re-explain
things you've already said. The call should feel like it's clearly moving toward a resolution
from the first question onward, not meandering — every turn should either be gathering
something you still need or acting on what you already have.

WHAT YOU NEVER DECIDE YOURSELF:
Qualification is based only on these five fields: unit type, move-in timeline, budget,
pets, and contact info. Nothing else — not how someone sounds, their name, their accent,
anything they mention about themselves — ever factors into whether they qualify. If you
are ever unsure whether someone qualifies, that is what check_qualification is for. Never
make that call on your own judgment.

WHEN TO ESCALATE — call the escalate tool, don't try to handle it yourself:
- They ask to speak to a human, and you haven't already tried once to help — the second
  time they ask, escalate immediately, no more attempts.
- An existing resident's issue that you scored 8 or higher: always call log_tenant_issue
  first, then escalate. Below 8, log it and close the call — don't escalate routine repairs.
- Anything that is neither a leasing inquiry nor a resident issue — "what's the WiFi speed in
  unit 4B," anything outside those two topics — say you'll have someone follow up, then
  escalate with a short note of what they asked. Never invent an answer to something you
  don't actually know.
- If 90 seconds have passed and you still can't tell why they're calling, escalate — don't
  keep guessing.
- If someone has a heavy accent or a bad connection and you've asked them to repeat
  themselves twice without understanding, stop trying a third time — escalate instead of
  looping.

Before calling escalate, quickly get their full name, a callback number, and their living
area or which unit this is about — ask for these directly ("Can I get your name and a
number to reach you, and which unit or area this is about?") rather than skipping it. Once
you've escalated, tell them plainly that someone will be in touch with them soon, then move
to closing the call.

${RESIDENT_TRIAGE_BLOCK}

WHEN THERE'S NO MATCH:
If nothing available matches what they asked for (wrong bedroom count, wrong timeframe),
don't just say no. Offer the closest available alternative, or offer to note their
interest for when something matching opens up. Always leave them with a next step.

TONE FOR VOICE:
Short sentences. No lists, no markdown, nothing that only makes sense written down. Confirm
you understood something before moving to the next question. Before checking availability,
qualification, or anything else that takes a moment, say a short natural phrase first —
"let me check that," "one sec, pulling that up," "give me just a moment" — never go silent
while you look something up.

WHAT YOU DO NOT DO:
Negotiate rent. Discuss lease terms or legal questions. Try to resolve a maintenance issue
yourself. Guess at facts you don't have. Speak a language other than English.`;

const DEFAULT_FIRST_MESSAGE =
  "Thanks for calling Maple Court Apartments, this is Emily! Are you calling about renting an apartment, or something else?";

// --- Reads ----------------------------------------------------------------

/** The dashboard is single-user, so there is exactly one agent row. */
export const current = query({
  args: {},
  handler: (ctx) => ctx.db.query("agents").first(),
});

export const currentInternal = internalQuery({
  args: {},
  handler: (ctx) => ctx.db.query("agents").first(),
});

export const voices = action({
  args: {},
  handler: async (): Promise<Array<{ voiceId: string; name: string }>> => {
    const { voices } = await el.listVoices();
    return voices.map((v) => ({ voiceId: v.voice_id, name: v.name }));
  },
});

// --- Server tools ------------------------------------------------------

const TOOL_DEFS = (siteUrl: string): el.ToolDefinition[] => [
  {
    name: "check_availability",
    description:
      "Looks up current rent and availability for a bedroom type, or the whole property, " +
      "with no lead capture and no qualification decision. Call this any time someone asks " +
      "a standalone question like 'what's the rent for a 2BR' or 'do you allow pets', even " +
      "before you've gathered the five qualification fields.",
    url: `${siteUrl}/tools/check-availability`,
    required: [],
    properties: {
      bedrooms: {
        type: "string",
        description:
          "The bedroom count asked about: 'studio', '1br', '2br', or '3br+'. Omit to get all units.",
      },
    },
  },
  {
    name: "check_qualification",
    description:
      "Checks a prospective tenant's stated bedrooms, budget, move-in date, and pet needs " +
      "against the property's real availability and rules. Call this once you have all five " +
      "qualification fields. Never decide qualification yourself.",
    url: `${siteUrl}/tools/check-qualification`,
    required: ["conversation_id", "bedrooms", "move_in_date", "budget", "pets_wanted", "caller_name", "caller_phone"],
    properties: {
      conversation_id: { type: "string", dynamicVariable: "system__conversation_id" },
      bedrooms: {
        type: "string",
        description: "The bedroom count they want: 'studio', '1br', '2br', or '3br+'.",
      },
      move_in_date: { type: "string", description: "When they want to move in, in their own words." },
      budget: { type: "number", description: "Their monthly budget in dollars." },
      pets_wanted: { type: "boolean", description: "Whether they have or plan to bring pets." },
      pet_type: { type: "string", description: "The kind of pet, if pets_wanted is true." },
      caller_name: { type: "string", description: "The caller's name." },
      caller_phone: { type: "string", description: "A callback number for the caller." },
    },
  },
  {
    name: "request_tour",
    description:
      "Captures a preferred tour day and time for a caller who has already qualified, and " +
      "sends them a confirmation text. Only call this after check_qualification returned " +
      "qualifies: true.",
    url: `${siteUrl}/tools/request-tour`,
    required: ["conversation_id", "preferred_slot", "caller_name", "caller_phone"],
    properties: {
      conversation_id: { type: "string", dynamicVariable: "system__conversation_id" },
      preferred_slot: { type: "string", description: "The day and time they'd like to tour." },
      caller_name: { type: "string", description: "The caller's name." },
      caller_phone: { type: "string", description: "Where to send the confirmation text." },
    },
  },
  {
    name: "escalate",
    description:
      "Hands the call off to a human staff member. Use for maintenance/urgent tenant issues, " +
      "requests to speak to a human (after one attempt to help), anything off-topic, or when " +
      "you can't identify why someone is calling after about 90 seconds. Always gather the " +
      "caller's name, callback number, and living area/address before calling this.",
    url: `${siteUrl}/tools/escalate`,
    required: ["conversation_id", "reason", "summary", "caller_name", "caller_phone", "living_area"],
    properties: {
      conversation_id: { type: "string", dynamicVariable: "system__conversation_id" },
      reason: {
        type: "string",
        description:
          "Why this call is being escalated: 'requested_human', 'urgent_tenant_issue', " +
          "'off_topic', or 'unclear_intent'.",
      },
      summary: { type: "string", description: "One short sentence a staff member can act on." },
      caller_name: { type: "string", description: "The caller's full name." },
      caller_phone: { type: "string", description: "A callback number for the caller." },
      living_area: {
        type: "string",
        description: "Where the caller currently lives or the area/unit they're calling about.",
      },
    },
  },
  {
    name: "log_tenant_issue",
    description:
      "Records that an existing resident called, why they called, and how severe it is on a " +
      "1-10 scale. Call this for every resident before you close the call, even for small " +
      "things. Ask for their name, unit and a callback number FIRST and pass them here — do " +
      "not call this with a " +
      "placeholder like 'unknown'. Safe to call more than once in the same call: a second call " +
      "updates the same record, so if you learn or correct anything afterwards, call it again " +
      "with the full details. Do not call it for people looking to rent — that is " +
      "check_qualification. If the severity is 8 or higher, call escalate as well.",
    url: `${siteUrl}/tools/log-tenant-issue`,
    // caller_name is deliberately NOT required. When it was, the agent satisfied the schema by
    // inventing "unknown" and calling the tool before it had actually asked — see the call on
    // 2026-08-24. Better an absent name we can fill in later than a fabricated one.
    required: ["conversation_id", "reason", "severity"],
    properties: {
      conversation_id: { type: "string", dynamicVariable: "system__conversation_id" },
      caller_id: { type: "string", dynamicVariable: "system__caller_id" },
      caller_name: {
        type: "string",
        description:
          "The resident's full name, exactly as they gave it. Never a placeholder such as " +
          "'unknown' or 'not provided' — if you don't have it yet, ask for it before calling this.",
      },
      unit: {
        type: "string",
        description:
          "Their unit or apartment number, e.g. '4B'. Ask for it before calling this rather " +
          "than leaving it out.",
      },
      caller_phone: {
        type: "string",
        description:
          "The callback number the resident gives you, as digits. Always ask for it, even on " +
          "a phone call — the number they are calling from is not always the one they want to " +
          "be reached on. Read it back to confirm before passing it here. Leave it out if they " +
          "decline; never invent one.",
      },
      reason: {
        type: "string",
        description:
          "One plain sentence: why they called, in their words. E.g. 'No hot water in the " +
          "shower since last night.'",
      },
      category: {
        type: "string",
        description: "One of: maintenance, billing, noise, lockout, lease, other.",
      },
      severity: {
        type: "number",
        description:
          "1-10 using the severity scale in your instructions. Judge the issue itself, never " +
          "how upset the caller sounds.",
      },
      severity_reason: {
        type: "string",
        description:
          "A few words on why that number, e.g. 'no hot water, unlivable but not dangerous'.",
      },
    },
  },
];

/**
 * Idempotently creates the server tools this agent needs, checking for existing tools
 * by name first so re-running (e.g. after a deploy) doesn't create duplicates.
 */
export const ensureTools = internalAction({
  args: {},
  handler: async (): Promise<string[]> => {
    const siteUrl = process.env.CONVEX_SITE_URL;
    if (!siteUrl) throw new Error("CONVEX_SITE_URL is not set on this deployment.");

    const { tools: existing } = await el.listTools();
    const defs = TOOL_DEFS(siteUrl);
    const ids: string[] = [];

    for (const def of defs) {
      const found = existing.find((t) => t.tool_config.name === def.name);
      if (found) {
        // Keeps tool_ids stable but re-syncs settings like pre_tool_speech onto tools that
        // already existed before that field was added.
        await el.updateTool(found.id, def);
        ids.push(found.id);
        continue;
      }
      const created = await el.createTool(def);
      ids.push(created.id);
    }

    return ids;
  },
});

// --- Writes ---------------------------------------------------------------

/** Creates the agent on first run, updates it thereafter. Safe to call repeatedly. */
export const saveAgent = action({
  args: {
    name: v.optional(v.string()),
    prompt: v.optional(v.string()),
    firstMessage: v.optional(v.string()),
    voiceId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    const existing = await ctx.runQuery(internal.agents.currentInternal, {});
    const knowledgeBase: el.KnowledgeBaseEntry[] = await ctx.runQuery(
      internal.docs.syncedEntries,
      {},
    );
    const toolIds: string[] = await ctx.runAction(internal.agents.ensureTools, {});

    const config: el.AgentConfig = {
      name: args.name ?? existing?.name ?? "Leasing receptionist",
      prompt: args.prompt ?? existing?.prompt ?? LEASING_PROMPT,
      firstMessage: args.firstMessage ?? existing?.firstMessage ?? DEFAULT_FIRST_MESSAGE,
      voiceId: args.voiceId ?? existing?.voiceId ?? DEFAULT_VOICE_ID,
      knowledgeBase,
      toolIds,
      voice: VOICE_TUNING,
      turn: TURN_TUNING,
    };

    const elevenLabsAgentId = existing
      ? (await el.updateAgent(existing.elevenLabsAgentId, config)).agent_id ??
        existing.elevenLabsAgentId
      : (await el.createAgent(config)).agent_id;

    await ctx.runMutation(internal.agents.upsert, {
      elevenLabsAgentId,
      name: config.name,
      prompt: config.prompt,
      firstMessage: config.firstMessage,
      voiceId: config.voiceId,
    });

    return elevenLabsAgentId;
  },
});

/**
 * Re-attaches the current set of synced docs to the agent. Called after a doc finishes
 * indexing or is deleted; a no-op when no agent exists yet.
 */
export const pushKnowledgeBase = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const agent = await ctx.runQuery(internal.agents.currentInternal, {});
    if (!agent) return;

    const knowledgeBase: el.KnowledgeBaseEntry[] = await ctx.runQuery(
      internal.docs.syncedEntries,
      {},
    );
    const toolIds: string[] = await ctx.runAction(internal.agents.ensureTools, {});
    await el.updateAgent(agent.elevenLabsAgentId, {
      name: agent.name,
      prompt: agent.prompt,
      firstMessage: agent.firstMessage,
      voiceId: agent.voiceId,
      knowledgeBase,
      toolIds,
      voice: VOICE_TUNING,
      turn: TURN_TUNING,
    });
  },
});

/**
 * Mints a short-lived WebRTC token. This is the only ElevenLabs call on the hot path of
 * starting a call, and the browser talks to ElevenLabs directly from here on — audio never
 * transits Convex.
 */
export const mintToken = action({
  args: {},
  handler: async (ctx): Promise<{ token: string; agentId: string }> => {
    let agent = await ctx.runQuery(internal.agents.currentInternal, {});
    if (!agent) {
      await ctx.runAction(internal.agents.ensure, {});
      agent = await ctx.runQuery(internal.agents.currentInternal, {});
    }
    if (!agent) throw new Error("Could not create an agent.");

    const { token } = await el.getWebrtcToken(agent.elevenLabsAgentId);
    return { token, agentId: agent.elevenLabsAgentId };
  },
});

export const ensure = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const existing = await ctx.runQuery(internal.agents.currentInternal, {});
    if (existing) return;
    const knowledgeBase: el.KnowledgeBaseEntry[] = await ctx.runQuery(
      internal.docs.syncedEntries,
      {},
    );
    const toolIds: string[] = await ctx.runAction(internal.agents.ensureTools, {});
    const created = await el.createAgent({
      name: "Leasing receptionist",
      prompt: LEASING_PROMPT,
      firstMessage: DEFAULT_FIRST_MESSAGE,
      voiceId: DEFAULT_VOICE_ID,
      knowledgeBase,
      toolIds,
      voice: VOICE_TUNING,
      turn: TURN_TUNING,
    });
    await ctx.runMutation(internal.agents.upsert, {
      elevenLabsAgentId: created.agent_id,
      name: "Leasing receptionist",
      prompt: LEASING_PROMPT,
      firstMessage: DEFAULT_FIRST_MESSAGE,
      voiceId: DEFAULT_VOICE_ID,
    });
  },
});

export const upsert = internalMutation({
  args: {
    elevenLabsAgentId: v.string(),
    name: v.string(),
    prompt: v.string(),
    firstMessage: v.string(),
    voiceId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("agents").first();
    const row = { ...args, updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert("agents", row);
  },
});
