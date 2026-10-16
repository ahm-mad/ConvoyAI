import { describe, expect, it } from 'vitest';
import {
  AddComponentsRequestSchema,
  BulkUpdateComponentsRequestSchema,
  UpdateComponentRequestSchema,
} from '../assets.schemas.js';

/** D-0126: the real frontend's payload must pass `AssetController::addComponent`'s validation. */
describe("AddComponentsRequestSchema (Laravel's TrimStrings / ConvertEmptyStringsToNull / boolean / integer rules)", () => {
  const FRONTEND_ENTRY = {
    name: 'floor 1',
    icon: 'BuildingIcon',
    component_type: '',
    inventory_check: '0',
    company_id: 23595,
    device_id: '',
    product_id: '',
    parent_id: null,
  };

  it("accepts the frontend's payload: string flag, empty strings for unset values, extra keys ignored", () => {
    const parsed = AddComponentsRequestSchema.parse({ components: [FRONTEND_ENTRY] });

    expect(parsed.components[0]).toEqual({
      name: 'floor 1',
      icon: 'BuildingIcon',
      component_type: null,
      inventory_check: false,
      device_id: null,
      product_id: null,
      parent_id: null,
    });
  });

  it.each([
    [true, true],
    [false, false],
    [1, true],
    [0, false],
    ['1', true],
    ['0', false],
    [null, null],
  ])('inventory_check %j → %j', (input, expected) => {
    const parsed = AddComponentsRequestSchema.parse({
      components: [{ name: 'x', inventory_check: input }],
    });
    expect(parsed.components[0]?.inventory_check).toBe(expected);
  });

  it.each(['true', 'yes', 2, '2', 'abc'])(
    'inventory_check %j is rejected (not a Laravel boolean)',
    input => {
      expect(
        AddComponentsRequestSchema.safeParse({
          components: [{ name: 'x', inventory_check: input }],
        }).success
      ).toBe(false);
    }
  );

  it('trims strings; a blank name fails `required`', () => {
    expect(
      AddComponentsRequestSchema.parse({ components: [{ name: '  Floor  ' }] }).components[0]?.name
    ).toBe('Floor');
    expect(AddComponentsRequestSchema.safeParse({ components: [{ name: '   ' }] }).success).toBe(
      false
    );
    expect(AddComponentsRequestSchema.safeParse({ components: [{}] }).success).toBe(false);
  });

  it('ids are `integer`: numeric strings pass, non-integers do not', () => {
    const ok = AddComponentsRequestSchema.parse({
      components: [{ name: 'x', parent_id: '5', device_id: 7 }],
    });
    expect(ok.components[0]).toMatchObject({ parent_id: '5', device_id: 7 });
    for (const bad of ['abc', '5.5', 5.5]) {
      expect(
        AddComponentsRequestSchema.safeParse({ components: [{ name: 'x', parent_id: bad }] })
          .success
      ).toBe(false);
    }
  });

  it('position_x/y are `numeric|between:0,1`: numeric strings pass as numbers, out of range fails', () => {
    const ok = AddComponentsRequestSchema.parse({
      components: [{ name: 'x', position_x: '0.25', position_y: 1 }],
    });
    expect(ok.components[0]).toMatchObject({ position_x: 0.25, position_y: 1 });
    expect(
      AddComponentsRequestSchema.safeParse({ components: [{ name: 'x', position_x: 1.5 }] }).success
    ).toBe(false);
    expect(
      AddComponentsRequestSchema.safeParse({ components: [{ name: 'x', position_y: 'abc' }] })
        .success
    ).toBe(false);
  });

  it('`components` must be a non-empty array', () => {
    expect(AddComponentsRequestSchema.safeParse({ components: [] }).success).toBe(false);
    expect(AddComponentsRequestSchema.safeParse({}).success).toBe(false);
  });
});

/** D-0127 */
describe('UpdateComponentRequestSchema (`PUT /components/{id}`)', () => {
  it("accepts the frontend's string flag and empty strings, without inventing keys it didn't send", () => {
    const parsed = UpdateComponentRequestSchema.parse({
      name: ' Floor 2 ',
      inventory_check: '1',
      device_id: '',
      parent_id: '',
      component_type: '',
    }) as Record<string, unknown>;

    expect(parsed).toEqual({
      name: 'Floor 2',
      inventory_check: true,
      device_id: null,
      parent_id: null,
      component_type: null,
    });
    expect('product_id' in parsed).toBe(false);
  });

  it.each([
    [true, true],
    [false, false],
    [1, true],
    ['0', false],
    ['1', true],
    [null, null],
  ])('inventory_check %j → %j (no type rule in Laravel, any scalar)', (input, expected) => {
    const parsed = UpdateComponentRequestSchema.parse({ inventory_check: input }) as {
      inventory_check: unknown;
    };
    expect(parsed.inventory_check).toBe(expected);
  });

  it('an explicit blank name fails `sometimes|required`; ids must still be integers', () => {
    expect(UpdateComponentRequestSchema.safeParse({ name: '' }).success).toBe(false);
    expect(UpdateComponentRequestSchema.safeParse({ device_id: 'abc' }).success).toBe(false);
  });
});

describe('BulkUpdateComponentsRequestSchema (`PUT /components/bulk-update`)', () => {
  it('accepts string ids and blank values (which become null)', () => {
    const parsed = BulkUpdateComponentsRequestSchema.parse({
      components: [{ id: '5', name: 'A', parent_id: '', icon: '' }],
    });
    expect(parsed.components[0]).toEqual({ id: '5', name: 'A', parent_id: null, icon: null });
  });

  it('id is required and must be an integer', () => {
    expect(
      BulkUpdateComponentsRequestSchema.safeParse({ components: [{ name: 'A' }] }).success
    ).toBe(false);
    expect(BulkUpdateComponentsRequestSchema.safeParse({ components: [{ id: 'x' }] }).success).toBe(
      false
    );
    expect(BulkUpdateComponentsRequestSchema.safeParse({ components: [] }).success).toBe(false);
  });
});
