"""Generates an original, royalty-free upbeat background track (WAV) for the
short videos. Everything is synthesised here, so there are no third-party rights.
Usage: python3 scripts/make-music.py out.wav [seconds] [seed]
"""
import sys
import wave

import numpy as np

SR = 44100
BPM = 118
BEAT = 60 / BPM


def env(n, attack=0.005, release=0.2):
    t = np.arange(n) / SR
    a = np.clip(t / attack, 0, 1)
    r = np.exp(-t / release)
    return a * r


def lowpass(x, cutoff):
    # one-pole low-pass filter
    rc = 1 / (2 * np.pi * cutoff)
    alpha = (1 / SR) / (rc + 1 / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += alpha * (v - acc)
        y[i] = acc
    return y


def note(freq, dur, kind="saw", amp=0.2, release=0.35):
    n = int(dur * SR)
    t = np.arange(n) / SR
    if kind == "sine":
        w = np.sin(2 * np.pi * freq * t)
    else:  # soft detuned saw
        w = sum(2 * ((t * freq * d) % 1) - 1 for d in (0.996, 1.0, 1.004)) / 3
    return amp * w * env(n, 0.01, release)


def kick():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    freq = 50 + 90 * np.exp(-t * 30)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    return 0.9 * np.sin(phase) * np.exp(-t * 9)


def hat(rng):
    n = int(0.05 * SR)
    noise = rng.uniform(-1, 1, n)
    hp = noise - lowpass(noise, 6000)
    return 0.12 * hp * np.exp(-np.arange(n) / SR * 80)


def clap(rng):
    n = int(0.18 * SR)
    noise = rng.uniform(-1, 1, n)
    return 0.25 * (noise - lowpass(noise, 1500)) * np.exp(-np.arange(n) / SR * 22)


def mix(track, sig, start):
    i = int(start * SR)
    end = min(len(track), i + len(sig))
    if i < len(track):
        track[i:end] += sig[: end - i]


def main():
    out = sys.argv[1]
    seconds = float(sys.argv[2]) if len(sys.argv) > 2 else 20
    rng = np.random.default_rng(int(sys.argv[3]) if len(sys.argv) > 3 else 7)
    track = np.zeros(int((seconds + 1) * SR))
    # C – G – Am – F, one bar (4 beats) each
    chords = [(261.63, 329.63, 392.0), (196.0, 246.94, 293.66), (220.0, 261.63, 329.63), (174.61, 220.0, 261.63)]
    bass = [65.41, 49.0, 55.0, 43.65]
    melody = [523.25, 587.33, 659.26, 783.99, 659.26, 587.33, 523.25, 440.0]
    bars = int(seconds / (4 * BEAT)) + 1
    for b in range(bars):
        t0 = b * 4 * BEAT
        ci = b % 4
        for f in chords[ci]:
            mix(track, lowpass(note(f, 4 * BEAT, "saw", 0.07, 1.2), 1800), t0)
        for beat in range(4):
            tb = t0 + beat * BEAT
            mix(track, kick(), tb)
            mix(track, hat(rng), tb + BEAT / 2)
            if beat in (1, 3):
                mix(track, clap(rng), tb)
            mix(track, note(bass[ci], BEAT * 0.9, "sine", 0.35, 0.25), tb)
        if b >= 2:  # light melody after the intro
            for k in range(8):
                if rng.random() < 0.7:
                    mix(track, note(melody[(k + b) % 8], BEAT / 2, "sine", 0.08, 0.15), t0 + k * BEAT / 2)
    track = track[: int(seconds * SR)]
    fade = int(0.8 * SR)
    track[-fade:] *= np.linspace(1, 0, fade)
    track /= max(1e-9, np.max(np.abs(track))) / 0.8
    pcm = (track * 32767).astype(np.int16)
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print("saved", out)


if __name__ == "__main__":
    main()
