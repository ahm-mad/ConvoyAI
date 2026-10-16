/**
 * The canonical rule-condition evaluator (module 2.5, KNOWN_ISSUES 11.10)
 * — replaces the four independent, drifting Laravel implementations
 * documented byte-for-byte in `reference/deep-dives/rule-engine.md` §3:
 * `RuleTriggerService::evaluateSingleCondition`/`evaluateRuleConditions`
 * (ingestion, device rules), `RuleTriggerService::
 * checkIfAttributeInAlertForWidget` (ingestion, widget rules),
 * `AssetController::evaluateCondition`/`evaluateConditions` (asset alert
 * badges), and `DashboardController::evaluatePacketAlertState` (packet
 * history). One evaluator, one condition-combination algorithm, one
 * coercion/comparison function — every consumer (this module today; 2.7
 * dashboards and 3.1 assets later) calls the same `evaluate()`.
 *
 * Canonical semantics, per `rule-engine.md` §6 (finalized 2026-09-15):
 *
 * 1. Condition combination: the ingestion path's AND/OR/IF state machine,
 *    ported as-is (§3 col 1, the most complete of the four and the one
 *    already driving alarm persistence).
 * 2. Coercion/comparison: `normalizeValue`'s boolean synonyms + numeric
 *    coercion (device/widget path) as the base, plus Assets' epsilon-based
 *    float equality for numeric equals/not_equals, plus the full string
 *    operator set (contains/starts_with/ends_with/in_range).
 * 3. Attribute lookup: exact dot-path only, no packet-history-style
 *    "fall back to the last path segment" leniency.
 * 4. Product scoping (D-0059, user-approved 2026-09-15 — a deliberate
 *    behavior change vs. today's ingestion path, which has none): a
 *    condition is evaluated only if its `selectedProduct` is unset/null or
 *    equals the packet's `productId`.
 * 5. One evaluator for both device and widget rules — the AND/OR/IF state
 *    machine is a strict superset of the widget path's old
 *    "first-match-wins" behavior.
 * 6. Returns which condition(s) matched (`matchedConditionIndices`), not
 *    just a boolean — closes the `recordAlarmTriggered` gap noted in
 *    `rule-engine.md` §5 (which condition fired was previously
 *    unrecoverable; `triggered_value` still stores the full flattened
 *    packet for parity, this is additive).
 */
export interface RuleCondition {
  /** Laravel stores whatever the client sent — the frontend sends the product id as a number (D-0130). */
  selectedProduct?: string | number | boolean | null | undefined;
  selectedAttribute?: string | null | undefined;
  selectedCondition?: string | null | undefined;
  conditionValue?: string | null | undefined;
  logicalOperator?: string | null | undefined;
}

export interface RuleEvaluationResult {
  matched: boolean;
  matchedConditionIndices: number[];
}

const NUMERIC_EPSILON = 1e-4;

/**
 * `normalizeValue` — boolean synonyms + numeric coercion, ported from the
 * device/widget path (`rule-engine.md` §3, shared by both there).
 */
function normalizeValue(value: unknown): unknown {
  if (value === 1 || value === '1' || value === true) return true;
  if (value === 0 || value === '0' || value === false) return false;

  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === 'yes' || v === 'on') return true;
    if (v === 'false' || v === 'no' || v === 'off') return false;
    if (v !== '' && !Number.isNaN(Number(v))) return Number(v);
  }

  return value;
}

function isNumeric(value: unknown): value is number | string {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.trim() !== '' && !Number.isNaN(Number(value));
  return false;
}

function toNumber(value: number | string): number {
  return typeof value === 'number' ? value : Number(value);
}

