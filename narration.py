"""Narration script -> per-sentence neural TTS -> narration.wav, timeline.json, captions.srt.

Voice: Qwen3-TTS 1.7B Base (Apache-2.0) via mlx-audio, cloned from one fixed reference clip
(assets/voice_ref.wav) so every sentence has the same speaker.
Each sentence is synthesized separately so the animation can key visual beats to exact sentence start times.
Every take is transcribed with Whisper and pitch-checked against the reference; takes that garble words,
misread a number, or drift from the reference voice are re-rolled with a new seed.
Usage: .venv-tts/bin/python narration.py [one_day]  (reuses cached takes in build/tts unless the text changed)
The optional story id picks a script from STORIES and suffixes every output (timeline_one_day.json, ...).
"""
import difflib, hashlib, json, os, re, sys, wave
import numpy as np

MODEL = "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16"
REF_WAV = "assets/voice_ref.wav"
REF_TEXT = "The utility grid supplies the rest, so the system can always weigh available sunlight against the cost of grid power."
TEMP = 0.5
PITCH_TOL = 0.12    # max relative deviation of a take's median F0 from the reference
GAP = 0.35          # silence between sentences (s)
TEMPO = 1.0         # pitch-preserving speed-up applied to every take (ffmpeg atempo)
SR = 24000
TAKES = 14          # max seeds tried per sentence

