/**
 * Thin wrapper over the ElevenLabs REST API.
 *
 * Uses fetch rather than @elevenlabs/elevenlabs-js so these run on Convex's default runtime
 * with no "use node" bundling. Every endpoint here was verified against a live free-tier
 * account on 2026-07-29 — see docs/superpowers/specs/.
 */

const BASE = "https://api.elevenlabs.io/v1";

/** The embedding model free-tier RAG indexing accepts. */
export const RAG_MODEL = "e5_mistral_7b_instruct";

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key?.trim()) {
    throw new Error(
      "Missing ELEVENLABS_API_KEY. Set it with: npx convex env set ELEVENLABS_API_KEY <key>",
    );
  }
  return key;
}

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "xi-api-key": apiKey(),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });

  if (!res.ok) {
    const detail = await res.text();
    // Surface ElevenLabs' own message verbatim — it is consistently more useful than
    // anything we would synthesise (e.g. "missing the permission convai_read").
    throw new Error(`ElevenLabs ${res.status} on ${path}: ${detail.slice(0, 500)}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// --- Agents ---------------------------------------------------------------

export type KnowledgeBaseEntry = {
  type: "text";
  id: string;
  name: string;
  usage_mode: "auto";
};

export type AgentConfig = {
  name: string;
  prompt: string;
  firstMessage: string;
  voiceId: string;
  knowledgeBase: KnowledgeBaseEntry[];
  toolIds: string[];
};

export function createAgent(input: AgentConfig) {
  return request<{ agent_id: string }>("/convai/agents/create", {
    method: "POST",
    body: {
      name: input.name,
      conversation_config: {
        agent: {
          first_message: input.firstMessage,
          language: "en",
          prompt: {
            prompt: input.prompt,
            // Benchmarked 2026-07-30 against the alternatives: ~1.3s vs ~3.5s for
            // gemini-3.5-flash. Response latency dominates the feel of a voice call.
            llm: "gemini-3.1-flash-lite",
            temperature: 0,
            // Explicitly cleared: PATCH merges rather than replaces, so a stale
            // reasoning_effort left over from a different (auto-routed) model can otherwise
            // persist and 400 against gemini-2.0-flash, which doesn't support that field.
            reasoning_effort: null,
            // Voice replies should be a sentence or two; uncapped generation is a real
            // source of response latency.
            max_tokens: 250,
            knowledge_base: input.knowledgeBase,
            tool_ids: input.toolIds,
            built_in_tools: {
              end_call: {
                name: "end_call",
                description:
                  "Ends the call once the purpose is accomplished and there is nothing more to help with.",
              },
            },
          },
        },
        tts: { voice_id: input.voiceId, model_id: "eleven_flash_v2" },
        conversation: { text_only: false },
      },
    },
  });
}

export function updateAgent(agentId: string, input: AgentConfig) {
  return request<{ agent_id: string }>(`/convai/agents/${agentId}`, {
    method: "PATCH",
    body: {
      name: input.name,
      conversation_config: {
        agent: {
          first_message: input.firstMessage,
          language: "en",
          prompt: {
            prompt: input.prompt,
            // Benchmarked 2026-07-30 against the alternatives: ~1.3s vs ~3.5s for
            // gemini-3.5-flash. Response latency dominates the feel of a voice call.
            llm: "gemini-3.1-flash-lite",
            temperature: 0,
            // Explicitly cleared: PATCH merges rather than replaces, so a stale
            // reasoning_effort left over from a different (auto-routed) model can otherwise
            // persist and 400 against gemini-2.0-flash, which doesn't support that field.
            reasoning_effort: null,
            // Voice replies should be a sentence or two; uncapped generation is a real
            // source of response latency.
            max_tokens: 250,
            knowledge_base: input.knowledgeBase,
            tool_ids: input.toolIds,
            built_in_tools: {
              end_call: {
                name: "end_call",
                description:
                  "Ends the call once the purpose is accomplished and there is nothing more to help with.",
              },
            },
          },
        },
        tts: { voice_id: input.voiceId, model_id: "eleven_flash_v2" },
      },
    },
  });
}

// --- Server tools (webhook tools) ------------------------------------------

/**
 * A property's schema entry either describes a field for the LLM to fill (`description`) or
 * binds it to an ElevenLabs system variable (`dynamicVariable`), never both — the API 422s if
 * you set more than one. Verified live against a real test tool on 2026-07-30.
 */
export type ToolProperty =
  | { type: "string" | "number" | "boolean"; description: string }
  | { type: "string" | "number" | "boolean"; dynamicVariable: string };

export type ToolDefinition = {
  name: string;
  description: string;
  url: string;
  properties: Record<string, ToolProperty>;
  required: string[];
};

function toApiProperty(p: ToolProperty) {
  if ("dynamicVariable" in p) {
    return { type: p.type, dynamic_variable: p.dynamicVariable };
  }
  return { type: p.type, description: p.description };
}

function toolConfigBody(def: ToolDefinition) {
  return {
    type: "webhook",
    name: def.name,
    description: def.description,
    response_timeout_secs: 20,
    // Forces the agent to speak (e.g. "let me check that") before every call to this tool
    // instead of going silent while it waits — verified enum: 'auto' | 'force' | 'off'.
    pre_tool_speech: "force",
    api_schema: {
      url: def.url,
      method: "POST",
      request_body_schema: {
        type: "object",
        description: def.description,
        required: def.required,
        properties: Object.fromEntries(
          Object.entries(def.properties).map(([k, v]) => [k, toApiProperty(v)]),
        ),
      },
    },
  };
}

export function createTool(def: ToolDefinition) {
  return request<{ id: string }>("/convai/tools", {
    method: "POST",
    body: { tool_config: toolConfigBody(def) },
  });
}

export function updateTool(toolId: string, def: ToolDefinition) {
  return request<{ id: string }>(`/convai/tools/${toolId}`, {
    method: "PATCH",
    body: { tool_config: toolConfigBody(def) },
  });
}

export function listTools() {
  return request<{ tools: Array<{ id: string; tool_config: { name: string } }> }>(
    "/convai/tools",
  );
}

export function getWebrtcToken(agentId: string) {
  return request<{ token: string }>(
    `/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
  );
}

