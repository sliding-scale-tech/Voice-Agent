/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agents from "../agents.js";
import type * as authz from "../authz.js";
import type * as clerkWebhook from "../clerkWebhook.js";
import type * as conversations from "../conversations.js";
import type * as docs from "../docs.js";
import type * as elevenLabsApi from "../elevenLabsApi.js";
import type * as geminiApi from "../geminiApi.js";
import type * as http from "../http.js";
import type * as leadScoring from "../leadScoring.js";
import type * as notifications from "../notifications.js";
import type * as orgSettings from "../orgSettings.js";
import type * as otlp from "../otlp.js";
import type * as properties from "../properties.js";
import type * as qualifications from "../qualifications.js";
import type * as qualifyRules from "../qualifyRules.js";
import type * as ratings from "../ratings.js";
import type * as resendApi from "../resendApi.js";
import type * as residentTriage from "../residentTriage.js";
import type * as sanitize from "../sanitize.js";
import type * as severity from "../severity.js";
import type * as smsBot from "../smsBot.js";
import type * as tenants from "../tenants.js";
import type * as threads from "../threads.js";
import type * as transcriptEmail from "../transcriptEmail.js";
import type * as twilioApi from "../twilioApi.js";
import type * as users from "../users.js";
import type * as waBot from "../waBot.js";
import type * as waPrompt from "../waPrompt.js";
import type * as wahaApi from "../wahaApi.js";
import type * as whatsapp from "../whatsapp.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agents: typeof agents;
  authz: typeof authz;
  clerkWebhook: typeof clerkWebhook;
  conversations: typeof conversations;
  docs: typeof docs;
  elevenLabsApi: typeof elevenLabsApi;
  geminiApi: typeof geminiApi;
  http: typeof http;
  leadScoring: typeof leadScoring;
  notifications: typeof notifications;
  orgSettings: typeof orgSettings;
  otlp: typeof otlp;
  properties: typeof properties;
  qualifications: typeof qualifications;
  qualifyRules: typeof qualifyRules;
  ratings: typeof ratings;
  resendApi: typeof resendApi;
  residentTriage: typeof residentTriage;
  sanitize: typeof sanitize;
  severity: typeof severity;
  smsBot: typeof smsBot;
  tenants: typeof tenants;
  threads: typeof threads;
  transcriptEmail: typeof transcriptEmail;
  twilioApi: typeof twilioApi;
  users: typeof users;
  waBot: typeof waBot;
  waPrompt: typeof waPrompt;
  wahaApi: typeof wahaApi;
  whatsapp: typeof whatsapp;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