# (scene id, lead-in seconds, tail seconds, [sentences])
SCRIPT = [
    ("intro", 2.0, 3.0, [
        "Every answer an AI model gives you is built one token at a time.",
        "And every token begins, somewhere, as energy.",
        "Almost all of the energy on Earth traces back to a single source: the sun.",
        "At Texas Tech University, the REPACSS project asks: what if a data center could take its energy straight from the sun?",
        "This is the journey from photons to tokens.",
        "It begins on the high plains of West Texas, about ten miles west of the Texas Tech campus in Lubbock.",
    ]),
    ("site", 0.8, 1.5, [
        "This is GLEAMM, the Global Laboratory for Energy Asset Management and Manufacturing, at the Reese Technology Center.",
        "Built in 2015 as a microgrid laboratory, it gives REPACSS its building, its energy infrastructure, and dense instrumentation and control.",
        "Its main renewable source is a 350 kilowatt solar array, right beside the machine room.",
        "Next to it sit a 760 kilowatt-hour battery bank, a 500 kilowatt diesel generator, and a tie to the commercial power grid.",
        "And on the horizon, wind turbines can add their share when the West Texas wind is blowing.",
    ]),
    ("problem", 0.8, 1.3, [
        "Supercomputers and AI clusters are hungry machines, built to draw steady power around the clock.",
        "Renewable energy does not behave that way.",
        "Solar output rises and falls with the day, and drops every time a cloud passes.",
        "REPACSS, funded by the National Science Foundation, flips the usual design.",
        "Instead of forcing the energy to follow the computer, it teaches the computer to follow the energy.",
    ]),
    ("energy", 0.8, 1.5, [
        "And it does not have to rely on sunlight alone.",
        "The 760 kilowatt-hour battery charges when the sun is strong, and discharges when a cloud passes.",
        "It levels out short swings in available power, so jobs keep running, instead of stopping for a checkpoint and restore cycle every time a cloud drifts by.",
        "If the utility grid goes down, the UPS carries the cluster through the first seconds, while the 500 kilowatt diesel generator starts and takes over the load.",
        "The connection to the commercial grid also lets high priority workloads keep running whenever needed, day or night.",
        "And when the wind is blowing, wind power can join the mix.",
        "Every source can be selected and prioritized by cost and availability, just as a commercial data center would have to.",
    ]),
    ("photon", 0.8, 1.3, [
        "Follow a single photon.",
        "Eight minutes after leaving the sun, it strikes a silicon solar cell.",
        "If its energy exceeds silicon's band gap, about 1.1 electron volts, it knocks an electron loose and leaves behind a hole.",
        "The built-in electric field at the p-n junction sweeps them apart, and that separation becomes direct current.",
        "Cells are strung into modules, and modules into arrays.",
        "An inverter, tracking the maximum power point, shapes that DC into clean, 60 hertz AC.",
        "The battery, the generator, and the utility grid join at the same bus, covering whatever the sun cannot.",
        "From there, power flows through the UPS and the power distribution units, down to redundant supplies in every server.",
    ]),
    ("compute", 0.8, 1.5, [
        "Inside, the electrons meet the machine.",
        "REPACSS has 110 CPU nodes, each with two AMD EPYC 9754 processors: 256 cores and 1.5 terabytes of DDR5 memory per node.",
        "Eight GPU nodes each carry four NVIDIA H100 NVL accelerators, with 94 gigabytes of high bandwidth memory apiece.",
        "Nine storage nodes, holding about 2.9 petabytes, plus head, login, and utility nodes, complete the cluster.",
        "Every node has two 200 gigabit InfiniBand links, one per socket. Leaf switches fan them out, two core switches join the leaves at 800 gigabits, and every node has a direct path to storage.",
        "In total: nearly 29 thousand cores, 32 GPUs, and 176 terabytes of memory.",
    ]),
    ("tokens", 0.8, 1.5, [
        "On a GPU, electrons become arithmetic.",
        "Transistors switch billions of times a second as tensor cores multiply model weights against your prompt.",
        "Layer after layer, attention and feed-forward, until a probability distribution emerges and the next token is chosen.",
        "Then the next. And the next.",
        "Sunlight, electrons, floating point operations, tokens. That is the chain REPACSS makes visible, and measurable.",
    ]),
    ("measure", 0.8, 1.5, [
        "And measurable is the key word.",
        "GLEAMM's power instrumentation, including phasor measurement units and protective relays, samples voltage and current waveforms across the facility.",
        "That lets the team measure power quality, including harmonic distortion: the extra frequencies that switching power supplies add on top of the clean 60 hertz wave.",
        "REPACSS studies how different workloads, and even individual codes, change these signatures as they run.",
        "And it measures the total energy each code consumes, so researchers can see what a result really costs, and find ways to make their software more efficient.",
    ]),
    ("remote", 0.8, 1.3, [
        "The first research challenge is remote data center management.",
        "A facility powered by variable energy cannot wait for someone to walk the machine room floor.",
        "REPACSS streams telemetry from every node, power, temperature, utilization, so operators can watch in real time, intervene remotely, and adapt the cluster as energy changes.",
        "A private monitoring and control network reaches beyond the servers, to the UPS, the power distribution units, and the in-row coolers, with new sensors for cooling power and outdoor temperature.",
    ]),
    ("schedule", 0.8, 1.5, [
        "The second challenge is workflow scheduling integration.",
        "The team is building algorithms for the Slurm scheduler that read solar production forecasts and place scientific workloads where the power is.",
        "Large parallel runs at solar noon, flexible and preemptible jobs filling the gaps, lighter work after sunset.",
        "The goal: match as much computing as possible to low cost energy, while studying the tradeoff between cost and quality of service.",
    ]),
    ("checkpoint", 0.8, 1.5, [
        "The third challenge is checkpointing and restore.",
        "The battery rides through brief dips, but when clouds linger and stored energy runs low, running jobs cannot simply die.",
        "Applications periodically save their state, using nearly two terabytes of fast local NVMe on every node.",
        "Nodes can then idle, or power down.",
        "When the energy returns, jobs restore and continue exactly where they left off, with their data intact.",
    ]),
    ("outro", 1.0, 4.5, [
        "REPACSS is a production resource in the NSF ACCESS ecosystem, open to researchers nationwide.",
        "Its larger goal: show the data center industry that variable energy and advanced computing can work together, cutting costs and improving efficiency.",
        "From photons, to electrons, to tokens. This is REPACSS.",
    ]),
]

