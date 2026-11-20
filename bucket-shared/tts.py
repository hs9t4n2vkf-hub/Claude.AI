#!/usr/bin/env python3
"""Generate a reel's voiceover from its narration script, and retime the beats to fit it.

  python3 bucket-shared/tts.py reels/<name>                 # show the plan (no paid calls)
  python3 bucket-shared/tts.py reels/<name> --yes           # generate missing/changed lines (paid)
  python3 bucket-shared/tts.py reels/<name> --yes --redo hook-1,end-1   # new take of some lines
  python3 bucket-shared/tts.py reels/<name> --provider local          # free offline test voice (espeak-ng)

Reads   reels/<name>/narration.json   (voice settings, beats in story seconds, lines)
Writes  reels/<name>/vo-clips/<id>-<hash>.wav   one cached clip per line (only changed lines are re-made)
        reels/<name>/voiceover.wav             all lines placed on the timeline, levelled to -16 LUFS
        reels/<name>/vo-timing.json            story->real beat map + line times (read by vo-sync.js)
If the beat timing did not change and build/<name>.mp4 exists, the new voice is swapped into it
without re-rendering frames.

API keys come from the environment (ELEVENLABS_API_KEY, OPENAI_API_KEY), or from a git-ignored
.env file in the project root. They are never written anywhere.
"""
import argparse, hashlib, json, os, shutil, subprocess, sys, tempfile, urllib.request, urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KEY_VARS = {"elevenlabs": "ELEVENLABS_API_KEY", "openai": "OPENAI_API_KEY"}


def load_dotenv():
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"command failed: {' '.join(map(str, cmd))}\n{r.stderr[-1500:]}")
    return r.stdout


def duration(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]).strip())


# ---------- providers ----------
def http(url, headers, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json", **headers})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        sys.exit(f"{url.split('/')[2]} returned HTTP {e.code}: {e.read()[:600].decode(errors='replace')}")
    except urllib.error.URLError as e:
        sys.exit(f"could not reach {url.split('/')[2]}: {e.reason}")


def synth(provider, cfg, line, prev_text, next_text, out_raw):
    if provider == "elevenlabs":
        c = cfg["elevenlabs"]
        text = line["text"]
        body = {"text": text, "model_id": c["model_id"], "voice_settings": c.get("voice_settings", {})}
        if c["model_id"].startswith("eleven_v3"):
            if line.get("v3_tags"): body["text"] = f"{line['v3_tags']} {text}"   # e.g. "[curious]"
        else:  # v2 models use neighbouring lines for natural, continuous intonation
            body.update({"previous_text": prev_text or "", "next_text": next_text or ""})
        data = http(f"https://api.elevenlabs.io/v1/text-to-speech/{c['voice_id']}?output_format=mp3_44100_128",
                    {"xi-api-key": os.environ[KEY_VARS[provider]], "Accept": "audio/mpeg"}, body)
    elif provider == "openai":
        c = cfg["openai"]
        body = {"model": c["model"], "voice": c["voice"], "input": line["text"], "response_format": "wav",
                "instructions": f"{c.get('style', '')} For this line: {line.get('direction', '')}".strip()}
        data = http("https://api.openai.com/v1/audio/speech", {"Authorization": f"Bearer {os.environ[KEY_VARS[provider]]}"}, body)
    elif provider == "local":
        c = cfg.get("local", {})
        run(["espeak-ng", "-v", c.get("voice", "en-us"), "-s", str(c.get("speed", 150)), "-w", str(out_raw), line["text"]])
        return
    else:
        sys.exit(f"unknown provider {provider!r} (use elevenlabs, openai or local)")
    Path(out_raw).write_bytes(data)


def clean_clip(src, dst):
    """Decode to 48 kHz mono WAV and trim leading/trailing silence so the clip length is the speech."""
    trim = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03"
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-af", f"{trim},areverse,{trim},areverse",
         "-ar", "48000", "-ac", "1", str(dst)])


