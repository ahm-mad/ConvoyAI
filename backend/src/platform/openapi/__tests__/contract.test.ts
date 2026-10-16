import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { buildContract } from '../contract.js';
import { companionDrift, readContract, renderContract } from '../contract-file.js';

// Building the contract type-checks the whole project once (~6 s), so build it once for all assertions.
const built = await buildContract();
const doc = built.document as {
  paths: Record<string, Record<string, Record<string, any>>>;
  components: { schemas: Record<string, unknown> };
};

// the contract has grown to 300+ operations: rendering / diffing it can take a few seconds when the machine is busy (the default 5 s timeout flaked under load)
describe(
  'API contract (backend_frontend_sync/api_contract/openapi.yaml index + api_contract/openapi/*.yaml modules)',
  { timeout: 30_000 },
  () => {
    it('has no unmatched operations: every mounted route is documented and vice versa', () => {
      expect(built.problems).toEqual([]);
    });

    it('is identical to the committed files (index + every module under backend_frontend_sync/api_contract/openapi/) — run `npm run openapi:write` after changing the API', () => {
      expect(parse(renderContract(built.document))).toEqual(readContract());
    });

    it("keeps the companion's generated endpoint index in sync", () => {
      expect(companionDrift(built.document)).toBe(false);
    });

    it('derives auth from the real guards', () => {
      expect(doc.paths['/login']?.['post']?.['x-auth']).toBe('public');
      expect(doc.paths['/login']?.['post']?.['responses']['401'].description).toContain(
        'Invalid credentials'
      );
      expect(doc.paths['/rules']?.['get']?.['responses']['401']).toEqual({
        $ref: '#/components/responses/Unauthenticated',
      });

      const companies = doc.paths['/companies']?.['get'];
      expect(companies?.['x-required-roles']).toEqual(['platform_operator']);
      expect(companies?.['responses']['403'].description).toContain(
        'Requires role: platform_operator'
      );

      const vehicles = doc.paths['/vehicles']?.['get'];
      expect(vehicles?.['x-required-permissions']).toEqual(['all-fleet']);
    });

    it('documents lenient request shapes from the schemas the handlers really use', () => {
      const body =
        doc.paths['/assets/{id}/components']?.['post']?.['requestBody'].content['application/json']
          .schema;
      expect(JSON.stringify(body)).toContain('"pattern":"^[+-]?\\\\d+$"'); // integer strings accepted for ids
    });

    it('derives response shapes from the code and documents Laravel-parity quirks', () => {
      const products = doc.paths['/products']?.['get'];
      expect(products?.['x-quirks'].join(' ')).toContain('offset-style');
      // both variants of the 200 (normal + `success:false` for an empty user filter) are present
      const ok = JSON.stringify(products?.['responses']['200']);
      expect(ok).toContain('anyOf');
      expect(ok).toContain('"success":{"const":false}');
    });
  }
);
