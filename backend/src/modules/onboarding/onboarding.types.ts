/**
 * Domain types for module 5.3 (onboarding) — `verifyToken` decomposed
 * per `onboarding-verifytoken.md` §3. No response DTO of its own: both
 * `/verify-token` and `/resend-verification-email` return the frozen
 * contract's plain `SuccessMessage` shape.
 */

/** A resolved plan's module grant, the shape 5.3 needs from module 5.1's `Plan` (slug, for permission-name derivation — `platform-billing-stripe.md` §1.2's `all-{slug}`/`none-{slug}` convention). */
export interface OnboardingPlanModule {
  slug: string;
}