# "One Day at REPACSS": a 24-hour time-lapse of the site (scenes in src/scenes/day.js; outro reused)
ONE_DAY = [
    ("predawn", 2.0, 4.0, [
        "Four thirty in the morning, on the high plains of West Texas.",
        "The stars are still out over GLEAMM, the microgrid laboratory at the Reese Technology Center, ten miles west of Lubbock.",
        "Inside, the REPACSS cluster never really sleeps.",
        "All night it has run on the commercial grid and the West Texas wind, keeping only the work that cannot wait.",
        "But today, like every day, it is waiting for the sun.",
    ]),
    ("dawn", 0.8, 1.5, [
        "Six fifty. First light.",
        "Before the sun clears the horizon, the scheduler has already read today's solar forecast: clear this morning, clouds after lunch, storms by evening.",
        "It makes a plan, the way a farmer reads the sky.",
        "As the 350 kilowatt array wakes up, the battery starts to fill, and the first big jobs are released into the queue.",
    ]),
    ("noon", 0.8, 1.5, [
        "One fifty in the afternoon. Solar noon.",
        "The array is near its peak, and the whole cluster opens up.",
        "Thousands of cores run a weather simulation in parallel. On the GPUs, a language model answers questions, one token at a time.",
        "Right now, the sun is paying for almost all of it.",
        "And every watt is measured, node by node and code by code, so researchers can see exactly what their science costs.",
    ]),
    ("cloud", 0.8, 1.5, [
        "Three thirty. The clouds arrive, right on schedule.",
        "As they slide across the array, solar output falls by more than half in under a minute.",
        "On an ordinary solar powered system, this is where jobs would have to stop, save their state, and wait.",
        "Here, the 760 kilowatt-hour battery steps in and smooths the dip, and the cluster never notices.",
        "The cloud passes. The battery recharges. The work goes on.",
    ]),
    ("storm", 0.8, 1.5, [
        "Six twenty in the evening. The storm the forecast promised rolls in from the west.",
        "Lightning strikes the utility line, and the grid goes dark.",
        "For the first few seconds, the UPS carries every node.",
        "Then the 500 kilowatt diesel generator roars to life and takes over the load.",
        "The scheduler acts. Long jobs save their state to fast local NVMe, flexible work steps aside, and high priority work keeps running.",
    ]),
    ("night", 0.8, 1.5, [
        "Ten at night. The storm has moved on, and the grid is back.",
        "Behind it, the wind is still blowing, and the turbines on the horizon are turning.",
        "The paused jobs restore and pick up exactly where they left off. Nothing was lost.",
        "In one day, the cluster followed the sun, rode out a cloud, survived a storm, and never stopped computing.",
    ]),
    ("outro", 1.0, 4.5, [
        "REPACSS is a production resource in the NSF ACCESS ecosystem, open to researchers across the country.",
        "Every day it runs, it shows that advanced computing and variable energy can work together, accelerating discovery, reducing costs, and improving efficiency.",
        "Tomorrow, the sun will rise again. And the computer will be ready to follow it.",
    ]),
]
# "The Journey of Job 41827": one researcher's simulation, from a laptop to the sun and back (src/scenes/job.js)
JOB = [
    ("submit", 2.0, 4.0, [
        "Eleven at night, somewhere on the Great Plains, a researcher presses enter.",
        "The job is a drought model for the Ogallala aquifer, the vast underground water that farms from South Dakota to Texas depend on.",
        "Through the NSF ACCESS program, it travels hundreds of miles, to a supercomputer that runs on sunlight.",
        "This is the journey of job 41827.",
    ]),
    ("queue", 0.8, 1.5, [
        "It lands in the Slurm queue at REPACSS, in Lubbock, Texas.",
        "An ordinary scheduler would start it the moment enough nodes were free, day or night.",
        "This one reads tomorrow's solar forecast first.",
        "It packs the biggest jobs under the peak of the sunlight curve, slides flexible work into the shoulders, and keeps the night for work that cannot wait.",
        "Job 41827 needs 32 nodes for six hours. The scheduler gives it a place in the sun, at ten in the morning.",
    ]),
    ("morning", 0.8, 1.3, [
        "Ten o'clock. The solar array is climbing toward full power, and the job begins.",
        "Thirty two nodes, more than eight thousand cores, wake up together.",
    ]),
    ("run", 0.8, 1.5, [
        "Each node simulates its own slice of the plains: soil, rain, wells, and crops.",
        "Over InfiniBand, the nodes trade the edges of their slices thousands of times a second, so the water can flow across the whole map.",
        "And every node reports its power as it runs, so the energy behind this one result can be counted, watt by watt.",
    ]),
    ("overcast", 0.8, 1.5, [
        "At one o'clock, a thick bank of clouds settles over the array, and it does not move.",
        "The battery carries the load for a while, but the clouds outlast it.",
        "So the scheduler makes a decision. Job 41827 saves its state to fast local NVMe on every node, and its nodes power down.",
        "Nothing is lost. The job simply waits for the sun.",
    ]),
    ("resume", 0.8, 1.5, [
        "Three fifteen. The clouds break up, and sunlight floods the array again.",
        "The nodes power back on, read their checkpoints, and pick up at the exact time step where they stopped.",
        "By evening, the run is complete.",
    ]),
    ("results", 0.8, 1.5, [
        "The results travel back across the plains, to the researcher who asked the question.",
        "A map of where the aquifer is most at risk, and of how much water careful irrigation could save.",
        "Sunlight that fell on the High Plains, helping the High Plains keep their water.",
    ]),
    ("outro", 1.0, 4.5, [
        "REPACSS is a production resource in the NSF ACCESS ecosystem, open to researchers across the country.",
        "Every job it runs shows that advanced computing and variable energy can work together, accelerating discovery, reducing costs, and improving efficiency.",
        "Somewhere tonight, another researcher is pressing enter. And tomorrow, the sun will be ready.",
    ]),
]
STORIES = {"photons": SCRIPT, "one_day": ONE_DAY, "job": JOB}
STORY = sys.argv[1] if len(sys.argv) > 1 else "photons"
SFX = "" if STORY == "photons" else "_" + STORY

