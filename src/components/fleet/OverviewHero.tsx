/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowUpRight, Cpu, Route, Sparkles, Wrench, Clock } from 'lucide-react';
import { useUser } from '@contexts/UserContext';
import { useSimpleQuery } from '@hooks/useSimpleQuery';
import { useModal } from '@contexts/ModalContext';
import VehicleDetailModal from '@components/VehicleDetailModal';
import Scenery3D from '@components/map/layers/Scenery3D';
import VehicleLayer from '@components/map/layers/VehicleLayer';
import { vehicleFromPosition, type LiveVehicle } from '@components/map/vehicle/vehicleKinds';
import { useMapPrefs } from '@components/map/useMapPrefs';
import { isShowcase } from '@utils/showcase';
import { getDemoSpeed } from '@utils/showcase/simulation';
import { formatQty } from '@utils/units';
import { useUnits } from '@hooks/useUnits';
import { useCompanyMoney } from '@hooks/useCompanyMoney';

const ConvoyMap = dynamic(() => import('@components/map/ConvoyMap'), { ssr: false });

const FALLBACK_CENTER: [number, number] = [24.8607, 67.0011];

const ask = (question: string) =>
  window.dispatchEvent(new CustomEvent('convoy:copilot', { detail: { question } }));

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

/** Static, clearly-labelled preview insights (no AI backend yet). */
const INSIGHTS = [
  {
    icon: Wrench,
    tone: 'bg-gold-wash text-gold-ink icon-tile icon-tile--gold',
    title: 'Brake wear likely in 9 days',
    text: 'Three vehicles show a 31% rise in hard stops.',
    cta: 'Schedule service',
    q: 'Predict maintenance for next month',
  },
  {
    icon: Route,
    tone: 'bg-brand-wash text-brand icon-tile',
    title: 'Reroute 14 trips via M-9',
    text: 'Avoids the highway closure and saves 46 min each.',
    cta: 'See route options',
    q: 'Which vehicles will cost the most in fuel this week?',
  },
  {
    icon: Clock,
    tone: 'bg-danger/10 text-danger-text icon-tile icon-tile--danger',
    title: '3 drivers near hours limit',
    text: 'Predicted breach before 19:00 on current routes.',
    cta: 'Reassign trips',
    q: 'Who is at risk of an hours-of-service breach?',
  },
];

