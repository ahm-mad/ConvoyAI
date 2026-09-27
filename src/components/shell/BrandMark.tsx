import { Route as RouteIcon } from 'lucide-react';

/** The ConvoyAI logo: gradient tile + wordmark. Sizes follow the type/radius tokens. */
export default function BrandMark({
  size = 'md',
  className = '',
  tone = 'default',
}: {
  size?: 'md' | 'lg';
  className?: string;
  /** `light` = white wordmark for dark backgrounds (the auth screens' night map). */
  tone?: 'default' | 'light';
}) {
  const big = size === 'lg';

  return (
    <span className={`flex shrink-0 items-center gap-2.5 ${className}`}>
      <span
        className={`brand-gradient-bg grid place-items-center shadow-glow ${big ? 'size-11 rounded-[14px]' : 'size-8 rounded-[10px]'}`}
      >
        <RouteIcon size={big ? 24 : 17} className="text-white" strokeWidth={2.4} />
      </span>
      <span
        className={`font-semibold tracking-tight ${tone === 'light' ? 'text-white' : 'text-ink-0'} ${big ? 'text-2xl' : 'text-[16px]'}`}
      >
        Convoy
        <em
          className={`font-serif pl-0.5 italic ${tone === 'light' ? 'text-brand-soft' : 'text-brand-text'} ${big ? 'text-[28px]' : 'text-[19px]'}`}
        >
          AI
        </em>
      </span>
    </span>
  );
}