# Spoken-form fixes so the TTS pronounces acronyms well. Display text keeps the original.
SPOKEN = [
    (r"REPACSS", "Ree-packs"), (r"GLEAMM", "Gleam"), (r"EPYC", "Epic"), (r"NVMe", "N-V-M-E"),
    (r"H100 NVL", "H one hundred N-V-L"), (r"H100", "H one hundred"), (r"NDR", "N-D-R"),
    (r"p-n junction", "P-N junction"), (r"1\.1 electron", "one point one electron"),
    (r"1\.5 terabytes", "one and a half terabytes"), (r"\bkW\b", "kilowatt"), (r"\bUPS\b", "U-P-S"),
    (r"2\.9 petabytes", "two point nine petabytes"), (r"kilowatt-hour", "kilowatt hour"),
]


def spoken(s):
    for a, b in SPOKEN:
        s = re.sub(a, b, s)
    return s


_model = _asr = None


def norm(s):
    return re.sub(r"[^a-z ]", " ", s.lower()).split()


def score(text, wav):
    """(numbers all spoken correctly, word similarity, transcript) from a Whisper transcript of the take"""
    import mlx_whisper
    hyp = mlx_whisper.transcribe(wav, path_or_hf_repo="mlx-community/whisper-large-v3-turbo", language="en")["text"]
    flat = hyp.replace(",", "")
    nums_ok = all(n in flat for n in re.findall(r"\d+(?:\.\d+)?", spoken(text)))
    return nums_ok, difflib.SequenceMatcher(None, norm(spoken(text)), norm(hyp)).ratio(), hyp


