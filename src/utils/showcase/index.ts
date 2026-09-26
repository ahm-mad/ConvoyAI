/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolveLists } from './lists';

/**
 * Showcase data layer (portfolio screenshots / videos): when switched on, reads that have a fake-data
 * resolver are answered locally in the real API's response shape; writes become no-op successes.
 * Off by default — the real API path is untouched.
 */
const KEY = 'convoyai-showcase';
export const SHOWCASE_EVENT = 'convoyai:showcase';

export const isShowcase = (): boolean => {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

export const setShowcase = (on: boolean) => {
  try {
    if (on) window.localStorage.setItem(KEY, '1');
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(SHOWCASE_EVENT));
};

/** Response for a GET, or `undefined` when no fake resolver exists (falls through to the real API). */
export function resolveShowcase(
  url: string,
  params: Record<string, unknown> = {}
): any | undefined {
  const path = url.replace(/\?.*$/, '').replace(/\/+$/, '');

  return resolveLists(path, params);
}

/** Successful no-op answer for POST / PUT / PATCH / DELETE while showcase data is on. */
export const showcaseWriteResult = () => ({
  success: true,
  message: 'Saved (showcase data — nothing was stored).',
  data: {},
});
