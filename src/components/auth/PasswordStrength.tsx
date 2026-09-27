'use client';

/** 0–4: length, upper + lower case, a digit, a symbol. Purely advisory; the form's own validation decides. */
export const passwordScore = (p: string) => {
  if (!p) return 0;

  let s = 0;

  if (p.length >= 8) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p) && p.length >= 8) s++;

  return Math.max(1, s);
};

const LABEL = ['', 'Weak', 'Fair', 'Good', 'Strong'];
const COLOUR = [
  '',
  'var(--color-danger)',
  'var(--color-gold)',
  'var(--color-moving-bright)',
  'var(--color-moving)',
];

/** Four-segment strength meter under a password field (announced politely for screen readers). */
export default function PasswordStrength({ value }: { value: string }) {
  const s = passwordScore(value);

  if (!value) return null;

  return (
    <div className="mt-2 flex items-center gap-2" role="status" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[1, 2, 3, 4].map(n => (
          <i
            key={n}
            className="h-1.5 flex-1 rounded-full transition-colors"
            style={{ background: n <= s ? COLOUR[s] : 'var(--color-line)' }}
          />
        ))}
      </div>
      <span className="text-caption font-medium text-ink-1">Password strength: {LABEL[s]}</span>
    </div>
  );
}