def f0(path):
    """median voiced pitch (Hz) via autocorrelation"""
    with wave.open(path) as w:
        sr = w.getframerate(); a = np.frombuffer(w.readframes(w.getnframes()), "<i2").astype(np.float32) / 32768
    fr = int(.04 * sr); out = []
    for i in range(0, len(a) - fr, fr // 2):
        x = a[i:i + fr] * np.hanning(fr)
        if np.sqrt((x ** 2).mean()) < .02: continue
        ac = np.correlate(x, x, "full")[fr - 1:]; lo, hi = int(sr / 300), int(sr / 65)
        k = lo + np.argmax(ac[lo:hi])
        if ac[k] > .4 * ac[0]: out.append(sr / k)
    return float(np.median(out)) if out else 0.0


_ref_f0 = None


def trim(a, thr=0.01, pad=0.06):
    idx = np.where(np.abs(a) > thr)[0]
    if not len(idx): return a
    p = int(pad * SR)
    return a[max(0, idx[0] - p): idx[-1] + p]


def tts(text, path):
    """returns (seconds, pcm16 bytes); caches by text hash next to the wav"""
    global _model
    global _ref_f0
    _ref_f0 = _ref_f0 or f0(REF_WAV)
    key = hashlib.sha1((MODEL + REF_TEXT + str(TEMP) + spoken(text)).encode() + open(REF_WAV, "rb").read()).hexdigest()[:12]
    kf = path + ".key"
    if os.path.exists(path) and os.path.exists(kf) and open(kf).read() == key:
        if (not re.search(r"\d", text) or score(text, path)[0]) and abs(f0(path) / _ref_f0 - 1) <= PITCH_TOL:
            return stretch(path)
        print("   cached take misreads a number; regenerating")
    import mlx.core as mx
    from mlx_audio.tts.utils import load_model
    _model = _model or load_model(MODEL)
    best = None
    for seed in range(TAKES):
        mx.random.seed(1000 + seed)
        chunks = [np.array(r.audio) for r in _model.generate(text=spoken(text), ref_audio=REF_WAV, ref_text=REF_TEXT, temperature=TEMP)]
        a = trim(np.concatenate(chunks).astype(np.float32))
        pcm = (np.clip(a, -1, 1) * 32767).astype("<i2").tobytes()
        with wave.open(path, "wb") as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm)
        ok, sim, hyp = score(text, path)
        dev = abs(f0(path) / _ref_f0 - 1)
        voice_ok = dev <= PITCH_TOL
        rank = (ok, voice_ok, sim - dev)
        if not best or rank > best[0]: best = (rank, pcm)
        print(f"   take {seed}: numbers {'ok' if ok else 'WRONG'}  voice {'ok' if voice_ok else 'DRIFT'} ({dev:+.0%})  match {sim:.2f}  {hyp.strip()[:70]}")
        if ok and voice_ok and sim >= .85: break
    if not (best[0][0] and best[0][1]): print("   !! no take passed every check; using the closest one")
    with wave.open(path, "wb") as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(best[1])
    open(kf, "w").write(key)
    return stretch(path)


def stretch(path):
    """pitch-preserving tempo change; returns (seconds, pcm16 bytes)"""
    import subprocess
    out = path.replace(".wav", ".fast.wav")
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", path, "-filter:a", f"atempo={TEMPO}", "-ar", str(SR), "-ac", "1", out], check=True)
    with wave.open(out) as w: return w.getnframes() / SR, w.readframes(w.getnframes())


def srt_time(t):
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}"


def main():
    os.makedirs("build/tts", exist_ok=True)
    pcm, t, scenes, srt = bytearray(), 0.0, [], []

    def silence(sec):
        nonlocal t
        n = int(round(sec * SR))
        pcm.extend(b"\0\0" * n)
        t += n / SR

    for sid, lead, tail, sentences in STORIES[STORY]:
        start = t
        silence(lead)
        sents = []
        for i, s in enumerate(sentences):
            if i: silence(GAP)
            print(f"{sid}[{i}] {s[:70]}")
            dur, frames = tts(s, f"build/tts/{STORY + '_' if SFX else ''}{sid}_{i}.wav")
            sents.append({"start": round(t - start, 3), "end": round(t - start + dur, 3), "text": s})
            srt.append((t, t + dur, s))
            pcm.extend(frames)
            t += dur
        silence(tail)
        scenes.append({"id": sid, "start": round(start, 3), "dur": round(t - start, 3), "sentences": sents})

    with wave.open(f"build/narration{SFX}.wav", "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(bytes(pcm))
    json.dump({"total": round(t, 3), "scenes": scenes}, open(f"timeline{SFX}.json", "w"), indent=1)
    with open(f"build/captions{SFX}.srt", "w") as f:
        for i, (a0, a1, s) in enumerate(srt, 1):
            f.write(f"{i}\n{srt_time(a0)} --> {srt_time(a1)}\n{s}\n\n")
    for s in scenes:
        print(f"{s['id']:<11} start {s['start']:7.2f}  dur {s['dur']:6.2f}")
    print(f"total {t:.1f}s ({t / 60:.2f} min)")


if __name__ == "__main__":
    main()
