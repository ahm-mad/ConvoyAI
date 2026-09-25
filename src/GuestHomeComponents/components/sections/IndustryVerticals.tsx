// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { Container } from '../../components/ui/Container';
import { Eyebrow } from '../../components/ui/Eyebrow';
import { industries } from '../../data/industries';
export function IndustryVerticals() {
  return (
    <section className=" bg-[#030712] border-line-soft py-24">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow tone="blue">Tailored Solutions</Eyebrow>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-ink-0 sm:text-4xl">
            Engineered for Your Industry Vertical
          </h2>
          <p className="mt-4  text-base leading-relaxed text-ink-1">
            Whether managing a single high-rise commercial building or coordinating a nationwide
            smart grid, ConvoyAI provides specialized, pre-configured models tailored to your
            operation.
          </p>
        </div>

        <div className="mt-20 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {industries.map(item => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="relative  mx-auto w-full max-w-[280px] pt-8">
                {/* icon badge — sits OUTSIDE the clipped card, so it never gets cropped */}
                <span className="absolute -top-0  left-1/2 z-10 flex size-16 -translate-x-1/2 items-center justify-center rounded-full bg-gradient-to-br from-accent-blue/60 to-surface-2 shadow-lg shadow-accent-blue/20 ring-1 ring-white/10">
                  <Icon className="size-6 text-accent-cyan" strokeWidth={1.75} />
                </span>

                {/* card body — this is the only element with overflow-hidden */}
                <div
                  className="relative flex  h-[200px] flex-col overflow-hidden rounded-2xl border border-line bg-surface-2 pb-6 pt-10 px-6"
                  style={{
                    background:
                      'radial-gradient(190% 100% at 0% 30%, #1562AE66 0%, transparent 60%)',
                  }}
                >
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        'radial-gradient(80% 60% at 50% 0%, #1562AE66 0%, transparent 70%)',
                    }}
                  />
                  <div className="relative">
                    <h3 className="mt-2 text-base font-semibold text-ink-0">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-1">{item.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