/** Fleet Overview hero: greeting, live map from real positions, and AI insight cards (preview data). */
export default function OverviewHero({
  vehicles,
  inService,
  attention,
}: {
  vehicles?: number | null;
  inService?: number | null;
  attention?: number | null;
}) {
  const { user } = useUser();
  const money = useCompanyMoney();
  const { data } = useSimpleQuery<any>(
    'fleet-positions-hero',
    '/api/fleet/positions',
    { limit: 300 },
    {
      refetchInterval: isShowcase() ? 700 : 60000,
    }
  );
  const positions: any[] = data?.success ? (data.data ?? []) : [];
  const total: number = data?.success ? (data.meta?.total ?? positions.length) : 0;

  const { fresh, stale, center } = useMemo(() => {
    const now = Date.now();
    const valid = positions.filter(
      p => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))
    );
    const isFresh = (p: any) =>
      p.recorded_at && (now - new Date(p.recorded_at).getTime()) / 60000 < 15;
    const f = valid.filter(isFresh);
    const c = valid[0]
      ? ([Number(valid[0].latitude), Number(valid[0].longitude)] as [number, number])
      : FALLBACK_CENTER;
    return { fresh: f, stale: valid.filter(p => !isFresh(p)), center: c };
  }, [positions]);

  const [mapPrefs] = useMapPrefs();
  const { openModal } = useModal();
  const u = useUnits();
  const [glMap, setGlMap] = useState<any>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const fitted = useRef(false);
  const vehicles_: LiveVehicle[] = useMemo(
    () => positions.map(vehicleFromPosition).filter(Boolean) as LiveVehicle[],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- positions identity follows the query data
    [data]
  );

  // Open on the whole fleet once the map and the first positions are there.
  useEffect(() => {
    if (!glMap || fitted.current || vehicles_.length === 0) return;

    fitted.current = true;

    const xs = vehicles_.map(v => v.lon);
    const ys = vehicles_.map(v => v.lat);

    glMap.fitBounds(
      [
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
      ],
      { padding: 50, maxZoom: 11, duration: 0 }
    );
  }, [glMap, vehicles_]);
  const name = user?.first_name || 'there';

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Fleet command</div>
          <h1 className="page-display mt-1.5">
            {greeting()}, <i className="text-brand">{name}.</i>
          </h1>
          <p className="mt-3 max-w-[620px] text-[15px] text-ink-1">
            {vehicles != null ? (
              <>
                <b className="text-ink-0">{vehicles}</b> vehicles in your fleet
                {inService != null && (
                  <>
                    , <b className="text-ink-0">{inService}</b> in service
                  </>
                )}
                {attention ? (
                  <>
                    , and <b className="text-ink-0">{attention}</b> items need attention.
                  </>
                ) : (
                  '.'
                )}
              </>
            ) : (
              'Your fleet at a glance.'
            )}{' '}
            Convoy AI has <b className="text-ink-0">3 suggestions</b> that could save about{' '}
            <b className="text-ink-0">{money(412_000)}</b> this week.
          </p>
        </div>
        <button
          type="button"
          onClick={() => ask('Summarise yesterday')}
          className="btn-ai flex items-center gap-2 rounded-full px-5 py-3 text-[13px] font-semibold transition-transform hover:-translate-y-px"
        >
          <Sparkles size={15} fill="currentColor" /> Summarise yesterday
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="glass relative h-[460px] overflow-hidden rounded-modal p-0">
          <ConvoyMap
            look={mapPrefs.look}
            mode={mapPrefs.mode}
            center={center}
            zoom={6}
            scrollZoom={false}
            onReady={setGlMap}
            ariaLabel="Live fleet overview map"
          >
            <Scenery3D />
            <VehicleLayer
              vehicles={vehicles_}
              iconStyle={mapPrefs.iconStyle}
              selectedId={selected}
              onSelect={setSelected}
              speedLabel={v => formatQty(u.speed, v.speed, 0)}
              motionScale={isShowcase() ? getDemoSpeed() : 1}
              onOpen={v => openModal(<VehicleDetailModal vehicleId={v.id} />)}
            />
          </ConvoyMap>
          <div className="radar-sweep z-[450]" aria-hidden />
          <div className="pointer-events-none absolute left-4 top-4 z-[500] flex flex-wrap gap-2">
            <span className="glass-strong flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-medium">
              <i className="size-2 rounded-full bg-brand" />
              <b>{fresh.length}</b> Live
            </span>
            <span className="glass-strong flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-medium">
              <i className="size-2 rounded-full bg-ink-2" />
              <b>{stale.length}</b> Stale
            </span>
            <span className="glass-strong flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-medium">
              <Cpu size={13} className="text-ink-2" />
              <b>{total}</b> trackers reporting
            </span>
          </div>
          <Link
            href="/fleet-management/operations/map"
            className="btn-brand absolute bottom-4 right-4 z-[500] flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-semibold"
          >
            Open live map <ArrowUpRight size={15} />
          </Link>
        </div>

        <div className="glass flex flex-col p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="card-title">AI insights</h2>
              <p className="mt-0.5 text-[12.5px] text-ink-2">Ranked by estimated impact</p>
            </div>
            <span className="rounded-full bg-ai-wash px-2.5 py-0.5 text-[11.5px] font-semibold text-ai-ink">
              Preview
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-3">
            {INSIGHTS.map(i => {
              const Icon = i.icon;
              return (
                <div
                  key={i.title}
                  className="flex gap-3 rounded-[18px] border border-line-soft bg-white/75 p-3.5"
                >
                  <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${i.tone}`}>
                    <Icon size={18} />
                  </span>
                  <div className="min-w-0">
                    <b className="block text-[13.5px] font-semibold text-ink-0">{i.title}</b>
                    <p className="text-[12.5px] text-ink-1">{i.text}</p>
                    <button
                      type="button"
                      onClick={() => ask(i.q)}
                      className="mt-1.5 text-[12px] font-semibold text-brand hover:underline"
                    >
                      {i.cta} →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
