// Shared DOM overlay for type over a reel: rounded font, a pop-in "!" bubble, and titles whose
// letters drop in one by one and squash like landing tiles. Sizes are in vw so drafts scale.
//
//   const ov = createOverlay();  export const ready = ov.ready;
//   ov.bang({ show: k, x: 50, y: 30 });                       // k: 0..1 pop progress, x/y in % of frame
//   ov.title(t, { start: 39, lines: [{ text: 'BOUNCE BACK.', size: 13, y: 30, inset: [0, 12], from: 'above'|'below', stagger: 0.07 }] });
//   ov.project(vec3, camera) -> {x, y} in % (for placing overlay on a 3D anchor)
import { pop, range, easeIn } from './motion.js';

export function createOverlay({ font = 'Fredoka', shadow = '#3b4f9a' } = {}) {
  const css = document.createElement('style');
  css.textContent = `
    @font-face { font-family: Fredoka; src: url(${new URL('./fonts/Fredoka-latin.woff2', import.meta.url)}) format('woff2'); font-weight: 300 700; }
    .ov { position: fixed; inset: 0; pointer-events: none; font-family: ${font}, sans-serif; overflow: hidden; }
    .ov .line { position: absolute; left: 0; right: 0; text-align: center; white-space: nowrap; font-weight: 700; color: #fff8ec; }
    .ov .line span { display: inline-block; transform-origin: 50% 100%; text-shadow: 0 0.5vw 0 ${shadow}, 0 1vw 2.4vw ${shadow}66; }
    .ov .bang { position: absolute; width: 13vw; height: 13vw; margin: -6.5vw 0 0 -6.5vw; border-radius: 50%; background: #ff5a5f;
      color: #fff; font-weight: 700; font-size: 10vw; line-height: 13vw; text-align: center; box-shadow: 0 0.8vw 0 #c83a4a; }`;
  document.head.appendChild(css);
  const root = document.createElement('div'); root.className = 'ov'; document.body.appendChild(root);

  const bangEl = document.createElement('div'); bangEl.className = 'bang'; bangEl.textContent = '!'; root.appendChild(bangEl);
  function bang({ show = 0, x = 50, y = 30, tilt = -8 }) {
    bangEl.style.display = show > 0 ? 'block' : 'none';
    bangEl.style.left = x + '%'; bangEl.style.top = y + '%';
    bangEl.style.transform = `scale(${pop(show * 0.6)}) rotate(${tilt}deg)`;
  }

  const built = new Map();
  /** Letters drop in from above with stagger; each lands with squash and settles. */
  function title(t, { start, lines, stagger = 0.07, fall = 0.35, hide = false }) {
    const key = JSON.stringify(lines);
    if (!built.has(key)) {
      const els = lines.map(l => {
        const div = document.createElement('div'); div.className = 'line';
        div.style.top = l.y + '%'; div.style.fontSize = l.size + 'vw';
        if (l.color) div.style.color = l.color;
        if (l.weight) div.style.fontWeight = l.weight;
        if (l.spacing) div.style.letterSpacing = l.spacing + 'vw';
        if (l.inset) { div.style.left = l.inset[0] + '%'; div.style.right = l.inset[1] + '%'; } // keep clear of platform UI
        div.dataset.from = l.from || 'above';
        const spans = [...l.text].map(ch => { const s = document.createElement('span'); s.textContent = ch === ' ' ? ' ' : ch; div.appendChild(s); return s; });
        root.appendChild(div);
        spans.forEach(sp => (sp.dataset.from = div.dataset.from));
        return spans;
      });
      built.set(key, els);
    }
    let t0 = start - stagger;
    built.get(key).forEach((spans, li) => { for (const s of spans) {
      t0 += lines[li].stagger ?? stagger; const k = range(t, t0, t0 + fall), land = t - (t0 + fall);
      const y = (s.dataset.from === 'below' ? 3 : -60) * (1 - easeIn(k));  // vh: drop from above, or rise a little from below
      const sq = land > 0 ? 1 - 0.35 * Math.exp(-7 * land) * Math.cos(16 * land) : 1.15;
      s.style.opacity = hide || t < t0 ? 0 : s.dataset.from === 'below' ? k : 1;
      s.style.transform = `translateY(${y}vh) scale(${1 / Math.sqrt(sq)}, ${sq})`;
    } });
  }

  function project(v, camera) {
    const p = v.clone().project(camera);
    return { x: (p.x + 1) * 50, y: (1 - p.y) * 50 };
  }

  const ready = document.fonts.load(`700 40px ${font}`);
  return { root, bang, title, project, ready };
}