function compareValues(
  actualValue: unknown,
  conditionType: string,
  conditionValue: unknown
): boolean {
  switch (conditionType.toLowerCase()) {
    case 'equals':
    case 'equal to': {
      const a = normalizeValue(actualValue);
      const b = normalizeValue(conditionValue);
      if (isNumeric(a) && isNumeric(b))
        return Math.abs(toNumber(a) - toNumber(b)) < NUMERIC_EPSILON;
      return a === b;
    }

    case 'not_equals':
    case 'not equal to': {
      const a = normalizeValue(actualValue);
      const b = normalizeValue(conditionValue);
      if (isNumeric(a) && isNumeric(b))
        return Math.abs(toNumber(a) - toNumber(b)) >= NUMERIC_EPSILON;
      return a !== b;
    }

    case 'greater_than':
    case 'greater than':
      return (
        isNumeric(actualValue) &&
        isNumeric(conditionValue) &&
        toNumber(actualValue) > toNumber(conditionValue)
      );

    case 'greater_than_or_equal':
    case 'greater than or equal to':
      return (
        isNumeric(actualValue) &&
        isNumeric(conditionValue) &&
        toNumber(actualValue) >= toNumber(conditionValue)
      );

    case 'less_than':
    case 'less than':
      return (
        isNumeric(actualValue) &&
        isNumeric(conditionValue) &&
        toNumber(actualValue) < toNumber(conditionValue)
      );

    case 'less_than_or_equal':
    case 'less than or equal to':
      return (
        isNumeric(actualValue) &&
        isNumeric(conditionValue) &&
        toNumber(actualValue) <= toNumber(conditionValue)
      );

    case 'contains':
      return (
        typeof actualValue === 'string' &&
        typeof conditionValue === 'string' &&
        actualValue.toLowerCase().includes(conditionValue.toLowerCase())
      );

    case 'not_contains':
    case 'does not contain':
      return (
        typeof actualValue === 'string' &&
        typeof conditionValue === 'string' &&
        !actualValue.toLowerCase().includes(conditionValue.toLowerCase())
      );

    case 'starts_with':
    case 'starts with':
      return (
        typeof actualValue === 'string' &&
        typeof conditionValue === 'string' &&
        actualValue.toLowerCase().startsWith(conditionValue.toLowerCase())
      );

    case 'ends_with':
    case 'ends with':
      return (
        typeof actualValue === 'string' &&
        typeof conditionValue === 'string' &&
        actualValue.toLowerCase().endsWith(conditionValue.toLowerCase())
      );

    case 'in_range':
      return evaluateRangeCondition(actualValue, conditionValue);

    default:
      return false;
  }
}

function evaluateRangeCondition(actualValue: unknown, conditionValue: unknown): boolean {
  if (
    !isNumeric(actualValue) ||
    typeof conditionValue !== 'string' ||
    !conditionValue.includes('-')
  )
    return false;

  const parts = conditionValue.split('-');
  if (parts.length !== 2) return false;
  const [min, max] = parts;
  if (min === undefined || max === undefined || !isNumeric(min) || !isNumeric(max)) return false;

  const actual = toNumber(actualValue);
  return actual >= toNumber(min) && actual <= toNumber(max);
}

/** `(current, next)` logical-operator-pair reduction — ported verbatim from the ingestion path's state machine. */
function normalizeOperatorPair(op1: string, op2: string): 'and' | 'or' {
  const a = op1.toLowerCase();
  const b = op2.toLowerCase();
  if (a === 'and' && b === 'and') return 'and';
  if (a === 'or' && b === 'or') return 'or';
  if (a === 'and' && b === 'or') return 'and';
  if (a === 'or' && b === 'and') return 'or';
  return 'and';
}

function isProductScoped(condition: RuleCondition, productId: string): boolean {
  return !condition.selectedProduct || String(condition.selectedProduct) === productId;
}

function evaluateSingleCondition(
  condition: RuleCondition,
  flattenedPacket: Record<string, unknown>
): boolean {
  const { selectedAttribute, selectedCondition, conditionValue } = condition;

  if (!selectedAttribute || !selectedCondition) return false;

  const actualValue = flattenedPacket[selectedAttribute];
  if (actualValue === null || actualValue === undefined) return false;

  return compareValues(actualValue, selectedCondition, conditionValue ?? null);
}

/**
 * Evaluates a rule's full condition list against one flattened packet.
 * Empty/all-out-of-scope conditions → `matched: false`. A condition whose
 * `selectedProduct` doesn't match `productId` is treated the same as "not
 * matched" for combination purposes (D-0059) — it still participates in
 * the AND/OR/IF state machine at its own index, it just always evaluates
 * to `false`.
 */
export function evaluate(
  conditions: RuleCondition[],
  flattenedPacket: Record<string, unknown>,
  productId: string
): RuleEvaluationResult {
  if (conditions.length === 0) return { matched: false, matchedConditionIndices: [] };

  let finalResult = false;
  const matchedConditionIndices: number[] = [];

  conditions.forEach((condition, index) => {
    const inScope = isProductScoped(condition, productId);
    const currentResult = inScope && evaluateSingleCondition(condition, flattenedPacket);
    if (currentResult) matchedConditionIndices.push(index);

    const operator = (condition.logicalOperator ?? 'and').toLowerCase();

    if (index === 0 || operator === 'if') {
      finalResult = currentResult;
      return;
    }

    const nextCondition = conditions[index + 1];
    const nextOperator = (nextCondition?.logicalOperator ?? operator).toLowerCase();
    const combined = normalizeOperatorPair(operator, nextOperator);
    finalResult = combined === 'and' ? finalResult && currentResult : finalResult || currentResult;
  });

  return { matched: finalResult, matchedConditionIndices };
}
