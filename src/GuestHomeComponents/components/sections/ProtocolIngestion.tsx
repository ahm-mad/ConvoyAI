// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { Check } from 'lucide-react';
import { Container } from '../../components/ui/Container';
import { Eyebrow } from '../../components/ui/Eyebrow';
import { ingestionChecklist, protocols } from '../../data/protocols';

function FlowLines() {
  return (
    <svg
      viewBox="0 0 118 258"
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#flow-lines-clip)" fill="none">
        <path
          d="M0 34.6C39.3333 97.5333 78.6667 129 118 129"
          stroke="#00B8DB"
          strokeOpacity="0.3"
          strokeWidth="2.36"
          strokeDasharray="4.72 4.72"
        />
        <path
          d="M0 81.8C39.3333 113.267 78.6667 129 118 129"
          stroke="#00B8DB"
          strokeOpacity="0.3"
          strokeWidth="2.36"
          strokeDasharray="4.72 4.72"
        />
        <path
          d="M0 129H118"
          stroke="#00B8DB"
          strokeOpacity="0.3"
          strokeWidth="2.36"
          strokeDasharray="4.72 4.72"
        />
        <path
          d="M0 176.2C39.3333 144.733 78.6667 129 118 129"
          stroke="#00B8DB"
          strokeOpacity="0.3"
          strokeWidth="2.36"
          strokeDasharray="4.72 4.72"
        />
        <path
          d="M0 223.4C39.3333 160.467 78.6667 129 118 129"
          stroke="#00B8DB"
          strokeOpacity="0.3"
          strokeWidth="2.36"
          strokeDasharray="4.72 4.72"
        />
      </g>
      <defs>
        <clipPath id="flow-lines-clip">
          <rect width="118" height="258" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

export function ProtocolIngestion() {
  const leftProtocols = protocols.filter(p => p.side === 'left');
  const rightProtocols = protocols.filter(p => p.side === 'right');

  return (
    <section id="protocol-ingestion" className="py-12 bg-[#030712] sm:py-16 md:py-24">
      <Container>
        <div className="grid gap-8 sm:gap-12 lg:gap-16 grid-cols-1 lg:grid-cols-2 lg:items-center">
          <div>
            <Eyebrow tone="blue">Universal Ingestion</Eyebrow>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-ink-0 sm:text-3xl md:text-4xl">
              Protocol Agnostic by Design
            </h2>
            <p className="mt-4 max-w-lg text-sm sm:text-base leading-relaxed text-ink-1">
              ConvoyAI bridges the gap between legacy industrial machinery, building management
              protocols, modern IoT networks, and cloud APIs. Seamlessly stream live data without
              hardware lock-in or complex middleware.
            </p>

            <ul className="mt-8 space-y-5">
              {ingestionChecklist.map(item => (
                <li key={item.title} className="flex  gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-green/15">
                    <Check className="size-3.5 text-accent-green" strokeWidth={3} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink-0">{item.title}</p>
                    <p className="mt-0.5 text-sm text-ink-1">{item.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Ingestion core panel */}
          <div className="relative overflow-hidden rounded-2xl border border-line bg-surface-2 p-3 sm:p-6">
            <div className="flex justify-center">
              <p className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 sm:px-4 py-1 text-center font-mono text-[9px] sm:text-[11px] font-medium uppercase tracking-[0.1em] sm:tracking-[0.2em] text-cyan-300">
                ConvoyAI Ingestion Core
              </p>
            </div>

            <div className="mt-4 sm:mt-6 flex items-center py-3 sm:py-6 gap-x-[1%]">
              <ul className="flex-1 space-y-2 sm:space-y-3 min-w-0">
                {leftProtocols.map(p => (
                  <li
                    key={p.name}
                    className="flex items-center justify-between gap-2 sm:gap-3 text-[10px] sm:text-sm text-ink-1 min-w-0"
                  >
                    <span className="truncate min-w-0">{p.name}</span>
                    <span className="grid shrink-0 size-1.5 sm:size-2.5 place-items-center">
                      <span className="col-start-1 row-start-1 block h-full w-full rounded-full bg-accent-green opacity-75 animate-ping" />
                      <span className="col-start-1 row-start-1 block h-full w-full rounded-full bg-accent-green shadow-[0_0_6px_#22c55e]" />
                    </span>
                  </li>
                ))}
              </ul>

              {/* FIX: gave this wrapper an explicit width instead of relying on
                  flex-content sizing. Safari resolves a replaced element's
                  width:100% (the <svg>) to 0 when its containing flex item has
                  no defined width of its own — Chrome is lenient about this,
                  Safari is not. The w-[Npx] values below scale down at smaller
                  breakpoints and match the SVG's 118-wide viewBox at sm+. */}
              <div className="flex w-[70px] sm:w-[118px] shrink-0 h-40 max-md:h-32 items-center justify-center">
                <FlowLines />
              </div>

              <ul className="flex-1 space-y-2 sm:space-y-3 min-w-0">
                {rightProtocols.map(p => (
                  <li
                    key={p.name}
                    className="flex items-center justify-between gap-2 sm:gap-3 text-[10px] sm:text-sm text-ink-1 min-w-0"
                  >
                    <span className="grid shrink-0 size-1.5 sm:size-2.5 place-items-center">
                      <span className="col-start-1 row-start-1 block h-full w-full rounded-full bg-accent-green opacity-75 animate-ping" />
                      <span className="col-start-1 row-start-1 block h-full w-full rounded-full bg-accent-green shadow-[0_0_6px_#22c55e]" />
                    </span>
                    <span className="truncate min-w-0">{p.name}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* NOTE: `xs:` is not a default Tailwind breakpoint. If you haven't
                added `screens: { xs: '...' }` in tailwind.config, these
                xs: classes do nothing in ANY browser and this row stays
                flex-col permanently. Swapped to `sm:` below to match the rest
                of the component's responsive scale — change back to `xs:`
                only if you've actually configured that breakpoint. */}
            <div className="flex flex-col gap-1.5 sm:gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-line-soft pt-3 sm:pt-4 font-mono text-[9px] sm:text-[11px] text-ink-2">
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-accent-blue" />
                Ingestion Rate: 42,490 msg/sec
              </span>
              <span>Packet Loss: 0.000%</span>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
