// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { useState } from 'react';
import { Orbit, LayoutGrid, Droplets, Zap, Wind } from 'lucide-react';
import { Container } from '../../components/ui/Container';
import { Eyebrow } from '../../components/ui/Eyebrow';
import { cn } from '../../lib/utils';
// import floorplanImg from '../../../assets/Floor.png';

const viewTabs = [
  { key: 'floorplan', label: 'Floor Plan', icon: LayoutGrid },
  { key: 'orbit', label: 'Orbit', icon: Orbit },
];

const statusCards = [
  {
    icon: Droplets,
    accent: 'rose',
    title: 'Water Leak Detection',
    status: 'CRITICAL',
    description: 'Telemetry detected abnormal moisture flow in Basement Zone B-4.',
    action: {
      label: 'Isolation Valve #12',
      cta: 'SHUTDOWN',
    },
  },
  {
    icon: Zap,
    accent: 'green',
    title: 'Energy Monitoring',
    status: 'OPTIMAL',
    description: 'Platform optimized power consumption across all elevator banks.',
    metric: {
      label: 'Daily Savings:',
      value: '-18.4% kWh',
    },
  },
  {
    icon: Wind,
    accent: 'blue',
    title: 'HVAC Optimization',
    status: 'BALANCED',
    description: 'Dynamic temperature control based on active room occupancy graphs.',
    metric: {
      label: 'CO2 Levels:',
      value: '412 ppm (Safe)',
    },
  },
];

const statusAccent = {
  rose: {
    text: 'text-[#E7000B]',
    bg: 'bg-[#E7000B]/10',
    badge: 'bg-[#E7000B]/15 text-[#E7000B]',
  },
  green: {
    text: 'text-accent-green',
    bg: 'bg-accent-green/10',
    badge: 'bg-accent-green/15 text-accent-green',
  },
  blue: {
    text: 'text-[#1562AE]',
    bg: 'bg-[#1562AE]/40',
    badge: 'bg-[#1562AE]/15 text-[#1562AE]',
  },
};

