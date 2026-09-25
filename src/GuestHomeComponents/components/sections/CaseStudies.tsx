// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { useNavigate } from '@lib/router-compat';
import { Container } from '../../components/ui/Container';
import { Eyebrow } from '../../components/ui/Eyebrow';
import { caseStudies } from '../../data/caseStudies';
import { cn } from '../../lib/utils';

const accentText = {
  cyan: 'text-accent-cyan',
  green: 'text-accent-green',
  amber: 'text-amber-400',
};

export function CaseStudies() {
  const navigate = useNavigate();

  const goToUseCase = index => {
    navigate('/use-cases', { state: { selectedIndex: index } });
  };

  return (
    <section className="bg-[#030712] border-line-soft py-12 sm:py-16 md:py-24">
      <Container>
        <div className="mx-auto max-w-2xl text-center px-4 sm:px-0">
          <Eyebrow tone="cyan">Proven Impact</Eyebrow>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-ink-0 sm:text-3xl md:text-4xl">
            Enterprise Case Studies
          </h2>
          <p className="mt-4 text-sm sm:text-base leading-relaxed text-ink-1">
            Discover how global enterprises, municipal infrastructure, and facility operators drive
            operational efficiency and reach sustainability targets with ConvoyAI.
          </p>
        </div>

        <div className="mt-12 sm:mt-16 grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
          {caseStudies.map((study, index) => (
            <button
              key={study.title}
              type="button"
              onClick={() => goToUseCase(index)}
              className="flex h-full cursor-pointer flex-col rounded-2xl border border-line bg-surface-2 p-6 text-left transition-colors hover:border-ink-2"
            >
              <p
                className={cn(
                  'font-mono text-[11px] font-semibold uppercase tracking-wider',
                  accentText[study.accent]
                )}
              >
                {study.tag}
              </p>

              <h3 className="mt-2 line-clamp-2 min-h-[3.5rem] text-lg font-semibold text-ink-0">
                {study.title}
              </h3>

              <p className="mt-3 line-clamp-4 min-h-[5.5rem] text-sm leading-relaxed text-ink-1">
                {study.description}
              </p>
            </button>
          ))}
        </div>
      </Container>
    </section>
  );
}
