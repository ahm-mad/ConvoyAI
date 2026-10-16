import { describe, expect, it } from 'vitest';
import { phpIntCast } from '../php-cast.js';

describe('phpIntCast (PHP (int) semantics)', () => {
  it.each([
    [true, 1],
    [false, 0],
    [1, 1],
    [0, 0],
    [2, 2],
    [1.9, 1],
    [-1.9, -1],
    [null, 0],
    [undefined, 0],
    ['1', 1],
    ['0', 0],
    ['true', 0],
    ['1abc', 1],
    [' 12', 12],
    ['1e2', 100],
    ['', 0],
    [[], 0],
    [[0], 1],
    [{}, 0],
    [{ a: 1 }, 1],
  ])('(int) %j → %d', (input, expected) => {
    expect(phpIntCast(input)).toBe(expected);
  });
});