export function SpatialIntelligenceIntro() {
  const [activeTab, setActiveTab] = useState('floorplan');

  return (
    <section className=" bg-[#030712] border-line-soft py-12 sm:py-16 md:py-24">
      <Container>
        <div className="mx-auto max-w-2xl text-center px-4 sm:px-0">
          <Eyebrow tone="blue">Immersive Visualization</Eyebrow>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-ink-0 sm:text-3xl md:text-4xl">
            Real-Time Spatial Intelligence
          </h2>
          <p className="mt-4 text-sm sm:text-base leading-relaxed text-ink-1">
            Interact with high-fidelity digital twins of your facilities. Monitor building maps,
            indoor navigation, and environmental performance down to the individual HVAC valve.
          </p>
        </div>

        <div className="mt-12 sm:mt-16 grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-5">
          {/* 3D building showcase */}
          <div className="rounded-2xl  border-line bg-surface-2 p-4 sm:p-5 lg:col-span-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center  gap-2 text-sm font-semibold text-ink-0">
                {(() => {
                  const activeMeta = viewTabs.find(t => t.key === activeTab);
                  const ActiveIcon = activeMeta.icon;
                  return <ActiveIcon className="size-4 text-accent-cyan" strokeWidth={1.75} />;
                })()}
                Interactive 3D Building Showcase
              </p>
              <div className="flex items-center gap-4">
                {viewTabs.map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      'text-xs font-medium  cursor-pointer transition-colors',
                      activeTab === tab.key ? 'text-ink-0' : 'text-ink-2 hover:text-ink-1'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/*
              Responsive stage: height steps up per breakpoint so the SVG
              never gets cropped or floats in too much empty space.
              The SVG itself is sized by width (w-full h-auto) so it scales
              fluidly with the container instead of jumping between fixed
              px heights - this is what keeps it sharp from small phones
              up through wide desktop columns.
             */}
            <div
              className="relative mt-6 flex border border-line-soft h-80 items-center justify-center overflow-hidden rounded-xl px-3 sm:px-6"
              style={{
                background:
                  'linear-gradient(to bottom, #1562AE66 70%, rgba(21,98,174,0) 100%, rgba(21,98,174,0) 100%)',
              }}
            >
              {activeTab === 'orbit' && (
                <svg
                  viewBox="0 0 400 200"
                  preserveAspectRatio="xMidYMid meet"
                  className="h-auto w-full max-w-[420px] text-accent-blue/70"
                  fill="none"
                >
                  {/* Floor 3 diamond - purple tint (Server Room) */}
                  <polygon
                    points="200,20 320,70 200,120 80,70"
                    stroke="currentColor"
                    strokeWidth="1"
                    fill="#c084fc22"
                    className="text-purple-400/70"
                  />
                  {/* Floor 2 diamond - cyan tint (HVAC) */}
                  <polygon
                    points="200,60 320,110 200,160 80,110"
                    stroke="currentColor"
                    strokeWidth="1"
                    fill="#22d3ee22"
                    className="text-accent-cyan/60"
                  />
                  {/* Floor 1 diamond - unchanged (rose / water leak) */}
                  <polygon
                    points="200,100 320,150 200,200 80,150"
                    stroke="currentColor"
                    strokeWidth="1"
                    className="text-[#E7000B]/50"
                  />

                  {/* Floor 3: dot sits on the top apex of the top diamond */}
                  <circle cx="200" cy="20" r="3" className="fill-purple-400" />
                  <text
                    x="210"
                    y="17"
                    fontSize="10"
                    fontFamily="monospace"
                    fill="currentColor"
                    className="text-ink-1"
                  >
                    Floor 3: Server Room Hotspot
                  </text>

                  {/* Floor 2: dot sits on the right vertex of the middle diamond */}
                  <circle cx="260" cy="110" r="3" className="fill-accent-cyan" />
                  <text
                    x="268"
                    y="113"
                    fontSize="10"
                    fontFamily="monospace"
                    fill="currentColor"
                    className="text-ink-1"
                  >
                    Floor 2: Active HVAC
                  </text>

                  {/* Floor 1: dot sits on the left vertex of the bottom diamond */}
                  <circle cx="80" cy="150" r="3" className="fill-[#E7000B]" />
                  <text
                    x="90"
                    y="153"
                    fontSize="10"
                    fontFamily="monospace"
                    fill="currentColor"
                    className="text-ink-1"
                  >
                    Floor 1: Water Leak Detected
                  </text>
                </svg>
              )}

              {/* {activeTab === 'floorplan' && (
                <img
                  src={floorplanImg}
                  alt="Floor plan hologram"
                  className="h-full w-full max-w-[420px] object-contain"
                />
              )} */}

              <div
                className="absolute bottom-3 left-3 w-40 shrink-0 rounded-lg px-3 py-2 backdrop-blur"
                style={{
                  background:
                    'linear-gradient(to bottom, #1562AE66 100%, rgba(21,98,174,0) 100%, rgba(21,98,174,0) 100%)',
                }}
              >
                <p className="font-mono text-[9px] uppercase tracking-wider text-ink-2">
                  Selected Component
                </p>
                <p className="mt-1 text-sm font-semibold text-ink-0">Chiller Unit #4B</p>
                <div className="mt-1.5 flex gap-4 font-mono text-[10px] text-ink-2">
                  <span>
                    Flow Rate <span className="text-ink-0">12.4 L/s</span>
                  </span>
                  <span>
                    Temp <span className="text-accent-green">6.2 °C</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Status cards */}
          <div className="flex flex-col  gap-4 lg:col-span-2">
            {statusCards.map(card => {
              const Icon = card.icon;
              const a = statusAccent[card.accent];
              return (
                <div key={card.title} className="rounded-xl border border-line bg-surface-2 p-4">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center Enterprise Case Studies gap-2 text-sm font-semibold text-ink-0">
                      <span
                        className={cn('flex size-7 items-center justify-center rounded-lg', a.bg)}
                      >
                        <Icon className={cn('size-3.5', a.text)} strokeWidth={1.75} />
                      </span>
                      {card.title}
                    </p>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 font-mono text-[10px] font-medium',
                        a.badge
                      )}
                    >
                      {card.status}
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-ink-1">{card.description}</p>

                  {card.action && (
                    <div className="mt-3 flex   items-center justify-between rounded-lg bg-[#1562AE66] px-3 py-2">
                      <span className="text-xs text-ink-1">{card.action.label}</span>
                      <span className="rounded-md bg-[#E7000B] px-2.5 py-1 font-mono text-[10px] font-semibold text-white">
                        {card.action.cta}
                      </span>
                    </div>
                  )}

                  {card.metric && (
                    <div className="mt-3 flex  items-center justify-between border-t border-line-soft pt-2 text-xs">
                      <span className="text-ink-2">{card.metric.label}</span>
                      <span className={cn('font-mono font-semibold', a.text)}>
                        {card.metric.value}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Container>
    </section>
  );
}
