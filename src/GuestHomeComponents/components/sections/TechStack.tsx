// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { useState } from 'react';
import { Container } from '../../components/ui/Container';
import { Eyebrow } from '../../components/ui/Eyebrow';
import { techStack } from '../../data/techStack';
import { cn } from '../../lib/utils';
export function TechStack() {
  const [active, setActive] = useState(0);
  const dots = [0, 1, 2];
  return (
    <section className=" bg-[#030712] border-line-soft py-24">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow tone="blue">Interoperable Tech Stack</Eyebrow>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink-0 sm:text-4xl">
            Powering the Future of Digital Twins
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-1">
            ConvoyAI integrates with leading-edge engineering, web, and spatial technologies to
            deliver a robust, high-performance, and secure experience.
          </p>
        </div>

        <div className="mx-auto mt-14 flex max-w-3xl flex-wrap items-center justify-center gap-x-10 gap-y-6">
          {techStack.map(item => {
            const Icon = item.icon;
            return (
              <span
                key={item.name}
                className="flex items-center gap-2 text-sm font-medium text-ink-1"
              >
                <Icon className={cn('size-4', item.accent)} strokeWidth={1.75} />
                {item.name}
              </span>
            );
          })}
        </div>

        <div className="mt-8 flex items-center justify-center gap-2">
          {dots.map(dot => (
            <button
              key={dot}
              type="button"
              onClick={() => setActive(dot)}
              aria-label={`Show tech stack slide ${dot + 1}`}
              className={cn(
                'size-1.5 rounded-full transition-colors',
                dot === active ? 'bg-accent-cyan' : 'bg-line'
              )}
            />
          ))}
        </div>
      </Container>
    </section>
  );
}
