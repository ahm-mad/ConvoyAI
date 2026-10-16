import { describe, expect, it } from 'vitest';
import { evaluate, type RuleCondition } from '../rule-condition-evaluator.js';

function condition(overrides: Partial<RuleCondition>): RuleCondition {
  return {
    selectedProduct: null,
    selectedAttribute: 'objectJSON.temp',
    selectedCondition: 'equals',
    conditionValue: '21',
    logicalOperator: 'and',
    ...overrides,
  };
}

describe('evaluate — single condition', () => {
  it('matches a simple numeric equals', () => {
    const result = evaluate([condition({})], { 'objectJSON.temp': 21 }, 'p1');
    expect(result).toEqual({ matched: true, matchedConditionIndices: [0] });
  });

  it('missing attribute value -> condition false (no last-segment fallback, unlike packet-history)', () => {
    const result = evaluate(
      [condition({ selectedAttribute: 'objectJSON.missing' })],
      { 'objectJSON.temp': 21 },
      'p1'
    );
    expect(result).toEqual({ matched: false, matchedConditionIndices: [] });
  });

  it('null attribute value -> condition false', () => {
    const result = evaluate([condition({})], { 'objectJSON.temp': null }, 'p1');
    expect(result.matched).toBe(false);
  });

  it('empty conditions array -> false', () => {
    expect(evaluate([], {}, 'p1')).toEqual({ matched: false, matchedConditionIndices: [] });
  });

  it('unknown operator -> false', () => {
    const result = evaluate(
      [condition({ selectedCondition: 'resembles' })],
      { 'objectJSON.temp': 21 },
      'p1'
    );
    expect(result.matched).toBe(false);
  });
});

describe('evaluate — product scoping (D-0059)', () => {
  it('no selectedProduct on the condition -> always in scope', () => {
    const result = evaluate(
      [condition({ selectedProduct: null })],
      { 'objectJSON.temp': 21 },
      'p1'
    );
    expect(result.matched).toBe(true);
  });

  it('selectedProduct matches productId -> in scope, evaluated normally', () => {
    const result = evaluate(
      [condition({ selectedProduct: 'p1' })],
      { 'objectJSON.temp': 21 },
      'p1'
    );
    expect(result.matched).toBe(true);
  });

  it('selectedProduct does not match productId -> out of scope, treated as false (behavior change vs. old ingestion path)', () => {
    const result = evaluate(
      [condition({ selectedProduct: 'p2' })],
      { 'objectJSON.temp': 21 },
      'p1'
    );
    expect(result).toEqual({ matched: false, matchedConditionIndices: [] });
  });
});

