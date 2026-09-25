// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { ArrowDown } from 'lucide-react';
import { Container } from '../../components/ui/Container';
import { Eyebrow } from '../../components/ui/Eyebrow';
import { architectureLayers } from '../../data/architecture';
import { cn } from '../../lib/utils';
export function SystemArchitecture() {
  return (
    <section id="showcase" className=" bg-[#030712] py-24">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow tone="green">System Architecture</Eyebrow>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink-0 sm:text-4xl">
            The ConvoyAI Unified Intelligence Engine
          </h2>
          <p className="mt-4 text-base leading-relaxed text-ink-1">
            Our multi-layered technology stack unifies physical environments with advanced digital
            simulation, real-time analytics, and autonomous AI automation.
          </p>
        </div>

        <div className="mx-auto mt-16 flex max-w-3xl flex-col">
          {architectureLayers.map((layer, i) => {
            const Icon = layer.icon;
            const isLast = i === architectureLayers.length - 1;
            const accentText = layer.accent === 'green' ? 'text-accent-blue' : 'text-accent-blue';
            const accentBg =
              layer.accent === 'green'
                ? 'bg-accent-blue/10 border-accent-blue/25'
                : 'bg-accent-blue/10 border-accent-blue/25';
            return (
              <div key={layer.index}>
                <div className="flex items-start gap-5 rounded-xl  border-line bg-surface-2 p-6">
                  <div
                    className={cn(
                      'flex size-11 shrink-0 items-center justify-center rounded-lg border',
                      accentBg
                    )}
                  >
                    <Icon className={cn('size-5', accentText)} strokeWidth={1.75} />
                  </div>
                  <div>
                    <p
                      className={cn(
                        'font-mono text-[11px] font-medium uppercase tracking-[0.15em]',
                        accentText
                      )}
                    >
                      Layer {layer.index}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-ink-0">{layer.name}</h3>
                    <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-1">
                      {layer.description}
                    </p>
                  </div>
                </div>

                {!isLast && (
                  <div className="flex  justify-center py-2">
                    <ArrowDown
                      className={cn(
                        'size-4 ',
                        architectureLayers[i + 1].accent === 'green'
                          ? ' text-accent-blue'
                          : 'text-accent-blue'
                      )}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
