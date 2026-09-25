import { useCallback, useEffect, useState } from 'react';

/**
 * Row selection for bulk actions. Selection is by id, survives paging, and is cleared whenever
 * `resetKey` changes (e.g. the search/filters) so a bulk action can never touch rows the operator
 * can no longer see.
 *
 * With server-side paging only one page of rows is in memory, so callers may pass the row object(s)
 * along with the id(s); `values` then returns every selected row — including ones on other pages —
 * which a bulk action needs (e.g. to split "active" from "inactive" rows).
 *
 * "All matching" mode (`selectAllMatching(total)`): the operator chose every row that matches the
 * current search / filters, not just the ones loaded. Rows are then not enumerated — a bulk action
 * sends the list's own filter to the backend instead (flows/06 §13, ≤ 500 records). Toggling a row
 * or the page checkbox leaves this mode and falls back to explicit ids.
 */
export function useSelection<T = unknown>(resetKey: string) {
  const [selected, setSelected] = useState<Map<string, T | undefined>>(new Map());
  const [allTotal, setAllTotal] = useState<number | null>(null);

  useEffect(() => {
    setSelected(new Map());
    setAllTotal(null);
  }, [resetKey]);

  const toggle = useCallback(
    (id: string | number, item?: T, pageItems?: (T & { id: string | number })[]) => {
      // Leaving "all matching": keep the visible page selected, minus the row just unticked.
      if (allTotal !== null) {
        setAllTotal(null);
        setSelected(
          new Map(
            (pageItems ?? [])
              .filter(i => String(i.id) !== String(id))
              .map(i => [String(i.id), i as T] as [string, T])
          )
        );

        return;
      }

      setSelected(prev => {
        const next = new Map(prev);
        const key = String(id);

        if (next.has(key)) next.delete(key);
        else next.set(key, item);

        return next;
      });
    },
    [allTotal]
  );

  const setMany = useCallback(
    (ids: (string | number)[], on: boolean, items?: T[]) => {
      // Unticking "select page" while everything is selected clears the whole selection.
      if (allTotal !== null) {
        setAllTotal(null);
        setSelected(new Map());

        return;
      }

      setSelected(prev => {
        const next = new Map(prev);

        ids.forEach((id, i) => (on ? next.set(String(id), items?.[i]) : next.delete(String(id))));

        return next;
      });
    },
    [allTotal]
  );

  const clear = useCallback(() => {
    setSelected(new Map());
    setAllTotal(null);
  }, []);

  const selectAllMatching = useCallback((total: number) => {
    setSelected(new Map());
    setAllTotal(total);
  }, []);

  return {
    selected,
    /** Number selected — every matching row in "all matching" mode. */
    count: allTotal ?? selected.size,
    /** True when the operator selected everything matching the current filters. */
    allMatching: allTotal !== null,
    ids: [...selected.keys()],
    isSelected: (id: string | number) => allTotal !== null || selected.has(String(id)),
    selectAllMatching,
    /** Every selected row object (only those that were passed in with their id). */
    values: [...selected.values()].filter((v): v is T => v !== undefined),
    toggle,
    setMany,
    clear,
  };
}
