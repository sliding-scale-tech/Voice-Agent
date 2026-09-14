import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Mirrors Clerk users via the /auth webhook (user.created / session.created / user.updated).
  users: defineTable({
    clerkId: v.string(),
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    lastSignInAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"]),

  // --- Teams ---------------------------------------------------------------
  //
  // Organizations live here rather than in Clerk. Clerk still owns identity — sign-in, OAuth,
  // sessions, the user webhook — but a person belongs to exactly one team in this product, and
  // Clerk Organizations is built for the opposite case: several orgs per user with switching.
  // Modelling one-of-one through it meant carrying an "active organization" on the session, a
  // choose-organization task, compact org claims in the token and ticket redemption on invite
  // links — four moving parts to express a single row.
  organizations: defineTable({
    name: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    // When agents.ensure last started setting this team up (agent, property, knowledge). Sign-up
    // schedules it, and the Knowledge tab, a first call and a Settings save all call it as a
    // fallback — this is what keeps overlapping runs from each creating an ElevenLabs agent.
    bootstrapStartedAt: v.optional(v.number()),
  }),

  // One row per person per team. The unique index is what makes "one team per person" a fact
  // about the data rather than a convention: authz.currentOrg reads a single membership and
  // there is nothing to disambiguate.
  memberships: defineTable({
    orgId: v.id("organizations"),
    userId: v.id("users"),
    // Deliberately a plain union and not a Clerk permission catalog — the finer-grained limits
    // discussed for later are a change to this column, not a new authorization system.
    role: v.union(v.literal("admin"), v.literal("member")),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_org", ["orgId"]),

  // Pending invitations.
  //
  // Only a SHA-256 of the token is stored. The raw token exists in the invite email and in the
  // invitee's URL, never at rest here, so a leak of this table cannot be replayed into
  // somebody's team. Expiry and single-use (acceptedAt/revokedAt) are enforced on redemption.
  invites: defineTable({
    orgId: v.id("organizations"),
    email: v.string(), // always lowercased, so lookups cannot miss on casing
    role: v.union(v.literal("admin"), v.literal("member")),
    tokenHash: v.string(),
    createdBy: v.id("users"),
    createdAt: v.number(),
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_org", ["orgId"])
    .index("by_email", ["email"]),

  agents: defineTable({
    // The Clerk organization this row belongs to. Every dashboard table is keyed by org rather
    // than by user: a team shares one agent, one property, one knowledge base and one lead
    // list, so ownership has to sit on the team, not on whoever happened to create it.
    //
    // Required: every row is backfilled and every insert path stamps it.
    orgId: v.string(),
    // Kept alongside orgId as "who created this", not as an access key. Nothing scopes on it
    // any more — see convex/authz.ts.
    userId: v.id("users"),
    elevenLabsAgentId: v.string(),
    name: v.string(),
    prompt: v.string(),
    firstMessage: v.string(),
    voiceId: v.string(),
    updatedAt: v.number(),
  })
    .index("by_elevenlabs_id", ["elevenLabsAgentId"])
    .index("by_org", ["orgId"])
    .index("by_user", ["userId"]),

  conversations: defineTable({
    // Absent for the public landing-page demo (never signed in) and, briefly, for a phone
    // call before the post-call webhook resolves and backfills it — see ingestFromWebhook.
    userId: v.optional(v.id("users")),
    orgId: v.optional(v.string()),
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
    // Powers the Leads page: one signed-in user's calls, newest first, without scanning
    // every other user's rows to find them.
    .index("by_user_and_started", ["userId", "startedAt"])
    .index("by_org_and_started", ["orgId", "startedAt"])
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
    // Required: every row is backfilled (orgMigration.backfill) and every insert path stamps
    // it, so allowing undefined here would only reintroduce a "which rows are unowned?" branch
    // that no longer has a real case behind it.
    orgId: v.string(),
    userId: v.id("users"),
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
  })
    .index("by_sync_state", ["syncState"])
    .index("by_org", ["orgId"])
    .index("by_user", ["userId"]),

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
    // Required: every row is backfilled (orgMigration.backfill) and every insert path stamps
    // it, so allowing undefined here would only reintroduce a "which rows are unowned?" branch
    // that no longer has a real case behind it.
    orgId: v.string(),
    userId: v.id("users"),
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
  })
    .index("by_org", ["orgId"])
    .index("by_user", ["userId"]),

  // Feedback from the landing page's "Try yourself" demo only — never from the dashboard's
  // own /call, where a customer testing their own agent has no reason to rate it.
  //
  // Written in two steps so a rating is never lost to someone abandoning the email prompt:
  // ratings.submit inserts the star rating alone, ratings.attachEmail later patches an email
  // onto that same row if and only if they go on to give one — which also triggers sending
  // the transcript to it (convex/transcriptEmail.ts).
  callRatings: defineTable({
    // sessionStorage-scoped, not a signed-in identity: ties a rating back to one browser tab
    // for this visit only, so a second "try" in the same tab can be told apart from a
    // stranger's first one.
    sessionId: v.string(),
    conversationId: v.optional(v.id("conversations")),
    rating: v.number(), // 1-5
    email: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_conversation", ["conversationId"]),

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

    // Answers to the property manager's own pre-screening questions (see screeningQuestions).
    // `question` is denormalized on purpose: a manager who later rewrites or deletes a
    // question must not retroactively change what an old lead is recorded as having answered.
    screeningAnswers: v.optional(
      v.array(
        v.object({
          key: v.string(),
          question: v.string(),
          value: v.union(v.string(), v.number(), v.boolean()),
        }),
      ),
    ),
    updatedAt: v.number(),
  }).index("by_elevenlabs_conversation_id", ["elevenLabsConversationId"]),

  // Extra questions this property manager wants Sarah to ask every leasing caller, on top of
  // the five that are built in. Data, not prompt text: `key` becomes a property on that
  // manager's own check_qualification tool schema, so the model normalizes the spoken answer
  // into a real boolean/number/string exactly the way it already does for pets_wanted.
  //
  // `criterion` absent means capture-only — the answer is recorded on the lead and can never
  // affect qualification. Present means evaluateQualification applies it as a real rule. That
  // toggle is per question, deliberately: most managers want a mix of both.
  screeningQuestions: defineTable({
    // Required: every row is backfilled (orgMigration.backfill) and every insert path stamps
    // it, so allowing undefined here would only reintroduce a "which rows are unowned?" branch
    // that no longer has a real case behind it.
    orgId: v.string(),
    userId: v.id("users"),
    // Stable snake_case identifier, generated once at creation and never rewritten. It is the
    // tool-schema property name AND the join key on qualifications.screeningAnswers, so
    // editing a question's wording must not change it or old answers orphan themselves.
    key: v.string(),
    question: v.string(),
    answerKind: v.union(
      v.literal("yes_no"),
      v.literal("number"),
      v.literal("choice"),
      v.literal("text"),
    ),
    // Only meaningful for answerKind "choice".
    choices: v.optional(v.array(v.string())),
    // "text" answers can never carry a criterion — free prose is not something a pure
    // function can judge, and qualification must stay a code decision. Enforced in
    // screening.save, not just here.
    criterion: v.optional(
      v.union(
        v.object({ kind: v.literal("yes_no"), mustBe: v.boolean() }),
        v.object({
          kind: v.literal("number"),
          op: v.union(v.literal("gte"), v.literal("lte")),
          value: v.number(),
        }),
        v.object({ kind: v.literal("choice"), allowed: v.array(v.string()) }),
      ),
    ),
    order: v.number(),
    enabled: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_user", ["userId"]),

  // Which of the five built-in questions this manager has switched off. One row per user,
  // holding only the exceptions — no row, or an empty array, means all five are asked, so a
  // fresh account behaves exactly as it did before any of this existed.
  //
  // Only the keys listed in coreQuestions.DISABLEABLE_KEYS can appear here. `bedrooms` and
  // `contact` are structural and are filtered out on write; see convex/coreQuestions.ts.
  screeningBuiltins: defineTable({
    // Required: every row is backfilled (orgMigration.backfill) and every insert path stamps
    // it, so allowing undefined here would only reintroduce a "which rows are unowned?" branch
    // that no longer has a real case behind it.
    orgId: v.string(),
    userId: v.id("users"),
    disabled: v.array(v.string()),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_user", ["userId"]),

  // Keyed by the ElevenLabs conversation id for the same reason as qualifications above.
  //
  // `category` is deliberately v.string() and not a union: the agent fills it freehand, and a
  // single off-script value ("plumbing" instead of "maintenance") against a union would throw
  // inside the mutation, fail the tool call, and leave Sarah telling the caller that something
  // broke mid-call. Normalize for display, store what was said.
  tenantIssues: defineTable({
    // Resolved from the call's conversations row where possible (see tenants.logIssue) and
    // backfilled at webhook time otherwise — same story as conversations.userId above. The
    // Tenants page reads this table directly rather than through a conversation, so unlike
    // qualifications (access-controlled via its parent conversation) this needs its own
    // indexed column to scope the list itself.
    userId: v.optional(v.id("users")),
    orgId: v.optional(v.string()),
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
    .index("by_created", ["createdAt"])
    .index("by_org", ["orgId"])
    .index("by_user", ["userId"]),

  // --- WhatsApp automation ------------------------------------------------
  //
  // Deliberately a self-contained island. Nothing here references conversations,
  // qualifications, tenantIssues, threads or smsMessages, and nothing there references this.
  // The voice agent (ElevenLabs) and the SMS bot (Twilio) keep working exactly as they did
  // even if WhatsApp is switched off entirely.
  //
  // The only things shared are read-only business data both channels need: the `docs`
  // knowledge base and the `properties` row.

  // Singleton — the editable WhatsApp system prompt. Kept in its own table rather than in
  // orgSettings so the WhatsApp feature stays a self-contained island: nothing outside these
  // wa* tables has to know it exists. Empty/missing means "use the default from
  // convex/waPrompt.ts", so a fresh install works before anyone visits Settings.
  waConfig: defineTable({
    systemPrompt: v.string(),
    updatedAt: v.number(),
  }),

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
