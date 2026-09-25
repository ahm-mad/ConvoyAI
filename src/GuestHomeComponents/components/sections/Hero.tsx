// @ts-nocheck -- TODO(ts-migration): type this file; see task.md Phase 7
import { useState, useEffect, useRef } from 'react';
import {
  ArrowRight,
  Play,
  Users,
  Droplets,
  Thermometer,
  Wifi,
  Zap,
  ShieldCheck,
  Lightbulb,
  Flame,
} from 'lucide-react';
import { PopupModal } from 'react-calendly';
import { Container } from '../../components/ui/Container';
import { Eyebrow } from '../../components/ui/Eyebrow';
import { Button } from '../../components/ui/Button';
import { heroStats, heroLiveMetrics } from '../../data/hero';
// import heroTwinPoster from "../../assets/hero.png";
import heroTwinVideo from '../../assets/hero-twin.mp4';
import './hero-fonts.css';

const twinFeaturesLeft = [
  { icon: Thermometer, text: 'HVAC & Climate Control' },
  { icon: Zap, text: 'Energy Systems' },
  { icon: Droplets, text: 'Water Leak Detection' },
  { icon: Users, text: 'Occupancy Intelligence' },
];

const twinFeaturesRight = [
  { icon: Lightbulb, text: 'Smart Lighting' },
  { icon: ShieldCheck, text: 'Security & Control' },
  { icon: Flame, text: 'Fire Safety Systems' },
  { icon: Wifi, text: 'Connectivity Networks' },
];

/**
 * Reveals `items` one at a time, IN ORDER, and keeps each one visible
 * once it's finished typing (they stack up). Once all items have been
 * typed out and held for a bit, everything clears and the cycle restarts
 * from the first item. Each call to this hook runs its own independent
 * timer, so left and right can run at the same time without syncing.
 */
function useSequentialReveal(
  items,
  {
    typeSpeed = 45,
    deleteSpeed = 22,
    holdBetween = 250,
    holdAll = 1600,
    clearGap = 150,
    gapTime = 400,
  } = {}
) {
  const [revealIndex, setRevealIndex] = useState(0);
  const [currentText, setCurrentText] = useState('');
  const [completedTexts, setCompletedTexts] = useState(() => Array(items.length).fill(''));
  const [phase, setPhase] = useState('typing'); // 'typing' | 'holding' | 'clearing'
  const [clearIndex, setClearIndex] = useState(items.length - 1);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (phase === 'typing') {
      const full = items[revealIndex].text;

      if (currentText.length < full.length) {
        timeoutRef.current = setTimeout(
          () => setCurrentText(full.slice(0, currentText.length + 1)),
          typeSpeed
        );
      } else {
        timeoutRef.current = setTimeout(() => {
          setCompletedTexts(prev => {
            const next = [...prev];
            next[revealIndex] = full;
            return next;
          });
          setCurrentText('');
          if (revealIndex + 1 < items.length) {
            setRevealIndex(revealIndex + 1);
          } else {
            setPhase('holding');
          }
        }, holdBetween);
      }
    } else if (phase === 'holding') {
      timeoutRef.current = setTimeout(() => {
        setClearIndex(items.length - 1);
        setPhase('clearing');
      }, holdAll);
    } else if (phase === 'clearing') {
      // Delete the text of `clearIndex` one character at a time, then move on
      // to the previous item, one badge at a time (not all at once).
      const text = completedTexts[clearIndex] || '';

      if (text.length > 0) {
        timeoutRef.current = setTimeout(() => {
          setCompletedTexts(prev => {
            const next = [...prev];
            next[clearIndex] = text.slice(0, -1);
            return next;
          });
        }, deleteSpeed);
      } else if (clearIndex > 0) {
        timeoutRef.current = setTimeout(() => setClearIndex(clearIndex - 1), clearGap);
      } else {
        // All items cleared — reset state and restart the cycle, all inside
        // this one timeout so we don't trigger extra effect re-runs before
        // the pause is actually over.
        timeoutRef.current = setTimeout(() => {
          setCompletedTexts(Array(items.length).fill(''));
          setRevealIndex(0);
          setCurrentText('');
          setPhase('typing');
        }, gapTime);
      }
    }

    return () => clearTimeout(timeoutRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentText, phase, revealIndex, clearIndex, completedTexts]);

  const displayedTexts = items.map((item, i) =>
    phase === 'typing' && i === revealIndex ? currentText : completedTexts[i]
  );
  const activeIndex = phase === 'typing' ? revealIndex : phase === 'clearing' ? clearIndex : -1;

  return { displayedTexts, activeIndex };
}

