/**
 * Cross-module interfaces module 2.5 (rules)'s rule-actions worker depends
 * on — implemented by modules 2.3 (devices) and 1.4 (users)' repositories,
 * wired together in `container.ts`. Same pattern as `IngestionDevicesLookup`
 * etc. (`modules/ingestion/lookups.ts`) — never import another module's
 * repository directly (`CONVENTIONS.md` "Modules").
 */
export interface RulesDevicesLookup {
  findByIdUnscoped(
    id: string
  ): Promise<
    { id: string; name: string; deviceUniqueIdentifier: string; userId: string } | undefined
  >;
}

/** `RuleTriggerService::recordAlarmTriggered`'s `$device->product?->company_id` — the alarm's `company_id` (alarms is company-ruled, `tenant-rules.ts`) is resolved from the triggering packet's product, not carried on the job data itself. */
export interface RulesProductsLookup {
  findByIdUnscoped(id: string): Promise<{ id: string; companyId: string } | undefined>;
}

export interface RulesUsersLookup {
  findContactById(userId: string): Promise<
    | {
        id: string;
        email: string;
        number: string;
        firstName: string;
        lastName: string;
        timezone: string | null;
      }
    | undefined
  >;
}

/**
 * D-0089/D-0014: the `systemNotification` action's real, in-app delivery
 * half — module 6.1's `NotificationsRepository` doubles as this interface
 * (same pattern as `RulesProductsLookup`). `createForTarget` runs under
 * `runAsSystemAsync` on the implementation side (the rule-actions worker
 * has no HTTP request context, and the target user is not the ambient
 * caller — same reasoning as `RulesRepository`'s own bottom-of-class
 * system-context methods).
 */
export interface RulesNotificationsLookup {
  createForTarget(userId: string, title: string, message: string): Promise<{ id: string }>;
}
