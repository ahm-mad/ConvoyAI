'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Marker } from 'maplibre-gl';
import { token } from '@lib/design/tokens';
import { useConvoyMap } from '../ConvoyMap';
import VehicleIcon from '../vehicle/VehicleIcon';
import VehicleCard from '../VehicleCard';
import { kindOf, type LiveVehicle } from '../vehicle/vehicleKinds';
import { speedColorExpr } from '../speedColors';
import type { VehicleIconStyle } from '../useMapPrefs';

interface Entry {
  marker: Marker;
  el: HTMLDivElement;
  cur: { lat: number; lon: number; h: number };
  tgt: { lat: number; lon: number; h: number };
  /** km/h of the last fix while moving — used to keep gliding between reports (dead reckoning). */
  kmh: number;
  /** performance.now() of the last fix — dead reckoning stops if no new fix arrives for a few seconds. */
  fixAt: number;
  /** Recent position fixes with their arrival time; the vehicle is drawn slightly in the past, between two real fixes. */
  fixes: { t: number; lat: number; lon: number; h: number }[];
  /** Smoothed gap between fixes (ms). */
  gap: number;
  /** Latest vehicle data (for the label). */
  v: LiveVehicle;
  /** Name chip under the vehicle, created when first needed (zoomed in). */
  label: { marker: Marker; el: HTMLDivElement; text: string } | null;
}

/** Name labels appear from this zoom on. */
const LABEL_ZOOM = 12;

/** A count bubble. It keeps its identity (`key` = lowest member id) so it glides instead of teleporting when groups change. */
interface ClusterItem {
  marker: Marker;
  el: HTMLDivElement;
  key: string | null;
  cur: { lon: number; lat: number };
  tgt: { lon: number; lat: number };
}

/** Fix gaps up to this long are interpolated between fixes (the fleet feed); slower feeds use dead reckoning. */
const INTERP_MAX_GAP = 2500;

/** Shortest signed angle from a to b, degrees. */
const dAngle = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

/**
 * Draws the fleet as real vehicle icons (silhouette / badge / puck). New positions are not jumped to: every marker eases
 * toward its latest fix each frame (position and heading), so vehicles glide. The selected vehicle gets a glass card
 * that follows it. Markers are HTML elements owned by MapLibre; their content is React, mounted through portals.
 */
