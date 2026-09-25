// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7

/**
 * On/off switch (replaces MUI Switch). Calls `onChange` with a checkbox-like event (`target.checked`) so
 * existing MUI / react-hook-form handlers keep working. Colours come from the design tokens.
 */
export default function GlobalToggle({
  checked,
  onChange,
  disabled = false,
  name = undefined,
  ...props
}) {
  const on = Boolean(checked);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange?.({ target: { type: 'checkbox', checked: !on, name } }, !on)}
      className={`relative h-[25px] w-[42px] shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${on ? 'btn-brand' : 'bg-surface-3'}`}
      {...props}
    >
      <span
        className={`absolute left-0 top-[2px] size-[21px] rounded-full bg-white shadow-card transition-transform ${on ? 'translate-x-[19px]' : 'translate-x-[2px]'}`}
      />
    </button>
  );
}
