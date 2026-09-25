/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * "Created by Ali · 25 Sep 2026, 10:14 — Last edited by Sara · 26 Sep 2026, 09:02" for any fleet record
 * (backend B6, flows/06 §19): `created_by_user` / `updated_by_user` = `{ id, first_name, last_name }` or
 * `null`, `created_at` / `updated_at` as always.
 *
 * `null` is ambiguous on purpose — the wording is ours to choose:
 *  - no `created_by` at all  → the record predates auditing: show dates only, never invent a person;
 *  - `created_by` set and `updated_by` null → the last change was automatic (a tracker / sensor): "System".
 * "Last edited" is only shown when something actually changed after creation.
 */
export const fullName = (u: any) =>
  u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || null : null;

export const when = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

export default function AuditLine({
  record,
  className = 'text-[10px] text-ink-2',
}: {
  record: any;
  className?: string;
}) {
  if (!record) return null;

  const creator = fullName(record.created_by_user);
  const editor = fullName(record.updated_by_user);
  const createdAt = when(record.created_at);
  const updatedAt = when(record.updated_at);

  // Something changed after creation: a later timestamp (a few seconds of slack) or a different actor.
  const changed =
    !!record.updated_at &&
    !!record.created_at &&
    (new Date(record.updated_at).getTime() - new Date(record.created_at).getTime() > 5000 ||
      String(record.updated_by ?? '') !== String(record.created_by ?? ''));
  const editedBy = editor ?? (record.created_by ? 'System' : null);

  const created = createdAt ? `Created${creator ? ` by ${creator}` : ''} · ${createdAt}` : null;
  const edited =
    changed && updatedAt ? `Last edited${editedBy ? ` by ${editedBy}` : ''} · ${updatedAt}` : null;

  if (!created && !edited) return null;

  return (
    <div className={className}>
      {created}
      {created && edited ? ' — ' : ''}
      {edited}
    </div>
  );
}