function TypewriterBadge({ icon: Icon, text, isActive }) {
  return (
    <div className="flex w-[88px] xs:w-[105px] sm:w-[130px] md:w-[190px] flex-row items-center gap-1 rounded-md px-1 py-0.5 sm:gap-1.5 sm:px-2 sm:py-1.5">
      <Icon className="size-2 xs:size-2.5 sm:size-3 shrink-0 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] text-accent-green" />
      <p
        style={{ fontFamily: "'Digital7Mono', monospace" }}
        className="text-[7px] xs:text-[8px] sm:text-[10px] md:text-[12px] tracking-wide text-accent-green drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] whitespace-nowrap min-h-[10px] sm:min-h-[15px]"
      >
        {text}
        {isActive && (
          <span className="ml-0.5 inline-block h-1.5 sm:h-2.5 w-[1.5px] sm:w-[2px] translate-y-[1px] animate-pulse bg-accent-green align-middle" />
        )}
      </p>
    </div>
  );
}

export function Hero() {
  const [calendlyOpen, setCalendlyOpen] = useState(false);

  // Lock body scroll while the Calendly popup is open
  useEffect(() => {
    document.body.style.overflow = calendlyOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [calendlyOpen]);

  const left = useSequentialReveal(twinFeaturesLeft, {
    typeSpeed: 45,
    holdBetween: 250,
    holdAll: 1600,
    gapTime: 400,
  });
  const right = useSequentialReveal(twinFeaturesRight, {
    typeSpeed: 45,
    holdBetween: 250,
    holdAll: 1600,
    gapTime: 400,
  });

  return (
    <section id="home" className="relative bg-[#030712] overflow-hidden">
      <div className="pointer-events-none absolute inset-0" />

      <Container className="relative py-10 sm:py-16 md:py-20 lg:py-28">
        {/*
          FIX: `-mt-12` previously had no breakpoint prefix, so it fired on
          mobile too and dragged the heading content up underneath the
          sticky header, clipping the Eyebrow text. Scoped it to `lg:` so it
          only applies on large screens where there's enough top padding
          (`lg:py-28`) to absorb the negative margin safely.
        */}
        <div className="grid gap-8 sm:gap-12 lg:-mt-12 lg:grid-cols-2 lg:items-center lg:gap-12">
          {/* Copy */}
          <div>
            <Eyebrow tone="cyan">Enterprise Digital Twin Intelligence</Eyebrow>

            <h1 className="mt-5 text-[1.75rem] font-extrabold leading-[1.15] tracking-tight text-ink-0 sm:text-3xl md:text-xl lg:text-xl xl:text-5xl">
              The Enterprise <br />
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    'linear-gradient(90deg, #00D3F2 0%, rgba(43, 127, 255, 0.5) 50%, #00D492 100%)',
                }}
              >
                Digital Twin Platform
              </span>{' '}
              for Smart Buildings, Cities &amp; Infrastructure
            </h1>

            <p className="mt-5 sm:mt-6 max-w-xl text-sm sm:text-base leading-relaxed text-ink-1">
              Connect any device. Visualize every asset. Automate operations with AI. ConvoyAI
              transforms real-world infrastructure into intelligent digital twins that improve
              operational efficiency, sustainability, and decision-making.
            </p>

            <div className="flex mt-4  border-line-soft rounded-lg p-2 gap-3 max-md:flex-col">
              <Button
                className="w-full xs:w-auto justify-center text-white cursor-pointer hover:scale-103 bg-[#1562AE]/80 transition-colors hover:bg-[#0f4a7f]"
                variant="solid"
                icon={<ArrowRight className="size-4" />}
                onClick={() => setCalendlyOpen(true)}
              >
                Request Demo
              </Button>
              <Button
                className="w-full xs:w-auto justify-center cursor-pointer"
                variant="ghost"
                icon={<Play className="size-4" />}
              >
                Watch Platform Demo
              </Button>
            </div>

            <dl className=" mt-2 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 border-t border-line-soft pt-8">
              {heroStats.map(stat => (
                <div key={stat.label}>
                  <dt className="sr-only">{stat.label}</dt>
                  <dd className="text-base font-bold text-ink-0 sm:text-2xl md:text-3xl">
                    {stat.value}
                  </dd>
                  <dd className="mt-1 text-xs text-ink-2">{stat.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Live twin panel */}
          <div className="relative rounded-2xl border border-line bg-surface-2 p-3 sm:p-4 shadow-[0_0_0_1px_rgba(34,211,238,0.05),0_30px_80px_-30px_rgba(34,211,238,0.25)]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft pb-3">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex gap-1.5">
                  <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                  <span className="size-2.5 rounded-full bg-[#febc2e]" />
                  <span className="size-2.5 rounded-full bg-[#28c840]" />
                </div>
                <span className="font-mono text-[10px] sm:text-[11px] text-ink-2 truncate">
                  CONVOYAI_CORE_TWIN_v4.2
                </span>
              </div>
              <span className="flex items-center gap-1.5 rounded-full border border-accent-green/30 bg-accent-green/10 px-2.5 py-1 font-mono text-[10px] font-medium text-accent-green whitespace-nowrap">
                <span className="size-1.5 animate-pulse rounded-full bg-accent-green" />
                LIVE STREAMING
              </span>
            </div>

            {/* Video + 4 badges per side: type one by one, hold all visible, then clear and restart */}
            <div className="relative -mx-3 sm:-mx-4 flex items-center justify-center bg-[#030712] py-6 sm:py-8">
              <video
                className="relative h-28 w-auto object-contain xs:h-36 sm:h-64 md:h-80"
                // poster={heroTwinPoster}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                aria-label="Rotating wireframe digital twin of a high-rise building"
              >
                <source src={heroTwinVideo} type="video/mp4" />
              </video>

              {/* Left badges — visible on all screen sizes, hugs the left edge on mobile so it clears the model */}
              <div className="absolute left-0 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1 xs:left-0.5 xs:gap-1.5 sm:left-2 sm:gap-2 md:left-4 md:gap-3">
                {twinFeaturesLeft.map((feature, i) => (
                  <TypewriterBadge
                    key={feature.text}
                    icon={feature.icon}
                    text={left.displayedTexts[i]}
                    isActive={left.activeIndex === i}
                  />
                ))}
              </div>

              {/* Right badges — visible on all screen sizes, hugs the right edge on mobile so it clears the model */}
              <div className="absolute right-0 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1 xs:right-0.5 xs:gap-1.5 sm:right-2 sm:gap-2 md:right-[-2rem] md:gap-3">
                {twinFeaturesRight.map((feature, i) => (
                  <TypewriterBadge
                    key={feature.text}
                    icon={feature.icon}
                    text={right.displayedTexts[i]}
                    isActive={right.activeIndex === i}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 p-2 py-2">
              {heroLiveMetrics.map(metric => (
                <div
                  key={metric.label}
                  className="rounded-xl border border-line-soft bg-surface-3 p-3"
                >
                  <p className="text-xs text-ink-2">{metric.label}</p>
                  <p className="mt-1 text-lg font-bold text-ink-0">{metric.value}</p>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-1">
                    <div
                      className={
                        metric.accent === 'cyan'
                          ? 'h-full rounded-full bg-accent-cyan'
                          : 'h-full rounded-full bg-accent-green'
                      }
                      style={{
                        width: `${metric.percent}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>

      <PopupModal
        url="https://calendly.com/usama-waqas-chirptech/30min"
        pageSettings={{
          backgroundColor: 'ffffff',
          hideEventTypeDetails: false,
          hideLandingPageDetails: false,
          primaryColor: '00B8DB',
          textColor: '1a1a1a',
        }}
        onModalClose={() => setCalendlyOpen(false)}
        open={calendlyOpen}
        rootElement={document.getElementById('root')}
      />
    </section>
  );
}
