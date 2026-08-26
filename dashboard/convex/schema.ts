import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  agents: defineTable({
    elevenLabsAgentId: v.string(),
    name: v.string(),
    prompt: v.string(),
    firstMessage: v.string(),
    voiceId: v.string(),
    updatedAt: v.number(),
  }).index("by_elevenlabs_id", ["elevenLabsAgentId"]),

  conversations: defineTable({
    agentId: v.id("agents"),
    elevenLabsConversationId: v.optional(v.string()),
    channel: v.union(v.literal("browser"), v.literal("phone")),
    callerNumber: v.optional(v.string()),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    durationSec: v.optional(v.number()),
    status: v.union(
      v.literal("active"),
      v.literal("ended"),
      v.literal("failed"),
    ),
    intent: v.optional(
      v.union(
        v.literal("leasing"),
        v.literal("maintenance"),
        v.literal("escalation"),
        v.literal("unclear"),
      ),
    ),
    outcome: v.optional(
      v.union(
        v.literal("tour_booked"),
        v.literal("disqualified"),
        v.literal("escalated"),
        v.literal("logged_only"),
      ),
    ),
    escalatedTo: v.optional(v.string()),
    summary: v.optional(v.string()),
  })
    .index("by_agent", ["agentId"])
    .index("by_started", ["startedAt"])
    .index("by_elevenlabs_conversation_id", ["elevenLabsConversationId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("agent")),
    text: v.string(),
    // The SDK emits tentative transcripts that are later superseded. Tentative rows are
    // overwritten in place rather than appended, otherwise the transcript stutters.
    isFinal: v.boolean(),
    at: v.number(),
  }).index("by_conversation", ["conversationId"]),

  docs: defineTable({
    title: v.string(),
    body: v.string(),
    kbDocumentId: v.optional(v.string()),
    ragIndexId: v.optional(v.string()),
    syncState: v.union(
      v.literal("pending"),
      v.literal("indexing"),
      v.literal("synced"),
      v.literal("failed"),
    ),
    syncError: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_sync_state", ["syncState"]),

  usage: defineTable({
    monthKey: v.string(), // "2026-07"
    secondsUsed: v.number(),
  }).index("by_month", ["monthKey"]),

  // One thread per (channel, customer phone) pair — the same person texting and WhatsApp-ing
  // are two separate threads. "bot" means the bot auto-replies; "escalated" means a human has
  // taken over and the bot stops replying until the thread is handed back.
  threads: defineTable({
    channel: v.union(v.literal("sms"), v.literal("whatsapp")),
    customerPhone: v.string(),
    status: v.union(v.literal("bot"), v.literal("escalated")),
    escalationReason: v.optional(v.string()),
    lastMessageAt: v.number(),
  }).index("by_channel_and_phone", ["channel", "customerPhone"]),

  // Temporary: captures the raw post-call webhook body so its real payload shape can be
  // inspected and the parser corrected, since ElevenLabs' docs 404'd all session and the
  // transcript_format setting hasn't reliably stuck. Remove once ingestFromWebhook is fixed.
  debugWebhookLogs: defineTable({
    body: v.string(),
    at: v.number(),
  }),

  smsMessages: defineTable({
    threadId: v.id("threads"),
    sender: v.union(v.literal("customer"), v.literal("bot"), v.literal("staff")),
    text: v.string(),
    at: v.number(),
    twilioSid: v.optional(v.string()), // dedupes Twilio's occasional webhook retries
  }).index("by_thread", ["threadId"]),

  orgSettings: defineTable({
    staffPhoneNumber: v.string(),
  }),

  properties: defineTable({
    name: v.string(),
    units: v.array(
      v.object({
        bedrooms: v.string(), // "studio" | "1br" | "2br" | "3br+"
        rentMin: v.number(),
        rentMax: v.number(),
        available: v.boolean(),
      }),
    ),
    petsAllowed: v.boolean(),
    moveInWindowDays: v.number(),
    updatedAt: v.number(),
  }),

  // Keyed by the ElevenLabs conversation id, not a Convex conversations._id: phone calls have
  // no browser to create a conversations row up front, so tool calls write here first and the
  // post-call webhook links this row to conversations once the call ends.
  qualifications: defineTable({
    elevenLabsConversationId: v.string(),
    conversationId: v.optional(v.id("conversations")),
    bedrooms: v.optional(v.string()),
    moveInDate: v.optional(v.string()),
    budget: v.optional(v.number()),
    petsWanted: v.optional(v.boolean()),
    petType: v.optional(v.string()),
    callerName: v.optional(v.string()),
    callerPhone: v.optional(v.string()),
    qualifies: v.optional(v.boolean()),
    disqualifyReason: v.optional(v.string()),
    tourSlot: v.optional(v.string()),
    tourConfirmed: v.boolean(),
    updatedAt: v.number(),
  }).index("by_elevenlabs_conversation_id", ["elevenLabsConversationId"]),

  // Keyed by the ElevenLabs conversation id for the same reason as qualifications above.
  //
  // `category` is deliberately v.string() and not a union: the agent fills it freehand, and a
  // single off-script value ("plumbing" instead of "maintenance") against a union would throw
  // inside the mutation, fail the tool call, and leave Emily telling the caller that something
  // broke mid-call. Normalize for display, store what was said.
  tenantIssues: defineTable({
    elevenLabsConversationId: v.string(),
    conversationId: v.optional(v.id("conversations")),

    callerName: v.optional(v.string()),
    unit: v.optional(v.string()),
    // Two different facts, kept apart on purpose. callerNumber is where the call came FROM
    // (telephony caller ID, automatic, always correct). callbackNumber is what the resident
    // asked us to reach them on, spoken aloud — more intentional, but transcribed digits get
    // misheard, so it must never overwrite the one we know is right.
    callerNumber: v.optional(v.string()),
    callbackNumber: v.optional(v.string()),

    reason: v.string(),
    category: v.optional(v.string()),
    severity: v.number(), // 1-10, clamped server-side by clampSeverity
    severityReason: v.optional(v.string()),
    // Set the first time staff overrides the score, so the agent's original call is never lost.
    originalSeverity: v.optional(v.number()),
    status: v.union(v.literal("open"), v.literal("resolved")),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_elevenlabs_conversation_id", ["elevenLabsConversationId"])
    .index("by_created", ["createdAt"]),

  // --- WhatsApp automation ------------------------------------------------
  //
  // Deliberately a self-contained island. Nothing here references conversations,
  // qualifications, tenantIssues, threads or smsMessages, and nothing there references this.
  // The voice agent (ElevenLabs) and the SMS bot (Twilio) keep working exactly as they did
  // even if WhatsApp is switched off entirely.
  //
  // The only things shared are read-only business data both channels need: the `docs`
  // knowledge base and the `properties` row.

  // Singleton — one connected WhatsApp number for the property. Mirrors WAHA's own session
  // state rather than owning it: WAHA is the source of truth, this is the last thing we saw
  // so the page can render without a round trip on every load.
  waSession: defineTable({
    sessionName: v.string(),
    status: v.string(), // raw WAHA status: STARTING | SCAN_QR_CODE | WORKING | FAILED | STOPPED
    phoneNumber: v.optional(v.string()),
    connectedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }),

  // One thread per WhatsApp chat.
  //
  // chatId is bare phone digits, OR a full JID like "123@lid" when WhatsApp gave us a LID
  // identifier we could not resolve to a real number. Storing the full JID in that case is
  // deliberate: a bare LID with "@c.us" appended is undeliverable, so replies would silently
  // vanish. See infra/waha/README.md.
  waThreads: defineTable({
    chatId: v.string(),
    displayName: v.string(),
    status: v.union(v.literal("bot"), v.literal("escalated"), v.literal("closed")),
    escalationReason: v.optional(v.string()),
    unreadCount: v.number(),
    lastMessageAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_chat_id", ["chatId"])
    .index("by_last_message", ["lastMessageAt"]),

  waMessages: defineTable({
    threadId: v.id("waThreads"),
    sender: v.union(v.literal("customer"), v.literal("bot"), v.literal("staff")),
    text: v.string(),
    at: v.number(),
    deliveryStatus: v.optional(v.union(v.literal("sent"), v.literal("failed"))),
  }).index("by_thread", ["threadId"]),

  // What the bot captured from a leasing conversation. Same five fields the voice agent
  // gathers, but stored separately and shown only on the WhatsApp page.
  waLeads: defineTable({
    threadId: v.id("waThreads"),
    callerName: v.optional(v.string()),
    callerPhone: v.optional(v.string()),
    bedrooms: v.optional(v.string()),
    moveInDate: v.optional(v.string()),
    budget: v.optional(v.number()),
    petsWanted: v.optional(v.boolean()),
    petType: v.optional(v.string()),
    qualifies: v.optional(v.boolean()),
    disqualifyReason: v.optional(v.string()),
    tourSlot: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_thread", ["threadId"]),

  // Resident maintenance reported over WhatsApp. Same 1-10 severity rubric the voice agent
  // uses (convex/severity.ts) so a 7 means the same thing on both channels.
  waIssues: defineTable({
    threadId: v.id("waThreads"),
    callerName: v.optional(v.string()),
    unit: v.optional(v.string()),
    callbackNumber: v.optional(v.string()),
    reason: v.string(),
    category: v.optional(v.string()),
    severity: v.number(),
    severityReason: v.optional(v.string()),
    originalSeverity: v.optional(v.number()),
    status: v.union(v.literal("open"), v.literal("resolved")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_created", ["createdAt"]),
});