export default function VehicleLayer({
  vehicles,
  iconStyle,
  selectedId,
  onSelect,
  speedLabel,
  onOpen,
  motionScale = 1,
  trails = true,
  speedColors = true,
  followId = null,
  onFollowLost,
  onHover,
  labels = true,
}: {
  vehicles: LiveVehicle[];
  iconStyle: VehicleIconStyle;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  speedLabel: (v: LiveVehicle) => string;
  onOpen?: (v: LiveVehicle) => void;
  /** Demo time-warp (×1 real time); scales the dead-reckoning speed. */
  motionScale?: number;
  /** Fading comet tails behind moving vehicles. */
  trails?: boolean;
  /** Colour the comet tails by speed (green slow → red fast) instead of a single brand colour. */
  speedColors?: boolean;
  /** Keep the camera centred on this vehicle (cinematic follow). Any manual drag ends it. */
  followId?: string | null;
  onFollowLost?: () => void;
  /** The pointer entered / left a vehicle (drives the route preview). */
  onHover?: (id: string | null) => void;
  /** Name + plate chips under the vehicles when zoomed in. */
  labels?: boolean;
}) {
  const { map } = useConvoyMap();
  const store = useRef(new Map<string, Entry>());
  const card = useRef<{ marker: Marker; el: HTMLDivElement } | null>(null);
  const [ids, setIds] = useState<{ id: string; el: HTMLDivElement }[]>([]);
  const [cardEl, setCardEl] = useState<HTMLDivElement | null>(null);
  const latest = useRef({ selectedId, onSelect });

  const scaleRef = useRef(motionScale);
  const trailsOn = useRef(trails);
  const speedOn = useRef(speedColors);
  const followRef = useRef(followId);
  const styleRef = useRef(iconStyle);
  const ctor = useRef<typeof Marker | null>(null);
  const clusterPool = useRef<ClusterItem[]>([]);
  const lostRef = useRef(onFollowLost);
  const hoverRef = useRef(onHover);
  const labelsOn = useRef(labels);
  const hist = useRef(new Map<string, [number, number][]>());
  const lastSample = useRef(0);

  latest.current = { selectedId, onSelect };
  scaleRef.current = motionScale;
  trailsOn.current = trails;
  speedOn.current = speedColors;
  styleRef.current = iconStyle;
  followRef.current = followId;
  lostRef.current = onFollowLost;
  hoverRef.current = onHover;
  labelsOn.current = labels;

  // Create / update / remove markers to match `vehicles`.
  useEffect(() => {
    if (!map) return;

    let cancelled = false;

    (async () => {
      const { Marker: GLMarker } = await import('maplibre-gl');

      if (cancelled) return;

      ctor.current = GLMarker as unknown as typeof Marker;

      const seen = new Set<string>();

      vehicles.forEach(v => {
        seen.add(v.id);

        let e = store.current.get(v.id);

        if (!e) {
          const el = document.createElement('div');

          el.tabIndex = 0;
          el.setAttribute('role', 'button');
          el.setAttribute('aria-label', `${v.name}, ${v.state}`);
          el.addEventListener('click', ev => {
            ev.stopPropagation();
            latest.current.onSelect(v.id);
          });
          el.addEventListener('mouseenter', () => hoverRef.current?.(v.id));
          el.addEventListener('mouseleave', () => hoverRef.current?.(null));
          el.addEventListener('keydown', ev => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              latest.current.onSelect(v.id);
            }
          });

          const marker = new GLMarker({
            element: el,
            anchor: 'center',
            subpixelPositioning: true,
            pitchAlignment: styleRef.current === 'silhouette' ? 'map' : 'viewport',
            rotationAlignment: styleRef.current === 'silhouette' ? 'map' : 'viewport',
          })
            .setLngLat([v.lon, v.lat])
            .addTo(map);

          e = {
            marker,
            el,
            cur: { lat: v.lat, lon: v.lon, h: v.heading },
            tgt: { lat: v.lat, lon: v.lon, h: v.heading },
            kmh: 0,
            fixAt: performance.now(),
            fixes: [],
            gap: 700,
            v,
            label: null,
          };
          store.current.set(v.id, e);
        }
        // Real trackers often report no heading: derive it from movement between fixes, else keep the last known one.
        let h = v.heading;

        if (v.hasHeading === false) {
          const dLat = v.lat - e.tgt.lat;
          const dLon = (v.lon - e.tgt.lon) * Math.cos((v.lat * Math.PI) / 180);

          h =
            Math.abs(dLat) + Math.abs(dLon) > 0.00005
              ? ((Math.atan2(dLon, dLat) * 180) / Math.PI + 360) % 360
              : e.tgt.h;
        }
        const arrive = performance.now();
        const lastFix = e.fixes[e.fixes.length - 1];

        if (lastFix && (lastFix.lat !== v.lat || lastFix.lon !== v.lon)) {
          const gap = arrive - lastFix.t;

          if (gap > 50 && gap < 6000) e.gap = e.gap * 0.7 + gap * 0.3;
        }
        // Heading from the real movement between fixes (follows road bends); the reported heading when it stands still.
        if (lastFix) {
          const mLat = v.lat - lastFix.lat;
          const mLon = (v.lon - lastFix.lon) * Math.cos((v.lat * Math.PI) / 180);

          if (Math.abs(mLat) + Math.abs(mLon) > 0.000004 && v.state === 'moving')
            h = ((Math.atan2(mLon, mLat) * 180) / Math.PI + 360) % 360;
        }
        if (!lastFix || lastFix.lat !== v.lat || lastFix.lon !== v.lon || v.state !== 'moving') {
          e.fixes.push({ t: arrive, lat: v.lat, lon: v.lon, h });
          if (e.fixes.length > 4) e.fixes.shift();
        }
        e.tgt = { lat: v.lat, lon: v.lon, h };
        e.kmh = v.state === 'moving' && (v.hasHeading !== false || h !== 0) ? v.speed : 0;
        e.fixAt = performance.now();
        // A far jump (new session, filter change) snaps instead of gliding across the country.
        if (Math.abs(e.cur.lat - v.lat) + Math.abs(e.cur.lon - v.lon) > 0.6) {
          e.cur = { ...e.tgt };
          e.fixes = [{ t: arrive, lat: v.lat, lon: v.lon, h }];
        }
        e.el.setAttribute('aria-label', `${v.name}, ${v.state}`);
        e.v = v;
      });

      store.current.forEach((e, id) => {
        if (!seen.has(id)) {
          e.marker.remove();
          e.label?.marker.remove();
          store.current.delete(id);
          hist.current.delete(id);
        }
      });
      setIds([...store.current.entries()].map(([id, e]) => ({ id, el: e.el })));

      // The selected vehicle left the list (panned out of the viewport, filtered away): drop the selection too.
      const sid = latest.current.selectedId;

      if (sid && !seen.has(sid)) latest.current.onSelect(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [map, vehicles]);

  // Silhouettes lie on the road plane (map-aligned); badges and pucks stay upright billboards when the map is tilted.
  useEffect(() => {
    const flat = iconStyle === 'silhouette';

    store.current.forEach(e => {
      e.marker.setPitchAlignment(flat ? 'map' : 'viewport');
      e.marker.setRotationAlignment(flat ? 'map' : 'viewport');
    });
  }, [iconStyle, ids]);

  // Animation loop: ease toward targets, keep icon heading right for the current map bearing.
  useEffect(() => {
    if (!map) return;

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      try {
        frame(now);
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') console.warn('[VehicleLayer]', e);
      }
      raf = requestAnimationFrame(tick);
    };

    const frame = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      const k = 1 - Math.exp(-dt / 0.45);
      const bearing = map.getBearing();
      // Icons grow with zoom so the fleet reads at country level and stays crisp when zoomed in.
      const vs = Math.min(1.4, Math.max(0.55, 0.5 + (map.getZoom() - 9) * 0.16));

      last = now;
      store.current.forEach((e, id) => {
        const q = e.fixes;

        if (q.length >= 2 && e.gap <= INTERP_MAX_GAP) {
          // Buffered interpolation: draw the vehicle one fix-gap in the past, moving linearly between two REAL fixes.
          // That keeps it on the road polyline at a steady speed (no straight-line guessing that drifts off bends).
          const rt = now - e.gap * 1.15;
          let i = q.length - 2;

          while (i > 0 && q[i].t > rt) i--;

          const a = q[i];
          const b = q[i + 1];
          const span = Math.max(1, b.t - a.t);
          // Past the newest fix (a late poll): keep going on the last velocity for at most one gap.
          const w = Math.min(2, Math.max(0, (rt - a.t) / span));
          const stand = b.lat === a.lat && b.lon === a.lon;

          e.cur.lat = a.lat + (b.lat - a.lat) * w;
          e.cur.lon = a.lon + (b.lon - a.lon) * w;
          if (stand) e.cur.h += dAngle(e.cur.h, b.h) * (1 - Math.exp(-dt / 0.2));
          else e.cur.h += dAngle(e.cur.h, b.h) * (1 - Math.exp(-dt / 0.28));
        } else {
          if (e.kmh > 1 && now - e.fixAt < 2500) {
            // keep gliding along the heading between position reports
            const dKm = (e.kmh * scaleRef.current * dt) / 3600;
            const hr = (e.tgt.h * Math.PI) / 180;

            e.tgt.lat += (dKm * Math.cos(hr)) / 111.2;
            e.tgt.lon +=
              (dKm * Math.sin(hr)) / (111.2 * Math.max(0.2, Math.cos((e.tgt.lat * Math.PI) / 180)));
          }
          e.cur.lat += (e.tgt.lat - e.cur.lat) * k;
          e.cur.lon += (e.tgt.lon - e.cur.lon) * k;
          e.cur.h += dAngle(e.cur.h, e.tgt.h) * k;
        }
        e.marker.setLngLat([e.cur.lon, e.cur.lat]);
        // Map-aligned silhouettes already rotate with the map; upright badges/pucks do not, so they subtract the bearing.
        e.el.style.setProperty(
          '--h',
          `${(styleRef.current === 'silhouette' ? e.cur.h : e.cur.h - bearing).toFixed(1)}deg`
        );
        e.el.style.setProperty('--vs', vs.toFixed(3));
        e.el.style.zIndex = id === latest.current.selectedId ? '5' : '1';
        updateLabel(e, id, vs);
      });

      // Count bubbles glide toward their group's centre (their target only changes a few times a second).
      const kc = 1 - Math.exp(-dt / 0.35);

      clusterPool.current.forEach(c => {
        if (!c.key) return;

        c.cur.lon += (c.tgt.lon - c.cur.lon) * kc;
        c.cur.lat += (c.tgt.lat - c.cur.lat) * kc;
        c.marker.setLngLat([c.cur.lon, c.cur.lat]);
      });

      // Vehicles zoomed in get a name chip (the selected one has its card instead; clustered ones are hidden).
      function updateLabel(e: Entry, id: string, vs: number) {
        const show =
          labelsOn.current &&
          ctor.current &&
          map.getZoom() >= LABEL_ZOOM &&
          e.el.style.display !== 'none' &&
          id !== latest.current.selectedId;

        if (!show) {
          if (e.label) e.label.el.style.display = 'none';

          return;
        }

        const short = e.v.name.split(' · ')[0];
        const text = `${short}|${e.v.plate ?? ''}`;

        if (!e.label) {
          const el = document.createElement('div');

          el.className = 'cv-vlabel';
          el.setAttribute('aria-hidden', 'true');
          e.label = {
            marker: new ctor.current!({ element: el, anchor: 'top', subpixelPositioning: true })
              .setLngLat([e.cur.lon, e.cur.lat])
              .addTo(map),
            el,
            text: '',
          };
        }
        if (e.label.text !== text) {
          e.label.text = text;
          e.label.el.replaceChildren();

          const b = document.createElement('b');

          b.textContent = short;
          e.label.el.appendChild(b);
          if (e.v.plate) {
            const i = document.createElement('i');

            i.textContent = e.v.plate;
            e.label.el.appendChild(i);
          }
        }
        e.label.marker.setLngLat([e.cur.lon, e.cur.lat]);
        e.label.el.style.display = '';
        e.label.el.style.setProperty('--vs', vs.toFixed(3));
      }

      const sel = latest.current.selectedId ? store.current.get(latest.current.selectedId) : null;

      if (sel && card.current) card.current.marker.setLngLat([sel.cur.lon, sel.cur.lat]);

      const fol = followRef.current ? store.current.get(followRef.current) : null;

      if (fol && !map.isMoving()) map.jumpTo({ center: [fol.cur.lon, fol.cur.lat] });
      if (now - lastSample.current > 350) {
        lastSample.current = now;
        sampleTrails();
        clusterPass();
      }
    };

    // At country zoom vehicles that would overlap collapse into count bubbles; click zooms in. The selected/followed
    // vehicle is never hidden inside a bubble.
    const clusterPass = () => {
      const pool = clusterPool.current;
      let used = 0;

      if (map.getZoom() < 8.5 && ctor.current) {
        const keep = new Set(
          [latest.current.selectedId, followRef.current].filter(Boolean) as string[]
        );
        const pts = [...store.current.entries()].map(([id, e]) => ({
          id,
          e,
          p: map.project([e.cur.lon, e.cur.lat]),
        }));
        const taken = new Set<string>();
        type P = (typeof pts)[number];
        let groups: P[][] = [];

        pts.forEach(a => {
          if (taken.has(a.id)) return;

          taken.add(a.id);
          if (keep.has(a.id)) {
            a.e.el.style.display = '';

            return;
          }

          const grp = [a];

          pts.forEach(b => {
            if (
              !taken.has(b.id) &&
              !keep.has(b.id) &&
              Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y) < 46
            ) {
              grp.push(b);
              taken.add(b.id);
            }
          });
          groups.push(grp);
        });

        // Bubbles whose centres end up close together would overlap: merge them until none do.
        const centre = (g: P[]) => ({
          x: g.reduce((t, x) => t + x.p.x, 0) / g.length,
          y: g.reduce((t, x) => t + x.p.y, 0) / g.length,
        });
        let merged = true;

        while (merged) {
          merged = false;
          outer: for (let i = 0; i < groups.length; i++) {
            if (groups[i].length < 2) continue;

            for (let j = i + 1; j < groups.length; j++) {
              if (groups[j].length < 2) continue;

              const ci = centre(groups[i]);
              const cj = centre(groups[j]);

              if (Math.hypot(ci.x - cj.x, ci.y - cj.y) < 44) {
                groups[i] = [...groups[i], ...groups[j]];
                groups = groups.filter((_, k) => k !== j);
                merged = true;
                break outer;
              }
            }
          }
        }

        const multi: { key: string; grp: P[] }[] = [];

        groups.forEach(grp => {
          if (grp.length === 1) {
            grp[0].e.el.style.display = '';

            return;
          }
          grp.forEach(x => (x.e.el.style.display = 'none'));
          multi.push({ key: grp.map(x => x.id).sort()[0], grp });
        });

        used = multi.length;

        const newKeys = new Set(multi.map(g => g.key));
        const byKey = new Map(pool.filter(c => c.key).map(c => [c.key as string, c]));
        const spare = pool.filter(c => !c.key || !newKeys.has(c.key));
        const inUse = new Set<ClusterItem>();

        multi.forEach(({ key, grp }) => {
          const lon = grp.reduce((t, x) => t + x.e.cur.lon, 0) / grp.length;
          const lat = grp.reduce((t, x) => t + x.e.cur.lat, 0) / grp.length;
          let c = byKey.get(key) ?? spare.shift();

          if (!c) {
            const el = document.createElement('div');

            el.className = 'cv-cluster';
            el.setAttribute('role', 'button');
            el.tabIndex = 0;
            const marker = new ctor.current!({
              element: el,
              anchor: 'center',
              subpixelPositioning: true,
            })
              .setLngLat([lon, lat])
              .addTo(map);

            const expand = () =>
              map.easeTo({
                center: marker.getLngLat(),
                zoom: Math.min(13, map.getZoom() + 2.2),
                duration: 900,
              });

            el.addEventListener('click', ev => {
              ev.stopPropagation();
              expand();
            });
            el.addEventListener('keydown', ev => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                expand();
              }
            });
            pool.push((c = { marker, el, key, cur: { lon, lat }, tgt: { lon, lat } }));
          } else if (c.key !== key) {
            // A recycled bubble starts where its new group is (no flying across the map).
            c.key = key;
            c.cur = { lon, lat };
            c.tgt = { lon, lat };
            c.marker.setLngLat([lon, lat]);
          }
          // The bubble under the pointer holds still so it can be clicked; the others glide toward their group.
          if (!c.el.matches(':hover')) c.tgt = { lon, lat };
          inUse.add(c);
          c.el.style.display = '';
          c.el.setAttribute('aria-label', `${grp.length} vehicles, zoom in to see them`);
          if (c.el.dataset.n !== String(grp.length)) {
            c.el.dataset.n = String(grp.length);
            c.el.innerHTML = `<span>${grp.length}</span>`;
          }
          c.el.classList.toggle(
            'has-moving',
            grp.some(x => x.e.kmh > 1)
          );
        });
        pool.forEach(c => {
          if (!inUse.has(c)) {
            c.key = null;
            c.el.style.display = 'none';
          }
        });
      } else {
        store.current.forEach(e => (e.el.style.display = ''));
      }
      if (used === 0)
        pool.forEach(c => {
          c.key = null;
          c.el.style.display = 'none';
        });
    };

    const sampleTrails = () => {
      // A look switch replaces the style; adding sources before it finished loading throws.
      if (!map.isStyleLoaded()) return;

      if (!trailsOn.current) {
        if (map.getSource('cv-trails'))
          (map.getSource('cv-trails') as any).setData({ type: 'FeatureCollection', features: [] });

        return;
      }

      const features: any[] = [];

      store.current.forEach((e, id) => {
        let h = hist.current.get(id);

        if (!h) hist.current.set(id, (h = []));
        if (e.kmh > 1) {
          const last = h[h.length - 1];

          if (!last || Math.hypot(last[0] - e.cur.lon, last[1] - e.cur.lat) > 0.00012)
            h.push([e.cur.lon, e.cur.lat]);
          if (h.length > 44) h.shift();
        } else if (h.length) h.length = 0;
        if (h.length < 6) return;

        const q = Math.floor(h.length / 4);

        [0.1, 0.22, 0.4, 0.62].forEach((o, i) => {
          const seg = h!.slice(i * q, i === 3 ? h!.length : (i + 1) * q + 1);

          if (seg.length > 1)
            features.push({
              type: 'Feature',
              properties: { o, w: 2 + i * 1.1, s: e.kmh },
              geometry: { type: 'LineString', coordinates: seg },
            });
        });
      });

      const data = { type: 'FeatureCollection' as const, features };

      if (map.getSource('cv-trails')) (map.getSource('cv-trails') as any).setData(data);
      else {
        map.addSource('cv-trails', { type: 'geojson', data });
        map.addLayer({
          id: 'cv-trails',
          type: 'line',
          source: 'cv-trails',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': speedOn.current ? speedColorExpr('s') : token('--color-brand-bright'),
            'line-opacity': ['get', 'o'],
            'line-width': ['get', 'w'],
          },
        });
      }
    };

    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [map]);

  // Switching speed colours on/off recolours the comet tails immediately.
  useEffect(() => {
    if (!map?.getLayer('cv-trails')) return;

    map.setPaintProperty(
      'cv-trails',
      'line-color',
      speedColors ? speedColorExpr('s') : token('--color-brand-bright')
    );
  }, [map, speedColors]);

  // The selected vehicle's card marker.
  useEffect(() => {
    if (!map) return;

    let cancelled = false;

    if (!selectedId) {
      card.current?.marker.remove();
      card.current = null;
      setCardEl(null);

      return;
    }

    (async () => {
      const { Marker: GLMarker } = await import('maplibre-gl');

      if (cancelled) return;

      const sel = store.current.get(selectedId);
      const el = document.createElement('div');

      card.current?.marker.remove();

      const marker = new GLMarker({
        element: el,
        anchor: 'bottom',
        offset: [0, -34],
        subpixelPositioning: true,
      })
        .setLngLat(sel ? [sel.cur.lon, sel.cur.lat] : map.getCenter())
        .addTo(map);

      el.style.zIndex = '10';
      card.current = { marker, el };
      setCardEl(el);

      // Keep the card inside the map: nudge the camera when the vehicle sits so close to an edge (or under the toolbar)
      // that the card above it would be clipped.
      setTimeout(() => {
        if (cancelled || followRef.current) return;

        const s = store.current.get(selectedId);

        if (!s) return;

        const p = map.project([s.cur.lon, s.cur.lat]);
        const box = map.getContainer().getBoundingClientRect();
        const cardH = (el.firstElementChild?.getBoundingClientRect().height ?? 180) + 34;
        const cardW = el.firstElementChild?.getBoundingClientRect().width ?? 260;
        const top = box.width < 1024 ? 132 : 84; // room for the toolbar (and, below lg, the HUD chips under it)
        const dy = p.y - cardH < top ? top - (p.y - cardH) : 0;
        const dx =
          p.x - cardW / 2 < 12
            ? 12 - (p.x - cardW / 2)
            : p.x + cardW / 2 > box.width - 12
              ? box.width - 12 - (p.x + cardW / 2)
              : 0;

        if (dx || dy) map.panBy([-dx, -dy], { duration: 450 });
      }, 60);
    })();

    return () => {
      cancelled = true;
    };
  }, [map, selectedId]);

  // A manual drag ends follow mode.
  useEffect(() => {
    if (!map) return;

    const lost = () => followRef.current && lostRef.current?.();

    map.on('dragstart', lost);

    return () => {
      map.off('dragstart', lost);
    };
  }, [map]);

  // Esc closes the vehicle card (unless a dialog is open on top of the map).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || !latest.current.selectedId) return;
      if (document.querySelector('[data-state="open"][role="dialog"]')) return;

      latest.current.onSelect(null);
    };

    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Deselect on empty-map click.
  useEffect(() => {
    if (!map) return;

    const off = () => latest.current.onSelect(null);

    map.on('click', off);

    return () => {
      map.off('click', off);
    };
  }, [map]);

  // Remove everything on unmount.
  useEffect(
    () => () => {
      store.current.forEach(e => {
        e.marker.remove();
        e.label?.marker.remove();
      });
      store.current.clear();
      card.current?.marker.remove();
      clusterPool.current.forEach(c => c.marker.remove());
      clusterPool.current = [];
    },
    []
  );

  const byId = new Map(vehicles.map(v => [v.id, v]));
  const selected = selectedId ? byId.get(selectedId) : null;

  return (
    <>
      {ids.map(({ id, el }) => {
        const v = byId.get(id);

        return v
          ? createPortal(
              <VehicleIcon
                kind={kindOf(v.category)}
                state={v.state}
                iconStyle={iconStyle}
                selected={id === selectedId}
                label={`${v.name}, ${v.state}`}
              />,
              el,
              id
            )
          : null;
      })}
      {cardEl && selected
        ? createPortal(
            <VehicleCard
              v={selected}
              speedLabel={speedLabel(selected)}
              onClose={() => onSelect(null)}
              onOpen={onOpen ? () => onOpen(selected) : undefined}
            />,
            cardEl,
            'card'
          )
        : null}
    </>
  );
}
