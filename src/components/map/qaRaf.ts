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
      run.forEach(cb => cb(now));

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
