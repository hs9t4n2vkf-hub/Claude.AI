Before writing any code, post a manifest: files you will REUSE from `bucket-shared/`, NEW files you will create (only `reels/<name>/scene.js`, `timeline.js`, `audio.js` unless asked), and 5 bullet assumptions. Then continue without waiting.

- Never build a new world, rig or synth. Import from `bucket-shared/`. Need something new? Add a builder to `bucket-shared/` with flags and anchors, don't copy.
- Edit working files, don't rewrite them. Don't add features that weren't asked for. Keep a reel's scene.js under about 300 lines.
- Briefs live in `briefs/<reel>.md` (template: `_template.md`); reference images in `assets/refs/`.
- Iterate with stills, not reasoning about geometry. Order: `node render.js sheet reels/<name>` (one small labeled sheet; view only changed beats), then `--draft --from a --to b` for motion, then the final render.
- Final: `node render.js reels/<name>` (builds and masters audio when stale, writes build/<name>.mp4).
