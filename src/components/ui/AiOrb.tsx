export type AiOrbState = 'idle' | 'thinking' | 'speaking';

/**
 * The Convoy AI presence: a glowing conic orb whose motion tells what the assistant is doing — breathing when idle,
 * spinning fast with ripples and an orbiting spark while it thinks, pulsing to a voice-like rhythm while it answers.
 * Size comes from the caller (`size-10`, `size-14`…). Purely decorative; the chat announces state in text.
 */
export default function AiOrb({
  state = 'idle',
  className = 'size-10',
}: {
  state?: AiOrbState;
  className?: string;
}) {
  return (
    <span className={`ai-orb ${className}`} data-state={state} aria-hidden>
      <span className="ai-orb__glow" />
      <span className="ai-orb__ripple" />
      <span className="ai-orb__ripple ai-orb__ripple--late" />
      <span className="ai-orb__ring" />
      <span className="ai-orb__core" />
      <span className="ai-orb__spark" />
    </span>
  );
}
