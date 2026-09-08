/**
 * SALES ENABLE SWITCH — SINGLE SOURCE OF TRUTH
 * ---------------------------------------------------------------
 * Controls every purchase surface on the site:
 *   1. the BUY / checkout buttons on /plugins/ztame and /plugins/zscorch
 *      (they render via the shared <AddToCartButton> component),
 *   2. the home PluginLineup "Add to Cart" cards (same component),
 *   3. the /checkout route + the `/api/paystack/*` payment handlers in
 *      `src/index.ts`, which refuse to proceed while sales are disabled.
 *
 * At real release, flip the ONE value below to `true` and redeploy. That single
 * change re-enables the buy buttons and lets <AddToCartButton>, the checkout
 * page and `src/index.ts` Paystack handlers start taking payments again.
 * All existing pricing / plugin logic (GHS 750 / 1200, the PLUGINS price map
 * and the Paystack + license plumbing) is left intact behind this flag — no
 * other code needs to change.
 *
 * Keep this value `false` while the plugins are still CONCEPT (no versioned
 * build is being sold yet). There is deliberately no hardcoded per-page flag;
 * every surface reads this one export.
 */
export const SALES_ENABLED = false;

/**
 * Human-friendly copy shown wherever a purchase CTA would otherwise appear.
 * Centralised here so the wording stays consistent across the plugin pages,
 * the checkout page and the disabled <AddToCartButton>.
 */
export const SALES_DISABLED_NOTE =
  'Not yet available — coming soon. ZTame and ZScorch aren\u2019t on sale yet — sign up below and we\u2019ll email you the moment checkout opens.';
