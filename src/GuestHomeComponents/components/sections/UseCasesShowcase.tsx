// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { useEffect, useRef, useState } from 'react';
import { useLocation } from '@lib/router-compat';
import { ArrowRight, Phone } from 'lucide-react';
import { Container } from '../../components/ui/Container';
import { Eyebrow } from '../../components/ui/Eyebrow';
import { Button } from '../../components/ui/Button';
import { useCases } from '../../data/useCases';
import { cn } from '../../lib/utils';

const AUTO_ROTATE_MS = 6000;

const accentText = {
  cyan: 'text-accent-cyan',
  green: 'text-accent-green',
  amber: 'text-amber-400',
};
const accentBorder = {
  cyan: 'border-accent-cyan/50',
  green: 'border-accent-green/50',
  amber: 'border-amber-400/50',
};
const accentDot = {
  cyan: 'bg-accent-cyan',
  green: 'bg-accent-green',
  amber: 'bg-amber-400',
};

export function UseCasesShowcase() {
  const location = useLocation();
  const [active, setActive] = useState(0);
  const timerRef = useRef(null);
  const hasInteractedRef = useRef(false);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };
  const startTimer = () => {
    stopTimer();
    timerRef.current = setInterval(() => {
      setActive(i => (i + 1) % useCases.length);
    }, AUTO_ROTATE_MS);
  };

  useEffect(() => {
    startTimer();
    return stopTimer;
  }, []);

  const handleSelect = index => {
    setActive(index);
    if (!hasInteractedRef.current) {
      hasInteractedRef.current = true;
      stopTimer();
    }
  };

  // CaseStudies se navigate hote waqt bheja gaya index yahan apply hota hai
  useEffect(() => {
    const selectedIndex = location.state?.selectedIndex;
    if (typeof selectedIndex === 'number' && useCases[selectedIndex]) {
      handleSelect(selectedIndex);
    }
    // Page hamesha top se dikhe (react-router scroll position auto-reset nahi karta)
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location.state]);

  return (
    <section className="border-line-soft bg-[#030712] py-12 sm:py-16 md:py-24">
      <Container>
        <div className="mx-auto max-w-2xl text-center px-4 sm:px-0">
          <Eyebrow tone="cyan">Across Industries</Eyebrow>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-ink-0 sm:text-3xl md:text-4xl">
            Use Cases
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-1">
            From smart buildings to smart farms, explore how ConvoyAI turns everyday infrastructure
            into a connected, real-time system.
          </p>
        </div>

        <div className="mt-12 sm:mt-16 grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {useCases.map((useCase, index) => {
            const isActive = index === active;
            return (
              <button
                key={useCase.title}
                type="button"
                onClick={() => handleSelect(index)}
                className={cn(
                  'cursor-pointer rounded-2xl border bg-surface-2 p-6 text-left transition-colors',
                  isActive ? accentBorder[useCase.accent] : 'border-line hover:border-ink-2'
                )}
              >
                <p
                  className={cn(
                    'font-mono text-[11px] font-semibold uppercase tracking-wider',
                    accentText[useCase.accent]
                  )}
                >
                  {useCase.tag}
                </p>
                <h3 className="mt-2 text-lg font-semibold text-ink-0">{useCase.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-1">{useCase.description}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-center gap-2">
          {useCases.map((useCase, index) => (
            <button
              key={useCase.title}
              type="button"
              aria-label={`Show ${useCase.title}`}
              onClick={() => handleSelect(index)}
              className={cn(
                'size-1.5 rounded-full transition-all',
                index === active
                  ? cn('w-5', accentDot[useCase.accent])
                  : 'bg-ink-2/60 hover:bg-ink-1'
              )}
            />
          ))}
        </div>

        <div className="relative mx-auto mt-6 max-w-6xl overflow-hidden rounded-2xl border border-line bg-surface-2">
          <div className="relative aspect-video w-full">
            {useCases.map((useCase, index) => (
              <img
                key={useCase.title}
                src={useCase.image}
                alt={useCase.title}
                className={cn(
                  'absolute inset-0 size-full object-cover transition-opacity duration-700 ease-in-out',
                  index === active ? 'opacity-100' : 'opacity-0'
                )}
              />
            ))}
          </div>
        </div>

        <div className="mt-12 sm:mt-20 mx-auto max-w-8xl rounded-2xl border border-line bg-surface-2 p-4 sm:p-6 md:p-10 text-center">
          <h3 className="text-xl font-bold tracking-tight text-ink-0 sm:text-2xl md:text-3xl">
            Turn Any Environment Into An Intelligent System
          </h3>
          <p className="mt-3 sm:mt-4 text-sm sm:text-base leading-relaxed text-ink-1">
            Talk to us about your use case, or start with a demo built around a 3D twin of your
            infrastructure.
          </p>

          <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 sm:gap-6">
            <Button
              className="w-full sm:w-auto cursor-pointer bg-[#1562AE]/80 text-white text-xs sm:text-sm transition-colors hover:scale-103 hover:bg-[#0f4a7f]"
              variant="solid"
              icon={<ArrowRight className="size-4" />}
            >
              Book a Demo
            </Button>

            <button
              type="button"
              className="w-full sm:w-auto flex cursor-pointer border border-line p-2 rounded-sm items-center justify-center sm:justify-start gap-2 text-xs sm:text-sm font-semibold text-accent-cyan transition-colors hover:text-accent-cyan/80"
            >
              <Phone className="size-4" strokeWidth={1.75} />
              Talk to an Expert
            </button>
          </div>
        </div>
      </Container>
    </section>
  );
}
