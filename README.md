# Vertical 3D cartoon reels

Reels are Three.js scenes rendered frame-by-frame in headless Chrome at 1080x1920 and encoded with ffmpeg.

```
node render.js sheet  reels/<name>                     # labeled contact sheet  -> build/<name>/sheet.png
node render.js stills reels/<name> 2 8 14              # full-res PNGs          -> build/<name>/still-<t>s.png
node render.js reels/<name> --draft --from 20 --to 26  # 540x960 @ 15fps draft  -> build/<name>-draft-20-26.mp4
node render.js reels/<name>                            # final 1080x1920 @ 30fps -> build/<name>.mp4
```

Extra flags: `--duration <s>`, `--fps <n>`, `--count <n>` (sheet frames), `--workers <n>` (parallel Chrome instances, faster).

## Writing a reel

`reels/<name>/scene.js` is an ES module:

```js
import * as THREE from 'three';             // 'three/addons/...' also works
export const duration = 30;                 // seconds
const { width, height } = window.REEL;      // also REEL.fps, REEL.draft
export function renderFrame(t) { /* pose everything for time t, then renderer.render(...) */ }
```

- `renderFrame(t)` must be a pure function of `t` (no clocks, no `Math.random()` without a seed): frames are rendered out of order with `--from` / `--workers`.
- It may be `async`; you can also `export const ready = loadStuff()` to wait for assets.
- Assets placed in the reel folder load with `new URL('./model.glb', import.meta.url)`.
- If `reels/<name>/audio.mp3` (or .wav/.m4a/.aac) exists it's muxed in automatically.
- Chrome is found automatically; override with `CHROME_PATH`. Rendering uses SwiftShader (CPU WebGL) so it works headless anywhere; pass a GPU flag via `CHROME_ARGS` if you have one.