describe('evaluate — AND/OR/IF state machine (rule-engine.md §3 col 1)', () => {
  it('two AND conditions: both must match', () => {
    const conditions = [
      condition({ selectedAttribute: 'a', conditionValue: '1', logicalOperator: 'and' }),
      condition({ selectedAttribute: 'b', conditionValue: '2', logicalOperator: 'and' }),
    ];
    expect(evaluate(conditions, { a: 1, b: 2 }, 'p1').matched).toBe(true);
    expect(evaluate(conditions, { a: 1, b: 3 }, 'p1').matched).toBe(false);
  });

  it('two OR conditions: either matching is enough', () => {
    const conditions = [
      condition({ selectedAttribute: 'a', conditionValue: '1', logicalOperator: 'or' }),
      condition({ selectedAttribute: 'b', conditionValue: '2', logicalOperator: 'or' }),
    ];
    expect(evaluate(conditions, { a: 9, b: 2 }, 'p1').matched).toBe(true);
    expect(evaluate(conditions, { a: 9, b: 9 }, 'p1').matched).toBe(false);
  });

  it("'if' resets the running result to the current condition regardless of prior state", () => {
    const conditions = [
      condition({ selectedAttribute: 'a', conditionValue: '1', logicalOperator: 'and' }), // false
      condition({ selectedAttribute: 'b', conditionValue: '2', logicalOperator: 'if' }), // resets here
    ];
    // index0 false, but index1 is 'if' -> resets finalResult to index1's own value (true)
    expect(evaluate(conditions, { a: 9, b: 2 }, 'p1').matched).toBe(true);
  });

  it("with exactly two conditions, the second condition's own operator alone decides AND vs OR (the look-ahead to a nonexistent next index defaults to its own operator — index 0's operator is never consulted for combination, only checked for 'if')", () => {
    const withAnd = [
      condition({ selectedAttribute: 'a', conditionValue: '1', logicalOperator: 'or' }), // op irrelevant at index 0
      condition({ selectedAttribute: 'b', conditionValue: '2', logicalOperator: 'and' }),
    ];
    expect(evaluate(withAnd, { a: 1, b: 9 }, 'p1').matched).toBe(false); // AND: b must also match

    const withOr = [
      condition({ selectedAttribute: 'a', conditionValue: '1', logicalOperator: 'and' }), // op irrelevant at index 0
      condition({ selectedAttribute: 'b', conditionValue: '2', logicalOperator: 'or' }),
    ];
    expect(evaluate(withOr, { a: 1, b: 9 }, 'p1').matched).toBe(true); // OR: a alone is enough
  });

  it("3 conditions: the (current, next) look-ahead pair genuinely combines two different operators — (and,or) at index 1 reduces to 'and'", () => {
    const conditions = [
      condition({ selectedAttribute: 'x', conditionValue: '1', logicalOperator: 'and' }), // index 0, op irrelevant
      condition({ selectedAttribute: 'y', conditionValue: '2', logicalOperator: 'and' }), // pair with index 2's "or" -> "and"
      condition({ selectedAttribute: 'z', conditionValue: '3', logicalOperator: 'or' }),
    ];
    // x matches, y does NOT match, z does NOT match either:
    // index0 -> finalResult=true; index1 pair(and,or)="and" -> true && false = false;
    // index2 pair(or,or)="or" (no index 3, defaults to own op) -> false || false = false.
    expect(evaluate(conditions, { x: 1, y: 9, z: 9 }, 'p1').matched).toBe(false);

    // Same shape but index1's own operator is "or" instead of "and": pair(or,or)="or" at
    // index1 -> true || false = true regardless of y; confirms the operator choice, not
    // some other accident, is what drove the previous case's "false".
    const orVariant = [
      condition({ selectedAttribute: 'x', conditionValue: '1', logicalOperator: 'and' }),
      condition({ selectedAttribute: 'y', conditionValue: '2', logicalOperator: 'or' }),
      condition({ selectedAttribute: 'z', conditionValue: '3', logicalOperator: 'or' }),
    ];
    expect(evaluate(orVariant, { x: 1, y: 9, z: 9 }, 'p1').matched).toBe(true);
  });

  it('returns matchedConditionIndices for every individually-true condition, independent of final combination', () => {
    const conditions = [
      condition({ selectedAttribute: 'a', conditionValue: '1', logicalOperator: 'and' }),
      condition({ selectedAttribute: 'b', conditionValue: '2', logicalOperator: 'and' }),
    ];
    const result = evaluate(conditions, { a: 1, b: 9 }, 'p1');
    expect(result.matched).toBe(false);
    expect(result.matchedConditionIndices).toEqual([0]);
  });
});

