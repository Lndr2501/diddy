"""Synthesizes Diddy's own sound set into ios/Diddy/Resources/Sounds as 16-bit mono CAF files.

Every sound is made here from sine partials, so there are no samples to license. Change a recipe
and run it again. Needs macOS for afconvert; uses only the Python standard library.

Usage (from the repository root): python3 ios/Tools/make_sounds.py
"""
import math
import os
import struct
import subprocess
import tempfile
import wave

RATE = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "ios", "Diddy", "Resources", "Sounds")

# Everything sits in D major, so sounds that overlap in a call stay consonant.
D4, A4, B4 = 293.66, 440.00, 493.88
D5, E5, FS5, A5, B5 = 587.33, 659.25, 739.99, 880.00, 987.77
D6, FS6 = 1174.66, 1479.98

BELL = ((1, 1.0), (2, 0.28), (3, 0.09), (4.2, 0.04))
SOFT = ((1, 1.0), (2, 0.12))
BRIGHT = ((1, 1.0), (2, 0.35), (3, 0.18), (5, 0.07))
PURE = ((1, 1.0),)


def tone(frequency, length, decay=0.12, partials=BELL, attack=0.004, volume=1.0):
    """A struck note: quick attack, then each partial dying away faster the higher it is."""
    samples = []
    for i in range(int(length * RATE)):
        t = i / RATE
        value = sum(
            weight * math.exp(-t * ratio / decay) * math.sin(2 * math.pi * frequency * ratio * t)
            for ratio, weight in partials
        )
        samples.append(value * min(1.0, t / attack) * volume)
    return samples


def glide(start, end, length, decay=0.05, volume=1.0):
    """A pitch sweep with a round tail, the "drop in a bottle" behind the message sounds."""
    samples = []
    phase = 0.0
    for i in range(int(length * RATE)):
        t = i / RATE
        progress = min(1.0, t / (length * 0.45))
        phase += 2 * math.pi * (start + (end - start) * progress) / RATE
        samples.append(math.sin(phase) * math.exp(-t / decay) * min(1.0, t / 0.002) * volume)
    return samples


def pad(frequencies, length, fade=0.18, volume=1.0):
    """A held, quiet chord for the ringback that fades in and out."""
    samples = []
    for i in range(int(length * RATE)):
        t = i / RATE
        envelope = min(1.0, t / fade, (length - t) / fade)
        value = sum(math.sin(2 * math.pi * f * t) + 0.1 * math.sin(4 * math.pi * f * t) for f in frequencies)
        samples.append(value * max(0.0, envelope) * volume)
    return samples


def mix(length, *parts):
    """Lays (start time, samples) parts over `length` seconds of silence."""
    result = [0.0] * int(length * RATE)
    for start, samples in parts:
        offset = int(start * RATE)
        for i, value in enumerate(samples):
            if offset + i < len(result):
                result[offset + i] += value
    return result


def notes(pitches, gap, tail=0.3, **kwargs):
    """Plays pitches one after the other, each ringing on under the next."""
    length = gap * (len(pitches) - 1) + tail
    return mix(length, *((gap * i, tone(p, tail, **kwargs)) for i, p in enumerate(pitches)))


def fade_out(samples, length=0.012):
    """Ends on silence, so no sound finishes with a click."""
    count = min(len(samples), int(length * RATE))
    for i in range(count):
        samples[len(samples) - 1 - i] *= i / count
    return samples


def ringtone():
    phrase = [D5, FS5, A5, FS5, B5, A5]
    parts = [(0.17 * i, tone(p, 1.1, decay=0.28, volume=0.9 if i % 2 else 1.0)) for i, p in enumerate(phrase)]
    parts += [(0.17 * 6, tone(D6, 1.4, decay=0.38))]
    return mix(3.4, *parts)


# Name, samples, peak in dB. The peak sets how present a sound is against a call.
SOUNDS = [
    ("ringtone", ringtone, -2),
    ("ringback", lambda: mix(3.4, (0, pad((A4, E5), 1.2))), -14),
    ("call_joined", lambda: notes((A5, D6), 0.09, 0.35), -6),
    ("call_left", lambda: notes((D6, A5), 0.1, 0.35), -6),
    ("user_joined", lambda: notes((FS5, A5), 0.07, 0.26, partials=SOFT), -9),
    ("user_left", lambda: notes((A5, FS5), 0.08, 0.26, partials=SOFT), -10),
    ("mute", lambda: tone(D5, 0.1, decay=0.03, partials=SOFT), -9),
    ("unmute", lambda: tone(A5, 0.1, decay=0.03, partials=SOFT), -9),
    ("deafen", lambda: notes((A5, D5), 0.055, 0.14, decay=0.04, partials=SOFT), -9),
    ("undeafen", lambda: notes((D5, A5), 0.055, 0.14, decay=0.04, partials=SOFT), -9),
    ("screen_share_started", lambda: notes((D5, A5, D6), 0.075, 0.45, decay=0.14, partials=BRIGHT), -7),
    ("screen_share_stopped", lambda: notes((D6, A5, D5), 0.075, 0.42, decay=0.13, partials=BRIGHT), -8),
    ("camera_on", lambda: notes((E5, B5), 0.05, 0.16, decay=0.05, partials=BRIGHT), -10),
    ("camera_off", lambda: notes((B5, E5), 0.05, 0.16, decay=0.05, partials=BRIGHT), -10),
    ("message", lambda: glide(620, 1040, 0.2), -8),
    ("mention", lambda: mix(0.5, (0, glide(620, 1040, 0.2)), (0.09, tone(FS6, 0.4, decay=0.12))), -6),
    ("invite", lambda: notes((FS5, A5, D6, FS6), 0.1, 0.5, decay=0.16), -7),
    ("call_declined", lambda: notes((B4, B4, B4), 0.16, 0.14, decay=0.05, partials=SOFT), -7),
    ("no_answer", lambda: notes((A5, FS5, D5), 0.17, 0.5, decay=0.16, partials=SOFT), -8),
    ("connection_lost", lambda: notes((D5, A4, D4), 0.13, 0.45, decay=0.14), -6),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    print(f"{'sound':<22}{'length':>8}{'peak dB':>9}{'rms dB':>8}{'last':>8}")
    with tempfile.TemporaryDirectory() as folder:
        for name, make, peak_db in SOUNDS:
            samples = fade_out(make())
            scale = 10 ** (peak_db / 20) / max(abs(s) for s in samples)
            pcm = [max(-32767, min(32767, round(s * scale * 32767))) for s in samples]
            source = os.path.join(folder, name + ".wav")
            with wave.open(source, "wb") as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(RATE)
                output.writeframes(struct.pack(f"<{len(pcm)}h", *pcm))
            subprocess.run(
                ["afconvert", "-f", "caff", "-d", "LEI16", source, os.path.join(OUT, name + ".caf")],
                check=True,
            )
            peak = max(abs(v) for v in pcm) / 32767
            rms = math.sqrt(sum(v * v for v in pcm) / len(pcm)) / 32767
            print(f"{name:<22}{len(pcm) / RATE:>7.2f}s{20 * math.log10(peak):>9.1f}{20 * math.log10(rms):>8.1f}{pcm[-1]:>8}")


if __name__ == "__main__":
    main()
