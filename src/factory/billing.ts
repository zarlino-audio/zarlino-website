/**
 * Paystack billing for the Pro plan.
 *
 * The rules that matter:
 *
 *   - the browser is never believed. A "successful" return URL is only a hint
 *     that makes us call `verify`; entitlement is granted solely from a
 *     server-verified transaction (`data.status === "success"` and the amount
 *     matching the configured plan price) or from a signature-verified webhook.
 *   - the webhook is authenticated by HMAC-SHA512 over the RAW body with the
 *     secret key, compared in constant time.
 *   - both paths are idempotent on the transaction reference, so a replayed
 *     webhook and a return-page verification for the same charge grant once.
 *   - amounts come from `pricing.ts`; a transaction that pays less than the
 *     plan price is refused.
 */

import { PLANS, type PlanId } from "./pricing";

const PAYSTACK_API = "https://api.paystack.co";

export interface BillingConfig {
  secretKey?: string;
  currency: string;
  /** Where Paystack sends the customer back to. */
  callbackBase: string;
  fetchImpl?: typeof fetch;
}

export interface InitializeInput {
  email: string;
  userId: string;
  plan: PlanId;
  reference: string;
}

export type InitializeResult =
  | { ok: true; authorizationUrl: string; reference: string; amountMinor: number; currency: string }
  | { ok: false; code: "NOT_CONFIGURED" | "INVALID_PLAN" | "PROVIDER_ERROR"; message: string };

export function planPriceMinor(plan: PlanId): { amountMinor: number; currency: string } | null {
  const definition = PLANS[plan];
  if (!definition.price) return null;
  return { amountMinor: definition.price.amountMinor, currency: definition.price.currency };
}

export async function initializeTransaction(config: BillingConfig, input: InitializeInput): Promise<InitializeResult> {
  if (!config.secretKey) return { ok: false, code: "NOT_CONFIGURED", message: "Payments are not configured on this deployment." };
  const price = planPriceMinor(input.plan);
  if (!price) return { ok: false, code: "INVALID_PLAN", message: "That plan is not purchasable." };

  const fetchImpl = config.fetchImpl ?? fetch;
  const callback = `${config.callbackBase.replace(/\/$/, "")}/factory/billing/return/?reference=${encodeURIComponent(input.reference)}`;

  let response: Response;
  try {
    response = await fetchImpl(`${PAYSTACK_API}/transaction/initialize`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.secretKey}` },
      body: JSON.stringify({
        email: input.email,
        amount: price.amountMinor,
        currency: price.currency || config.currency,
        reference: input.reference,
        callback_url: callback,
        metadata: {
          product: "zarlino_plugin_factory",
          plan: input.plan,
          user_id: input.userId,
          custom_fields: [
            { display_name: "Plan", variable_name: "plan", value: `${PLANS[input.plan].name} (Plugin Factory)` },
          ],
        },
      }),
    });
  } catch {
    return { ok: false, code: "PROVIDER_ERROR", message: "Could not reach the payment provider." };
  }

  const body = (await response.json().catch(() => null)) as
    | { status?: boolean; message?: string; data?: { authorization_url?: string; reference?: string } }
    | null;

  if (!response.ok || !body?.status || !body.data?.authorization_url) {
    return { ok: false, code: "PROVIDER_ERROR", message: body?.message ?? "The payment provider refused the request." };
  }

  return {
    ok: true,
    authorizationUrl: body.data.authorization_url,
    reference: body.data.reference ?? input.reference,
    amountMinor: price.amountMinor,
    currency: price.currency,
  };
}

export interface VerifiedTransaction {
  ok: true;
  paid: boolean;
  amountMinor: number;
  currency: string;
  reference: string;
  userId: string | null;
  plan: PlanId | null;
  email: string | null;
  status: string;
}

export type VerifyResult = VerifiedTransaction | { ok: false; code: "NOT_CONFIGURED" | "PROVIDER_ERROR"; message: string };

export async function verifyTransaction(config: BillingConfig, reference: string): Promise<VerifyResult> {
  if (!config.secretKey) return { ok: false, code: "NOT_CONFIGURED", message: "Payments are not configured on this deployment." };
  if (!reference || reference.length > 200) return { ok: true, paid: false, amountMinor: 0, currency: config.currency, reference: String(reference ?? ""), userId: null, plan: null, email: null, status: "invalid" };

  const fetchImpl = config.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
      method: "GET",
      headers: { authorization: `Bearer ${config.secretKey}` },
    });
  } catch {
    return { ok: false, code: "PROVIDER_ERROR", message: "Could not reach the payment provider." };
  }

  const body = (await response.json().catch(() => null)) as
    | {
        status?: boolean;
        data?: {
          status?: string;
          amount?: number;
          currency?: string;
          reference?: string;
          customer?: { email?: string };
          metadata?: { user_id?: string; plan?: string } | string;
        };
      }
    | null;

  if (!response.ok || !body?.status || !body.data) {
    return { ok: false, code: "PROVIDER_ERROR", message: "The payment provider could not verify that transaction." };
  }

  const metadata =
    typeof body.data.metadata === "string"
      ? (safeJson(body.data.metadata) as { user_id?: string; plan?: string } | null)
      : body.data.metadata ?? null;

  const plan = metadata?.plan === "pro" ? "pro" : null;
  const expected = plan ? planPriceMinor(plan) : null;
  const amountMinor = Number(body.data.amount ?? 0);

  return {
    ok: true,
    // Paystack reports "success" only after the charge settled. The amount must
    // ALSO cover the plan price, so a 1-unit charge cannot buy Pro.
    paid: body.data.status === "success" && expected !== null && amountMinor >= expected.amountMinor,
    amountMinor,
    currency: String(body.data.currency ?? config.currency),
    reference: String(body.data.reference ?? reference),
    userId: typeof metadata?.user_id === "string" ? metadata.user_id : null,
    plan,
    email: body.data.customer?.email ?? null,
    status: String(body.data.status ?? "unknown"),
  };
}

/** HMAC-SHA512 hex over the raw body, as Paystack signs it. */
export async function signWebhook(secretKey: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyWebhookSignature(secretKey: string, rawBody: string, provided: string | null): Promise<boolean> {
  if (!provided) return false;
  const expected = await signWebhook(secretKey, rawBody);
  const left = expected.toLowerCase();
  const right = provided.trim().toLowerCase();
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