describe("evaluate — operator vocabulary (rule-engine.md §3 row 'Operator vocabulary')", () => {
  it.each([
    ['equals', '21', 21, true],
    ['equal to', '21', 21, true],
    ['not_equals', '21', 22, true],
    ['not equal to', '21', 21, false],
    ['greater_than', '20', 21, true],
    ['greater than or equal to', '21', 21, true],
    ['less_than', '22', 21, true],
    ['less than or equal to', '21', 21, true],
  ] as const)(
    'numeric operator %s(%s) against %s -> %s',
    (op, conditionValue, actual, expected) => {
      const result = evaluate(
        [condition({ selectedAttribute: 'a', selectedCondition: op, conditionValue })],
        { a: actual },
        'p1'
      );
      expect(result.matched).toBe(expected);
    }
  );

  it.each([
    ['contains', 'ell', 'hello', true],
    ['does not contain', 'xyz', 'hello', true],
    ['starts_with', 'he', 'hello', true],
    ['ends with', 'lo', 'hello', true],
  ] as const)(
    "string operator %s('%s') against '%s' -> %s",
    (op, conditionValue, actual, expected) => {
      const result = evaluate(
        [condition({ selectedAttribute: 'a', selectedCondition: op, conditionValue })],
        { a: actual },
        'p1'
      );
      expect(result.matched).toBe(expected);
    }
  );

  it("in_range: numeric actual within 'min-max' string", () => {
    const result = evaluate(
      [
        condition({
          selectedAttribute: 'a',
          selectedCondition: 'in_range',
          conditionValue: '10-30',
        }),
      ],
      { a: 21 },
      'p1'
    );
    expect(result.matched).toBe(true);
  });

  it("in_range: numeric actual outside 'min-max' string", () => {
    const result = evaluate(
      [
        condition({
          selectedAttribute: 'a',
          selectedCondition: 'in_range',
          conditionValue: '10-20',
        }),
      ],
      { a: 21 },
      'p1'
    );
    expect(result.matched).toBe(false);
  });

  it('string operators are case-insensitive', () => {
    const result = evaluate(
      [condition({ selectedAttribute: 'a', selectedCondition: 'contains', conditionValue: 'ELL' })],
      { a: 'hello' },
      'p1'
    );
    expect(result.matched).toBe(true);
  });
});

describe("evaluate — boolean coercion (rule-engine.md §3 row 'Boolean coercion')", () => {
  it("boolean synonyms: 'true'/'yes'/'on' -> true, 'false'/'no'/'off' -> false", () => {
    for (const truthy of ['true', 'yes', 'on', 'TRUE', ' Yes ']) {
      expect(
        evaluate(
          [
            condition({
              selectedAttribute: 'a',
              selectedCondition: 'equals',
              conditionValue: truthy,
            }),
          ],
          { a: true },
          'p1'
        ).matched
      ).toBe(true);
    }
    for (const falsy of ['false', 'no', 'off']) {
      expect(
        evaluate(
          [
            condition({
              selectedAttribute: 'a',
              selectedCondition: 'equals',
              conditionValue: falsy,
            }),
          ],
          { a: false },
          'p1'
        ).matched
      ).toBe(true);
    }
  });
});

describe('evaluate — golden pairs, rule-engine.md §3.1 concrete divergence cases', () => {
  it("boolean true vs conditionValue 'true' with 'equals' matches under the canonical evaluator (all 4 old evaluators happened to agree here too)", () => {
    const result = evaluate(
      [
        condition({
          selectedAttribute: 'objectJSON.door_open',
          selectedCondition: 'equals',
          conditionValue: 'true',
        }),
      ],
      { 'objectJSON.door_open': true },
      'p1'
    );
    expect(result.matched).toBe(true);
  });

  it("§3.1's separating case: numeric 2 vs conditionValue '1' with 'equals' — canonical evaluator (device/widget-path semantics) says false", () => {
    // device/widget path normalizes 2 -> int 2, "1" -> int 1, 2 !== 1 -> false.
    // (Assets' normalizeBool path diverged here in Laravel — a real
    // cross-evaluator disagreement the deep-dive flagged; the canonical
    // evaluator adopts the device/widget path's answer per D-0059/§6.)
    const result = evaluate(
      [condition({ selectedAttribute: 'a', selectedCondition: 'equals', conditionValue: '1' })],
      { a: 2 },
      'p1'
    );
    expect(result.matched).toBe(false);
  });

  it('epsilon-based float equality (§6 point 2): 21.0 vs 21 across JSON round-tripping still matches, unlike a strict === would require', () => {
    const result = evaluate(
      [condition({ selectedAttribute: 'a', selectedCondition: 'equals', conditionValue: '21' })],
      { a: 21.00001 },
      'p1'
    );
    expect(result.matched).toBe(true); // within 1e-4 epsilon
  });

  it('epsilon boundary: a difference >= 1e-4 does not match', () => {
    const result = evaluate(
      [condition({ selectedAttribute: 'a', selectedCondition: 'equals', conditionValue: '21' })],
      { a: 21.001 },
      'p1'
    );
    expect(result.matched).toBe(false);
  });
});