# ---------- timing ----------
def retime(beats, lines, dur, t):
    """Fit each beat to its narration. Returns beats with real start/end and lines with real start/end.
    A beat stretches if its lines need more room, and shrinks (to min_scale) if they need less."""
    out_beats, out_lines, clock = [], [], 0.0
    for i, b in enumerate(beats):
        L = b["end"] - b["start"]
        mine = sorted([l for l in lines if l["beat"] == b["name"]], key=lambda l: l["at"])
        tail = t["end_hold"] if i == len(beats) - 1 else t["tail"]
        k, placed = 1.0, []
        for _ in range(8):  # fixed point: line starts scale with the beat
            placed, prev_end = [], None
            for l in mine:
                st = l["at"] * k
                if prev_end is not None: st = max(st, prev_end + t["gap"])
                placed.append((l, st, st + dur[l["id"]])); prev_end = st + dur[l["id"]]
            R = max(prev_end + tail, L * t["min_scale"]) if mine else L
            if abs(R / L - k) < 1e-4: break
            k = R / L
        out_beats.append({"name": b["name"], "story": [b["start"], b["end"]], "real": [round(clock, 3), round(clock + R, 3)]})
        for l, st, en in placed:
            out_lines.append({"id": l["id"], "text": l["text"], "start": round(clock + st, 3), "end": round(clock + en, 3)})
        clock += R
    return out_beats, out_lines, round(clock, 3)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("reel")
    ap.add_argument("--yes", action="store_true", help="allow paid API calls")
    ap.add_argument("--provider", help="override narration.json voice.provider (elevenlabs | openai | local)")
    ap.add_argument("--redo", default="", help="comma-separated line ids to generate again even if cached")
    a = ap.parse_args()
    load_dotenv()

    reel = Path(a.reel).resolve()
    spec = json.loads((reel / "narration.json").read_text())
    cfg, lines, beats, timing = spec["voice"], spec["lines"], spec["beats"], spec["timing"]
    provider = a.provider or cfg["provider"]
    redo = {x for x in a.redo.split(",") if x}
    clips = reel / "vo-clips"; clips.mkdir(exist_ok=True)

    # plan: which lines need (re)generating
    def clip_path(l):
        h = hashlib.sha1(json.dumps([provider, cfg.get(provider), l["text"], l.get("direction"), l.get("v3_tags")], sort_keys=True).encode()).hexdigest()[:10]
        return clips / f"{l['id']}-{h}.wav"
    todo = [l for l in lines if l["id"] in redo or not clip_path(l).exists()]
    chars = sum(len(l["text"]) for l in todo)
    print(f"provider: {provider} · {len(lines)} lines · {len(lines) - len(todo)} cached · {len(todo)} to generate ({chars} characters)")
    for l in todo: print(f"  + {l['id']:12s} {l['text']}")
    paid = provider in KEY_VARS
    if todo and paid:
        if not os.environ.get(KEY_VARS[provider]):
            sys.exit(f"\n{KEY_VARS[provider]} is not set. Put it in your environment or in {ROOT / '.env'} (git-ignored).")
        if not a.yes:
            sys.exit(f"\nThis would make {len(todo)} paid {provider} call(s), {chars} characters. Re-run with --yes to go ahead.")

    # generate
    with tempfile.TemporaryDirectory() as tmp:
        for l in todo:
            i = lines.index(l)
            raw = Path(tmp) / f"{l['id']}.raw"
            print(f"  generating {l['id']} ...", flush=True)
            synth(provider, cfg, l, lines[i - 1]["text"] if i else None, lines[i + 1]["text"] if i + 1 < len(lines) else None, raw)
            for old in clips.glob(f"{l['id']}-*.wav"): old.unlink()          # keep one take per line
            clean_clip(raw, clip_path(l))

    # retime beats to the real clip lengths
    dur = {l["id"]: duration(clip_path(l)) for l in lines}
    new_beats, placed, total = retime(beats, lines, dur, timing)
    timing_file = reel / "vo-timing.json"
    old = json.loads(timing_file.read_text()) if timing_file.exists() else None

    # assemble voiceover.wav: each clip delayed to its start, mixed, padded to the full length, levelled
    inputs, chains = [], []
    for j, p in enumerate(placed):
        line = next(l for l in lines if l["id"] == p["id"])
        inputs += ["-i", str(clip_path(line))]
        ms = int(p["start"] * 1000)
        chains.append(f"[{j}]adelay={ms}|{ms}[d{j}]")
    mix = ";".join(chains) + ";" + "".join(f"[d{j}]" for j in range(len(placed))) + \
        f"amix=inputs={len(placed)}:normalize=0,apad=whole_dur={total}[out]"
    with tempfile.TemporaryDirectory() as tmp:
        raw_mix = Path(tmp) / "mix.wav"
        run(["ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", mix, "-map", "[out]", "-ar", "48000", "-ac", "1", str(raw_mix)])
        import importlib.util  # vo-tools.py has a dash in its name, so load it by path
        spec_ = importlib.util.spec_from_file_location("vo_tools", Path(__file__).parent / "vo-tools.py")
        vo = importlib.util.module_from_spec(spec_); spec_.loader.exec_module(vo)
        vo.level(str(raw_mix), str(reel / "voiceover.wav"), -16)

    timing_file.write_text(json.dumps({"provider": provider, "duration": total, "beats": new_beats, "lines": placed}, indent=1))
    print(f"\nvoiceover.wav: {total:.2f}s (story was {beats[-1]['end']}s)")
    for b in new_beats:
        L, R = b["story"][1] - b["story"][0], b["real"][1] - b["real"][0]
        print(f"  {b['name']:9s} {b['real'][0]:6.2f}-{b['real'][1]:6.2f}  x{R / L:.2f}")

    # swap the voice into an existing video when the picture timing is unchanged
    mp4 = ROOT / "build" / f"{reel.name}.mp4"
    same = old and [b["real"] for b in old["beats"]] == [b["real"] for b in new_beats]
    if same and mp4.exists():
        tmp_mp4 = mp4.with_suffix(".remux.mp4")
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp4), "-i", str(reel / "voiceover.wav"), "-map", "0:v", "-map", "1:a",
             "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(tmp_mp4)])
        shutil.move(tmp_mp4, mp4)
        print(f"timing unchanged: swapped the new voice into {mp4.relative_to(ROOT)} (no re-render)")
    else:
        print(f"timing {'changed' if old else 'is new'}: render with  node render.js {Path(a.reel).as_posix()}")


if __name__ == "__main__":
    main()
