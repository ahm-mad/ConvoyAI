# Domain: Rule Builder, alarms & notifications

Sidebar: **Studio** → "Rule Builder" (`!user.isDemo && hasPermission('all-rule-builder')`); **Operations** → "Alarms" (`all-alarms`). A Rule is functionally a single-step workflow ("if condition(s) then actions"); no Workflow Designer exists.

## Screens

- `/rule-builder` → `RuleBuilder.tsx` (`Rule`): `RadixTable` list of the user's rules (`GET /rules` with `user_id, page, per_page, sort_by, sort_order, search`; response `data.rules`, `data.pagination`), bulk activate/deactivate/delete (`POST /rules/bulk/{activate|deactivate|delete}` via `bulk/${endpoint}`), row click → edit. **The per-row Active toggle is dead** (`handleSingleStatusChangeClick` commented out ~line 303) — owner: do not touch. Search debounce 1 s; `keepPreviousData` (v4 API) removed (no-op in v5).
- `/new-rule`, `/new-rule/:ruleId` → `AddNewRule.tsx` (`NewRule`, 733 L): react-hook-form + `useFieldArray('conditions')`; one product per rule; conditions (product → attribute from `GET /product-settings/:id` → comparator → value, logical operator If/And/Or), `executionInterval` (default 60), `allowRetriggering`, `is_active`; actions: **email** (`EmailAction`: to[], subject, message with placeholders), **SMS** (`SmsAction`: to[], message), **system notification** (`SystemNotificationAction`: message). Payload built in `onSubmit` (pending recipient inputs are absorbed); `POST /rules/store`, edit via `GET/PUT /rules/:id`. Validation is done inline by react-hook-form rules — the yup files `validation/NewRuleFormSchema.ts`, `RuleFormSchema.ts`, `smsSchemaValidation.ts` are **not imported anywhere (dead)**. Condition UI: `ConditionRow`, `ConditionDropdownPanel`.
- `/alarms` → `Alarms.tsx`: `GET /alarms`, acknowledge `POST /alarms/:id/acknowledge`.

## Status of actions (owner tested 2026-09-23)

- **Email: works end to end** (owner verified real inbox).
- **SMS: never live-tested** (needs owner's phone). Backend implementation status unknown.
- **System notification: frontend gap, deferred.** The Pusher→Socket.IO migration never wired `notification:new` nor `/notifications` REST endpoints; there is no bell/notification centre (`BellIcon.tsx` unused). Even a perfect backend emit has nothing to render it. Also `alarm:state` isn't consumed.
  A future notification centre would also be the channel for fleet alerts and trip-acknowledgement (see fleet.md §12).
- Rules hidden for demo users; onboarding demo tours: `ConvoyDemo/RuleBuilderDemo.ts`, `AddnewRuleDemo.ts` (driver.js tours; `utils/DemoHelper.isFirstDemo(id)` stores flags under an EMPTY localStorage key (`DEMO_KEYS_STORAGE=''`), and screens then call `setDemoStart(false)` regardless — tours are effectively disabled/unreachable, `isDemoMode` can never become true; owner: demo-tour code is out of scope until the real flow settles).
