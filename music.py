"""Ambient music bed, synthesized from scratch (no third-party audio), mixed under the narration.

Slow pad chords + soft plucked arpeggio + reverb. Level follows timeline.json: ducked under every sentence,
lifted for the space opening, the haze dive into the site, and the closing logo.
Remuxes the already-rendered video (video and subtitles copied, audio replaced) -- no re-render needed.
Usage: .venv-tts/bin/python music.py [one_day]     (after narration.py and `node render.mjs video`)
Input: build/REPACSS_photons_to_tokens_nomusic.mp4  ->  output: build/REPACSS_photons_to_tokens.mp4 (the final file)
"""
import json, subprocess, sys, wave
import numpy as np
from scipy.signal import fftconvolve, resample_poly, butter, sosfilt

SR = 48000
BED_DB, DUCK_DB, SWELL_DB = -25, -11, 6     # bed level (dBFS RMS), extra cut under speech, lift in the swells
# pitched to sit where laptop / phone speakers still reproduce it (pad ~196-740 Hz, plucks ~400-1500 Hz)
STORY = sys.argv[1] if len(sys.argv) > 1 else ""
SFX = "_" + STORY if STORY else ""
NAME = f"REPACSS{SFX}" if STORY else "REPACSS_photons_to_tokens"
SRC = f"build/{NAME}_nomusic.mp4"   # written by `node render.mjs video`
OUT = f"build/{NAME}.mp4"

tl = json.load(open(f"timeline{SFX}.json"))
T = tl["total"]; N = int(T * SR); t = np.arange(N) / SR
rng = np.random.default_rng(7)

hz = lambda m: 440 * 2 ** ((m - 69) / 12)
# D major-ish, slow: Dmaj9 - Bm11 - Gmaj9 - A6sus, 16 s per chord
CHORDS = [[62, 69, 73, 76, 78], [59, 66, 69, 73, 76], [55, 62, 66, 69, 74], [57, 64, 69, 71, 76]]
if STORY == "one_day":   # brighter, sunrise feel: Cmaj9 - Am9 - Fmaj7#11 - G6/9
    CHORDS = [[60, 67, 71, 74, 76], [57, 64, 67, 71, 72], [53, 60, 64, 69, 71], [55, 62, 67, 69, 74]]
if STORY == "job":       # patient, hopeful: Am9 - Fmaj9 - Cmaj7/E - G6
    CHORDS = [[57, 64, 67, 71, 74], [53, 60, 64, 67, 72], [52, 59, 64, 67, 71], [55, 62, 67, 71, 74]]
CH = 16.0


def pad():
    out = np.zeros((2, N))
    for k in range(int(T // CH) + 2):
        t0 = k * CH - 3; notes = CHORDS[k % 4]
        a, b = max(0, int(t0 * SR)), min(N, int((t0 + CH + 6) * SR))
        if a >= b: continue
        tt = t[a:b] - t0
        env = np.sin(np.pi * np.clip(tt / (CH + 6), 0, 1)) ** 1.5           # 6 s crossfade between chords
        for n in notes:
            f = hz(n)
            for ch, det in ((0, -.07), (1, .07)):                           # slight L/R detune for width
                ph = 2 * np.pi * f * (1 + det / 100) * tt + rng.uniform(0, 6)
                out[ch, a:b] += env * (np.sin(ph) + .25 * np.sin(2 * ph) + .08 * np.sin(3 * ph)) / len(notes)
    lfo = 1 + .12 * np.sin(2 * np.pi * t / 11)
    return out * lfo


def plucks():
    """soft quarter-note arpeggio at 84 BPM, one octave up, random-walked through the chord"""
    out = np.zeros((2, N)); beat = 60 / 84; L = int(2.5 * SR); tt = np.arange(L) / SR
    i = 0
    for k in range(int(T / beat)):
        t0 = k * beat; notes = CHORDS[int(t0 // CH) % 4]
        i = (i + rng.choice([1, 2, -1])) % len(notes)
        f = hz(notes[i] + 12)   # one octave above the pad
        x = np.sin(2 * np.pi * f * tt) * np.exp(-tt * 2.2) * (1 - np.exp(-tt * 300)) * (.6 + .4 * rng.random())
        a = int(t0 * SR); b = min(N, a + L); pan = .5 + .35 * np.sin(k * .7)
        out[0, a:b] += x[:b - a] * (1 - pan); out[1, a:b] += x[:b - a] * pan
    return out


def reverb(x, sec=3.2, mix=.45):
    L = int(sec * SR); n = rng.standard_normal((2, L)) * np.exp(-np.arange(L) / SR * 6.9 / sec)
    wet = np.stack([fftconvolve(x[c], n[c])[:N] for c in range(2)])
    wet *= np.sqrt((x ** 2).mean() / max((wet ** 2).mean(), 1e-12))
    return (1 - mix) * x + mix * wet


def smooth(g, sec):
    """zero-phase low-pass of a gain curve; sec ≈ time constant"""
    sos = butter(1, 1 / (sec * SR * np.pi), output="sos")
    return sosfilt(sos, sosfilt(sos, g)[::-1])[::-1]


def level():
    """gain curve in dB from the timeline"""
    sp = np.zeros(N, bool)
    for sc in tl["scenes"]:
        for s in sc["sentences"]:
            sp[int((sc["start"] + s["start"] - .25) * SR):int((sc["start"] + s["end"] + .15) * SR)] = True
    db = np.where(sp, DUCK_DB, 0.0)
    s0, s1, last = tl["scenes"][0], tl["scenes"][1], tl["scenes"][-1]   # swell: opening, first scene change, end card
    first = s0["sentences"][0]["start"]
    dive0 = s0["start"] + s0["sentences"][-1]["end"]
    dive1 = s1["start"] + s1["sentences"][0]["start"]
    end0 = last["start"] + last["sentences"][-1]["end"]
    for a, b in ((0, first), (dive0, dive1), (end0, T)):
        db[int(a * SR):int(b * SR)] += SWELL_DB
    db = smooth(db, .35)
    fade = np.clip(t / 2.5, 0, 1) * np.clip((T - t) / 3.0, 0, 1)            # fade in from silence, out at the end
    return 10 ** (db / 20) * fade


def main():
    m = reverb(pad() * .55 + plucks() * .22)
    m = sosfilt(butter(2, [160, 7000], btype="band", fs=SR, output="sos"), m)   # no sub-bass mud, soft top
    m *= 10 ** (BED_DB / 20) / np.sqrt((m ** 2).mean())
    m *= level()
    with wave.open(f"build/narration{SFX}.wav") as w:
        v = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(np.float64) / 32768
    v = resample_poly(v, SR, w.getframerate())[:N]
    mix = m + np.pad(v, (0, N - len(v)))[None, :]
    peak = np.abs(mix).max(); mix *= min(1, .97 / peak)
    for name, x in (("build/music_bed.wav", m), ("build/mix.wav", mix)):
        with wave.open(name, "wb") as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((np.clip(x.T, -1, 1) * 32767).astype("<i2").tobytes())
    rms = lambda x: 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-12)
    print(f"music bed {rms(m):.1f} dBFS RMS, mix peak {20 * np.log10(peak):.1f} dBFS")
    out = OUT
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", SRC, "-i", "build/mix.wav", "-map", "0:v", "-map", "1:a", "-map", "0:s?",
                    "-c:v", "copy", "-c:s", "copy", "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", out], check=True)
    print(out)


if __name__ == "__main__":
    main()
