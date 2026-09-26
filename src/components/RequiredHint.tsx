/** Tells the user why a form's submit button is disabled. Renders nothing when nothing is missing. */
export default function RequiredHint({ missing }: { missing: string[] }) {
  if (missing.length === 0) return null;

  return (
    <p className="mb-2 text-caption text-ink-2" role="status">
      Required: {missing.join(', ')}
    </p>
  );
}
