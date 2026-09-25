// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { Container } from '../../components/ui/Container';
import { Eyebrow } from '../../components/ui/Eyebrow';
import { whyChooseCards } from '../../data/whyChoose';
import { accentClasses, cn } from '../../lib/utils';
export function WhyChoose() {
  return (
    <section className=" bg-[#030712] border-line-soft py-24">
      <Container>
        <div className="mx-auto  max-w-2xl text-center">
          <Eyebrow tone="cyan">Enterprise Grade</Eyebrow>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink-0 sm:text-4xl">
            Why Global Organizations Choose ConvoyAI
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-1">
            We build infrastructure software that is highly secure, open, scalable, and resilient
            enough for mission-critical operations.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {whyChooseCards.map(card => {
            const Icon = card.icon;
            const a = accentClasses[card.accent];
            return (
              <div key={card.title} className="rounded-xl border border-line bg-surface-2 p-6">
                <span
                  className={cn(
                    'flex size-10 items-center justify-center rounded-lg border',
                    a.bg,
                    a.border
                  )}
                >
                  <Icon className={cn('size-5', a.text)} strokeWidth={1.75} />
                </span>
                <h3 className="mt-4 text-base font-semibold text-ink-0">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-1">{card.description}</p>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
