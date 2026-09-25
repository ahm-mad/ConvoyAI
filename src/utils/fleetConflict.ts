/* eslint-disable @typescript-eslint/no-explicit-any */
import { fullName, when } from '@components/AuditLine';

/** `expected_updated_at` body fragment for a quick action that has no edit form (backend B13, flows/06 §23). */
export const expectedUpdatedAt = (record: any) =>
  record?.updated_at ? { expected_updated_at: record.updated_at } : {};

/**
 * Sentence for a 409 from a quick action (toggle, move a slot …): "changed by Amina Khan at 10:07".
 * `null` when the response is not a 409. `updated_by: null` = an automatic change → "System".
 */
export const conflictMessage = (response: any): string | null => {
  if (response?.status !== 409) return null;

  const c = response.current ?? {};
  const who = fullName(c.updated_by_user) ?? (c.updated_by ? 'another user' : 'System');
  const at = when(c.updated_at);

  return `This record was changed by ${who}${at ? ` at ${at}` : ''}. It has been reloaded — try again.`;
};