// --- Knowledge base -------------------------------------------------------

export function createKbDocFromText(text: string, name: string) {
  return request<{ id: string; name: string }>("/convai/knowledge-base/text", {
    method: "POST",
    body: { text, name },
  });
}

export function computeRagIndex(docId: string) {
  return request<{ id: string; status: string; progress_percentage: number }>(
    `/convai/knowledge-base/${docId}/rag-index`,
    { method: "POST", body: { model: RAG_MODEL } },
  );
}

export function getRagIndexes(docId: string) {
  return request<{
    indexes: Array<{ id: string; status: string; progress_percentage: number }>;
  }>(`/convai/knowledge-base/${docId}/rag-index`);
}

/**
 * Deleting a document that still has a RAG index returns 409, so the index goes first.
 * `force=true` is belt-and-braces for indexes we did not record.
 */
export async function deleteKbDoc(docId: string, ragIndexId?: string) {
  if (ragIndexId) {
    await request<void>(`/convai/knowledge-base/${docId}/rag-index/${ragIndexId}`, {
      method: "DELETE",
    }).catch(() => {
      /* index may already be gone; the forced delete below is the real guard */
    });
  }
  await request<void>(`/convai/knowledge-base/${docId}?force=true`, {
    method: "DELETE",
  });
}

// --- Account --------------------------------------------------------------

export function getSubscription() {
  return request<{ tier: string; character_count: number; character_limit: number }>(
    "/user/subscription",
  );
}

export function listVoices() {
  return request<{ voices: Array<{ voice_id: string; name: string }> }>("/voices");
}
