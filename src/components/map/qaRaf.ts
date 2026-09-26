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

    let queue: FrameRequestCallback[] = [];
    let last = 0;
    let armed = false;
    const ch = new MessageChannel();
    const pump = () => {
      const now = performance.now();

      if (now - last < 16) {
        ch.port2.postMessage(0);

        return;
      }
      last = now;

      const run = queue;

      queue = [];
      run.forEach(cb => {
        try {
          cb(now);
        } catch (e) {
          console.warn('[qaRaf] frame callback threw', e);
        }
      });

      if (queue.length) ch.port2.postMessage(0);
      else armed = false;
    };

    ch.port1.onmessage = pump;
    window.requestAnimationFrame = cb => {
      queue.push(cb);

      if (!armed) {
        armed = true;
        ch.port2.postMessage(0);
      }

      return queue.length;
    };
    window.cancelAnimationFrame = () => {};

    // Timers too: a long-hidden tab throttles setTimeout/setInterval to ~1/min, which would freeze polling (react-query).
    const timers = new Map<number, { due: number; every?: number; cb: () => void }>();
    let tid = 100000;
    const tch = new MessageChannel();
    let tArmed = false;
    const tpump = () => {
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

      if (timers.size) tch.port2.postMessage(0);
      else tArmed = false;
    };
    // Pump through a MessageChannel hop (not throttled) instead of the native timer.
    tch.port1.onmessage = tpump;

    const arm = () => {
      if (!tArmed) {
        tArmed = true;
        tch.port2.postMessage(0);
      }
    };

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
