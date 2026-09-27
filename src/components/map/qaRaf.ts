/**
 * QA helper (off unless localStorage `convoyai-qa-raf` = 1): the automated Chrome tab used for verification reports
 * `visibilityState=hidden`, where the browser never calls requestAnimationFrame — WebGL maps and animations freeze.
 * This swaps rAF for a MessageChannel pump so they render anyway. Never enabled for real users.
 */
export function installRafShimIfRequested() {
  try {
    if (typeof window === 'undefined' || window.localStorage.getItem('convoyai-qa-raf') !== '1')
      return;
    if ((window as any).__cvRafShim) return;

    (window as any).__cvRafShim = true;

    // The automated tab is always `hidden`; react-query pauses interval polling then. Report visible for QA runs.
    try {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    } catch {
      /* not overridable */
    }

    // One 16 ms tick from a Worker (workers are not throttled in background tabs, and idle time costs no CPU — the earlier
    // MessageChannel spin re-posted itself while waiting and kept a whole core at 100%).
    const tickers: (() => void)[] = [];
    const nativeSetInterval = window.setInterval.bind(window);
    let tickStarted = false;
    const startTick = () => {
      if (tickStarted) return;

      tickStarted = true;
      try {
        // Backpressure: the worker sends the next tick only after the page acknowledged the last one, so a slow page can
        // never pile up a backlog of ticks (which would starve the main thread and grow memory).
        const w = new Worker(
          URL.createObjectURL(
            new Blob(['onmessage=()=>setTimeout(()=>postMessage(0),16);postMessage(0)'], {
              type: 'text/javascript',
            })
          )
        );

        w.onmessage = () => {
          try {
            tickers.forEach(t => t());
          } finally {
            w.postMessage(0); // acknowledge -> worker schedules the next tick 16 ms later
          }
        };
      } catch {
        // No worker (CSP): fall back to a 16 ms native interval.
        nativeSetInterval(() => tickers.forEach(t => t()), 16);
      }
    };

    let queue: FrameRequestCallback[] = [];
    const frame = () => {
      if (!queue.length) return;

      const now = performance.now();
      const run = queue;

      queue = [];
      run.forEach(cb => {
        try {
          cb(now);
        } catch (e) {
          console.warn('[qaRaf] frame callback threw', e);
        }
      });
    };

    tickers.push(frame);
    window.requestAnimationFrame = cb => {
      queue.push(cb);
      startTick();

      return queue.length;
    };
    window.cancelAnimationFrame = () => {};

    // Timers too: a long-hidden tab throttles setTimeout/setInterval to ~1/min, which would freeze polling (react-query).
    const timers = new Map<number, { due: number; every?: number; cb: () => void }>();
    let tid = 100000;
    const tpump = () => {
      if (!timers.size) return;

      const now = performance.now();

      timers.forEach((t, id) => {
        if (t.due > now) return;
        if (t.every != null) t.due = now + Math.max(4, t.every);
        else timers.delete(id);
        try {
          t.cb();
        } catch (e) {
          console.warn('[qaRaf] timer callback threw', e);
        }
      });
    };

    tickers.push(tpump);

    const arm = () => startTick();

    (window as any).setTimeout = (cb: any, ms = 0, ...args: any[]) => {
      const id = tid++;

      timers.set(id, { due: performance.now() + Number(ms || 0), cb: () => cb(...args) });
      arm();

      return id;
    };
    (window as any).setInterval = (cb: any, ms = 0, ...args: any[]) => {
      const id = tid++;

      timers.set(id, {
        due: performance.now() + Number(ms || 0),
        every: Number(ms || 0),
        cb: () => cb(...args),
      });
      arm();

      return id;
    };
    window.clearTimeout = (id?: any) => void timers.delete(id);
    window.clearInterval = (id?: any) => void timers.delete(id);

    // `__cvSnap()` paints the WebGL canvas into an <img> on top of it so screenshots of a hidden tab can see the map.
    (window as any).__cvSnap = async () => {
      const m = (window as any).__cvMap;

      document.getElementById('__cvSnapImg')?.remove();
      if (!m) return 0;

      const url: string = await new Promise(res => {
        m.once('render', () => res(m.getCanvas().toDataURL('image/png')));
        m.triggerRepaint();
      });
      const canvas = m.getCanvas() as HTMLCanvasElement;
      const img = document.createElement('img');

      img.id = '__cvSnapImg';
      img.src = url;
      // Sits right after the canvas (below the HTML markers) so vehicle icons stay visible over the snapshot.
      img.style.cssText =
        'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none';
      canvas.after(img);

      return url.length;
    };
  } catch {
    /* storage unavailable */
  }
}
