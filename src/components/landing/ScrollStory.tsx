'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, MapPinned, Radar, Sparkles } from 'lucide-react';
import type { LiveVehicle } from '@components/map/vehicle/vehicleKinds';
import VehicleLayer from '@components/map/layers/VehicleLayer';
import GeofenceLayer from '@components/map/layers/GeofenceLayer';
import MissionRouteLayer, { type MissionRoute } from '@components/map/layers/MissionRouteLayer';
import RouteContextLayer from '@components/map/layers/RouteContextLayer';
import LazyMount from './LazyMount';
import { useSampleFleet } from './useSampleFleet';

const ConvoyMap = dynamic(() => import('@components/map/ConvoyMap'), { ssr: false });

const STEPS = [
  {
    icon: Radar,
    eyebrow: 'Step 1',
    title: 'See the whole fleet at a glance.',
    body: 'Every vehicle reporting a position, grouped into clean counts the moment you zoom out. No spreadsheet, no refresh button.',
  },
  {
    icon: MapPinned,
    eyebrow: 'Step 2',
    title: 'Follow any trip in real time.',
    body: 'Pick a truck and its road lights up: where it started, where it is headed, and every yard it passes on the way.',
  },
  {
    icon: AlertTriangle,
    eyebrow: 'Step 3',
    title: 'Know the moment something changes.',
    body: 'A vehicle enters a yard, leaves a geofence, or starts speeding — ConvoyAI raises it before a dispatcher has to notice.',
  },
  {
    icon: Sparkles,
    eyebrow: 'Step 4',
    title: 'Let the copilot close the loop.',
    body: 'Every alert comes with a next step already worked out: reroute, reassign, or flag for maintenance.',
  },
] as const;

/** Believable place a scripted step drives the camera to (fallback if the sample fleet has not loaded yet), as
 * [lat, lon] — the `<ConvoyMap center>` prop's convention, which converts it to MapLibre's own [lon, lat] order. */
const FALLBACK_CENTER: [number, number] = [30.9, 72.5];
/** The same point as [lon, lat], for the raw `map.easeTo`/`jumpTo` calls below (MapLibre's native order — mixing the
 * two orders up is an easy, silent mistake: coordinates stay "valid" numbers, just projected in the wrong place). */
const FALLBACK_LONLAT: [number, number] = [FALLBACK_CENTER[1], FALLBACK_CENTER[0]];

/**
 * Pinned map that narrates itself as the visitor scrolls: fleet overview → one trip highlighted → a geofence event →
 * an alert with the copilot's suggestion. Desktop-only choreography (a sticky map beside scrolling steps); below
 * `lg` the steps still read fine as a plain stack above a static map preview, and reduced motion skips the flights.
 */
