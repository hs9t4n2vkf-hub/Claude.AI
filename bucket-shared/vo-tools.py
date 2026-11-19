#!/usr/bin/env python3
"""Voice-over tools shared by all reels.

  python3 bucket-shared/vo-tools.py transcribe audio/<reel>-vo.wav reels/<reel>/vo.json [--model small.en]
      Transcribe with faster-whisper; writes every line (segment) and word with start/end seconds.

  python3 bucket-shared/vo-tools.py level audio/<reel>-vo.wav build/<reel>/vo-leveled.wav [--lufs -16]
      Clean and level the voice: high-pass 80 Hz, gentle compression, two-pass EBU R128
      loudnorm to --lufs (default -16 LUFS, true peak -1.5 dBTP), 48 kHz mono.
"""
import argparse, json, re, subprocess, sys


def transcribe(src, out, model_name):
    from faster_whisper import WhisperModel
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, info = model.transcribe(src, word_timestamps=True, vad_filter=True, language="en")
    # one line per sentence, timed from its words (whisper segments often hold several)
    lines, cur = [], []
    for s in segments:
        for w in s.words:
            cur.append({"start": round(w.start, 3), "end": round(w.end, 3), "word": w.word.strip()})
            if re.search(r"[.?!…]$", cur[-1]["word"]):
                lines.append(cur); cur = []
    if cur:
        lines.append(cur)
    lines = [{"start": ws[0]["start"], "end": ws[-1]["end"], "text": " ".join(w["word"] for w in ws), "words": ws}
             for ws in lines]
    data = {"source": src, "duration": round(info.duration, 3), "lines": lines}
    with open(out, "w") as f:
        json.dump(data, f, indent=1)
    for i, l in enumerate(lines, 1):
        print(f"{i:2d}  {l['start']:6.2f}-{l['end']:6.2f}  {l['text']}")
    print(f"-> {out}")


def level(src, out, lufs):
    pre = "highpass=f=80,acompressor=threshold=-20dB:ratio=3:attack=5:release=80:makeup=2"
    probe = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", src, "-af", f"{pre},loudnorm=I={lufs}:TP=-1.5:LRA=7:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True)
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", probe.stderr)
    if not m:
        sys.exit("loudnorm analysis failed:\n" + probe.stderr[-2000:])
    st = json.loads(m.group(0))
    ln = (f"loudnorm=I={lufs}:TP=-1.5:LRA=7:measured_I={st['input_i']}:measured_TP={st['input_tp']}"
          f":measured_LRA={st['input_lra']}:measured_thresh={st['input_thresh']}:offset={st['target_offset']}:linear=true")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-af", f"{pre},{ln}", "-ar", "48000", "-ac", "1", out], check=True)
    print(f"input {st['input_i']} LUFS -> {lufs} LUFS  -> {out}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["transcribe", "level"])
    ap.add_argument("src"); ap.add_argument("out")
    ap.add_argument("--model", default="small.en")
    ap.add_argument("--lufs", type=float, default=-16)
    a = ap.parse_args()
    transcribe(a.src, a.out, a.model) if a.cmd == "transcribe" else level(a.src, a.out, a.lufs)
