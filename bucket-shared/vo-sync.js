// Shared voiceover sync: maps real (video) time to the story time a scene was animated in, so each
// beat stretches or squeezes to fit its narration without touching the animation itself.
//
//   const vo = await loadVoTiming(new URL('./vo-timing.json', import.meta.url), B);
//   if (vo) { duration = vo.duration; warp = vo.warp; }        // renderFrame: t = warp(tReal)
//
// vo-timing.json is written by bucket-shared/tts.py. Missing file -> null (scene keeps its story timing).
// Flag: pass the timeline's beat starts (B) to get a console warning if narration.json drifted from them.

export async function loadVoTiming(url, beatStarts = null) {
  let data;
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return null;
    data = await r.json();
  } catch { return null; }

  const beats = data.beats;
  if (beatStarts) {
    for (const b of beats) {
      if (b.name in beatStarts && Math.abs(beatStarts[b.name] - b.story[0]) > 1e-6)
        console.warn(`vo-sync: beat "${b.name}" starts at ${b.story[0]}s in narration.json but ${beatStarts[b.name]}s in the timeline`);
    }
  }
  /** real seconds -> story seconds (piecewise linear per beat) */
  function warp(t) {
    for (const b of beats) {
      if (t < b.real[1] || b === beats[beats.length - 1]) {
        const k = (t - b.real[0]) / (b.real[1] - b.real[0]);
        return b.story[0] + Math.max(0, k) * (b.story[1] - b.story[0]);
      }
    }
    return t;
  }
  return { duration: data.duration, warp, beats, lines: data.lines };
}