export default function ScrollStory() {
  const { vehicles, sim, data } = useSampleFleet(10);
  const [active, setActive] = useState(0);
  const [map, setMap] = useState<any>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);
  const reduce = useRef(false);

  useEffect(() => {
    reduce.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Which step is nearest the middle of the viewport, checked on scroll/resize (rAF-throttled). A plain scroll-position
  // read rather than IntersectionObserver: it needs no negative-margin trickery and is exactly as cheap.
  useEffect(() => {
    let raf = 0;
    let ticking = false;

    const pick = () => {
      ticking = false;
      if (window.matchMedia('(max-width: 1023px)').matches) return;

      const mid = window.innerHeight / 2;
      let best = 0;
      let bestDist = Infinity;

      stepRefs.current.forEach((el, i) => {
        if (!el) return;

        const r = el.getBoundingClientRect();
        const d = Math.abs((r.top + r.bottom) / 2 - mid);

        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      setActive(best);
    };

    const onScroll = () => {
      if (ticking) return;

      ticking = true;
      raf = requestAnimationFrame(pick);
    };

    pick();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  // Pick one believable moving trip vehicle and one yard the sample fleet actually uses, once the data is ready.
  const cast = useMemo(() => {
    if (!sim || !data) return null;

    const trip = vehicles.find(v => {
      if (v.state !== 'moving') return false;

      const r = sim.missionRoute(v.id);

      return !!r?.fromName && r.fromName !== r.toName;
    });
    const speeder = vehicles.find(v => v.state === 'moving' && v.speed > 60) ?? trip;
    const yard = data.yards[2];

    return { trip: trip ?? vehicles[0], speeder: speeder ?? vehicles[0], yard };
  }, [sim, data, vehicles]);

  const [selected, setSelected] = useState<string | null>(null);
  const [highlightYard, setHighlightYard] = useState(false);
  const [toast, setToast] = useState<0 | 1 | 2 | null>(null);
  // A snapshot the effect reads once per step change: `cast` itself is a useMemo keyed on `vehicles`, which the
  // simulation refreshes every 700 ms, and depending on `cast` directly would restart the effect (and cancel its
  // toast timers, which take longer than 700 ms to fire) on every single tick.
  const castRef = useRef(cast);

  castRef.current = cast;

  useEffect(() => {
    const cast = castRef.current;

    if (!map || !cast) return;

    const ease = (opts: any) => map[reduce.current ? 'jumpTo' : 'easeTo'](opts);

    setHighlightYard(false);
    setToast(null);

    if (active === 0) {
      setSelected(null);
      ease({ center: FALLBACK_LONLAT, zoom: 6.4, pitch: 0, bearing: 0, duration: 1400 });
    } else if (active === 1) {
      setSelected(cast.trip.id);
      ease({ center: [cast.trip.lon, cast.trip.lat], zoom: 9.4, pitch: 40, duration: 1600 });
    } else if (active === 2) {
      setSelected(null);
      setHighlightYard(true);
      ease({
        center: [Number(cast.yard.longitude), Number(cast.yard.latitude)],
        zoom: 12.5,
        pitch: 30,
        duration: 1600,
      });
      const t = setTimeout(() => setToast(0), reduce.current ? 0 : 900);

      return () => clearTimeout(t);
    } else {
      setSelected(cast.speeder.id);
      ease({ center: [cast.speeder.lon, cast.speeder.lat], zoom: 11, pitch: 45, duration: 1600 });
      const t1 = setTimeout(() => setToast(1), reduce.current ? 0 : 900);
      const t2 = setTimeout(() => setToast(2), reduce.current ? 300 : 2600);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // `cast` itself is read from the ref above (see its comment); `!!cast` only flips once, from not-ready to ready,
    // so it re-runs this exactly once if a step is reached before the sample fleet has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, map, !!cast]);

  const path = useMemo<[number, number][] | null>(() => {
    const r = sim && selected ? sim.missionRoute(selected) : null;

    return r ? [...[...r.behind].reverse(), ...r.ahead.slice(1)] : null;
  }, [sim, selected]);

  return (
    <section id="how-map-thinks" className="page-container scroll-mt-24 pb-24">
      <div className="mx-auto max-w-[640px] text-center">
        <div className="eyebrow">The map, up close</div>
        <h2 className="page-title mt-3">Scroll through what it sees.</h2>
      </div>

      <div ref={wrap} className="relative mt-12 lg:grid lg:grid-cols-[1fr_1.15fr] lg:gap-10">
        {/* Steps */}
        <div className="flex flex-col gap-6 lg:gap-0">
          {STEPS.map((s, i) => {
            const Icon = s.icon;

            return (
              <div
                key={s.title}
                ref={el => {
                  stepRefs.current[i] = el;
                }}
                data-step={i}
                className="lg:flex lg:min-h-[80vh] lg:items-center"
              >
                <div
                  className={`glass p-7 transition-opacity lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none ${active === i ? 'lg:opacity-100' : 'lg:opacity-40'}`}
                >
                  <span className="brand-gradient-bg grid size-11 place-items-center rounded-card shadow-glow">
                    <Icon size={20} className="text-white" aria-hidden />
                  </span>
                  <div className="eyebrow mt-4">{s.eyebrow}</div>
                  <h3 className="card-title mt-2 !text-[1.4rem]">{s.title}</h3>
                  <p className="mt-2 text-body text-ink-1">{s.body}</p>
                  {/* Map preview under the step on small screens, where nothing is pinned. */}
                  {i === 0 && (
                    <div className="mt-6 h-[260px] overflow-hidden rounded-card lg:hidden">
                      <LazyMount rootMargin="300px" className="h-full">
                        <StoryMap
                          vehicles={vehicles}
                          sim={sim}
                          data={data}
                          selected={null}
                          path={null}
                          highlightYard={false}
                          onReady={() => {}}
                          interactiveHint={false}
                        />
                      </LazyMount>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Pinned map (desktop only) */}
        <div className="relative hidden lg:block">
          <div className="sticky top-24 h-[76vh] max-h-[640px] overflow-hidden rounded-modal shadow-card">
            <LazyMount rootMargin="200px" className="h-full">
              <StoryMap
                vehicles={vehicles}
                sim={sim}
                data={data}
                selected={selected}
                path={path}
                highlightYard={highlightYard}
                onReady={setMap}
                interactiveHint
              />
            </LazyMount>
            {toast !== null && (
              <div
                key={toast}
                className="motion-rise absolute bottom-5 left-5 right-5 z-10 glass-strong p-4"
                role="status"
              >
                {toast === 0 && (
                  <p className="text-control text-ink-0">
                    <b>Prime Mover 18</b> entered <b>{cast?.yard.name}</b> · on schedule
                  </p>
                )}
                {toast === 1 && (
                  <p className="text-control text-ink-0">
                    <b>{cast?.speeder.name.split(' · ')[0]}</b> is doing{' '}
                    <b>{Math.round(cast?.speeder.speed ?? 0)} km/h</b> — over the limit
                  </p>
                )}
                {toast === 2 && (
                  <div className="flex items-start gap-2.5">
                    <span className="btn-ai grid size-7 shrink-0 place-items-center rounded-control">
                      <Sparkles size={13} fill="currentColor" />
                    </span>
                    <p className="text-control text-ink-1">
                      Copilot: flag the driver for a coaching note — this is the third alert this
                      week.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** The actual map + layers, shared by the sticky desktop panel and the small-screen preview. */
function StoryMap({
  vehicles,
  sim,
  data,
  selected,
  path,
  highlightYard,
  onReady,
  interactiveHint,
}: {
  vehicles: LiveVehicle[];
  sim: typeof import('@utils/showcase/simulation') | null;
  data: typeof import('@utils/showcase/dataset') | null;
  selected: string | null;
  path: [number, number][] | null;
  highlightYard: boolean;
  onReady: (map: any) => void;
  interactiveHint: boolean;
}) {
  return (
    <div className="relative size-full bg-surface-2">
      <ConvoyMap
        look="light"
        mode="3d"
        center={FALLBACK_CENTER}
        zoom={6.4}
        interactive={false}
        onReady={onReady}
        ariaLabel="Sample fleet story map"
      >
        {sim && (
          <MissionRouteLayer
            vehicleId={selected}
            read={sim.missionRoute as (id: string) => MissionRoute | null}
            preview={false}
            yards={data?.yards}
          />
        )}
        {data && <RouteContextLayer path={path} yards={data.yards} geofences={data.geofences} />}
        <GeofenceLayer
          geofences={highlightYard && data ? data.geofences.filter(g => !!g.yard_id) : []}
          yards={highlightYard ? (data?.yards ?? []) : []}
          showGeofences={highlightYard}
          showYards={highlightYard}
        />
        <VehicleLayer
          vehicles={vehicles}
          iconStyle="silhouette"
          selectedId={selected}
          onSelect={() => {}}
          speedLabel={v => `${Math.round(v.speed)} km/h`}
          trails
        />
      </ConvoyMap>
      {!interactiveHint && (
        <div className="pointer-events-none absolute inset-0 bg-black/[0.02]" aria-hidden />
      )}
    </div>
  );
}
