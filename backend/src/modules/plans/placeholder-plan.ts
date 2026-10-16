/**
 * D-0080's single placeholder plan — the sentinel values every new signup
 * lands on until real, multi-tier Stripe billing is separately authorized
 * (post-Phase-7). `stripePlan` is never sent to Stripe; it exists purely so
 * this row is unambiguously identifiable as the placeholder, both here and
 * later from 23-onboarding's company-bootstrap step (which looks the plan
 * up by this exact `stripe_plan` value, the same way Laravel's `verifyToken`
 * looked up its own hardcoded `PLAN_ID` — see `onboarding-verifytoken.md`
 * §1.2 step 8).
 *
 * Deliberately maximally permissive (every module, not a copy of the real
 * production `plan_modules` catalog) — `platform-billing-stripe.md` §1.3's
 * finding that no real plan currently grants Fleet Management at all would
 * otherwise make every already-built fleet module unreachable by a
 * placeholder-provisioned account.
 */
export const PLACEHOLDER_PLAN = {
  name: 'Full Access (Placeholder)',
  stripePlan: 'placeholder-full-access',
  price: '0',
  description:
    'Auto-provisioned placeholder plan granting every module. Real multi-tier billing is not yet ' +
    'authorized (DECISIONS.md D-0080) — every subscriber lands on this single plan until then.',
} as const;
