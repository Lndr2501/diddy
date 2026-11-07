"""Real sound-server regression: synthetic players, stream discovery/moves and exclusion.
Run in an isolated environment, never against a user's sound server.
"""
import array
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import threading
import time


def player(hz):
    process = subprocess.Popen(['pacat', '--playback', '--raw', '--format=float32le', '--rate=48000', '--channels=2', '--latency-msec=20'], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    samples = array.array('f', (0.15 * math.sin(2 * math.pi * hz * (i // 2) / 48000) for i in range(9600))).tobytes()
    try:
        while True:
            process.stdin.write(samples)
            process.stdin.flush()
    except (BrokenPipeError, KeyboardInterrupt):
        pass
    finally:
        process.terminate()
        process.wait(timeout=5)


if len(sys.argv) > 1 and sys.argv[1] == 'player':
    player(int(sys.argv[2]))
    sys.exit()

backend = sys.argv[1] if len(sys.argv) > 1 else 'pulse'
helper = str(Path(__file__).resolve().parents[1] / 'native/bin/diddy-system-audio')
processes = []
with tempfile.TemporaryDirectory(prefix='diddy-audio-') as runtime:
    os.environ['XDG_RUNTIME_DIR'] = runtime
    os.environ['XDG_CONFIG_HOME'] = runtime + '/config'
    os.environ['XDG_STATE_HOME'] = runtime + '/state'
    os.environ['PULSE_SERVER'] = 'unix:' + runtime + '/pulse/native'
    os.makedirs(runtime + '/pulse')
    log = open(runtime + '/server.log', 'w')
    def launch(args, **kwargs):
        p = subprocess.Popen(args, **kwargs)
        processes.append(p)
        return p
    try:
        if backend == 'pipewire':
            launch(['pipewire'], stdout=log, stderr=log)
            launch(['pipewire-pulse'], stdout=log, stderr=log)
            # No hardware or logind in the isolated test environment; only null sinks.
            config = Path(runtime + '/config/wireplumber')
            for group, body in [('bluetooth', 'bluez_monitor.enabled = false'), ('main', 'alsa_monitor.enabled = false\nv4l2_monitor.enabled = false\nlibcamera_monitor.enabled = false')]:
                folder = config / (group + '.lua.d')
                folder.mkdir(parents=True, exist_ok=True)
                (folder / '89-test.lua').write_text(body)
            launch(['wireplumber'], stdout=log, stderr=log)
        else:
            launch(['pulseaudio', '-n', '--daemonize=no', '--exit-idle-time=-1', '--disable-shm=yes', '--load=module-native-protocol-unix socket=' + runtime + '/pulse/native auth-anonymous=1'], stdout=log, stderr=log)
        for attempt in range(100):
            if subprocess.run(['pactl', 'info'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
                break
            time.sleep(0.1)
        else:
            raise RuntimeError('Audio server unavailable: ' + Path(runtime + '/server.log').read_text())
        for name in ['diddy_test', 'diddy_other']:
            subprocess.run(['pactl', 'load-module', 'module-null-sink', 'sink_name=' + name], check=True, stdout=subprocess.DEVNULL)
        os.environ['PULSE_SINK'] = 'diddy_test'
        # This process tree stands in for Diddy's main process + Chromium audio subprocess.
        own = launch([sys.executable, __file__, 'player', '880'], stdout=log, stderr=log, start_new_session=True)
        capture = launch([helper, str(own.pid)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        line = capture.stderr.readline()
        assert line == b'READY\n', line
        audio = bytearray()
        def collect():
            while chunk := capture.stdout.read(3840):
                audio.extend(chunk)
        thread = threading.Thread(target=collect, daemon=True)
        thread.start()
        def measure(seconds=1.0):
            time.sleep(0.5)
            start = len(audio)
            time.sleep(seconds)
            data = array.array('f')
            end = len(audio) - len(audio) % 8
            data.frombytes(audio[start:end])
            mono = data[::2]
            assert len(mono) > 24000, ('no PCM', len(mono), capture.poll())
            def amplitude(hz):
                # Average short-window magnitudes: asynchronous sound-server clocks may
                # insert/drop frames. A single long coherent sum can cancel an audible tone.
                window = 4800
                amplitudes = []
                for start in range(0, len(mono) - window + 1, window):
                    chunk = mono[start:start + window]
                    real = sum(v * math.cos(2*math.pi*hz*i/48000) for i, v in enumerate(chunk))
                    imag = sum(v * math.sin(2*math.pi*hz*i/48000) for i, v in enumerate(chunk))
                    amplitudes.append(2 * math.hypot(real, imag) / len(chunk))
                return sum(amplitudes) / len(amplitudes)
            return {hz: amplitude(hz) for hz in [440, 660, 880]}
        excluded = measure()
        assert excluded[880] < 0.005, ('own process leaked', excluded)
        foreign = launch([sys.executable, __file__, 'player', '440'], stdout=log, stderr=log, start_new_session=True)
        included = measure()
        if included[440] < 0.05:
            print(Path(runtime + '/server.log').read_text(), flush=True)
            print(subprocess.check_output(['pactl', '-f', 'json', 'list', 'sink-inputs']).decode(), flush=True)
            print(subprocess.check_output(['pactl', '-f', 'json', 'list', 'source-outputs']).decode(), flush=True)
        assert included[440] > 0.05 and included[880] < 0.005, ('foreign/excluded mix', included)
        second = launch([sys.executable, __file__, 'player', '660'], stdout=log, stderr=log, start_new_session=True)
        mixed = measure()
        assert mixed[440] > 0.05 and mixed[660] > 0.05 and mixed[880] < 0.005, ('dynamic mix', mixed)
        inputs = json.loads(subprocess.check_output(['pactl', '-f', 'json', 'list', 'sink-inputs']))
        for stream in inputs:
            pid = stream['properties'].get('application.process.id', '')
            # The players' direct child is pacat.
            try:
                parent = Path('/proc/' + pid + '/status').read_text().split('PPid:')[1].split()[0]
            except (OSError, IndexError):
                continue
            if parent == str(foreign.pid):
                subprocess.run(['pactl', 'move-sink-input', str(stream['index']), 'diddy_other'], check=True)
        moved = measure()
        assert moved[440] > 0.05 and moved[880] < 0.005, ('capture after sink move', moved)
        os.killpg(foreign.pid, signal.SIGTERM)
        time.sleep(0.5)
        assert capture.poll() is None, 'Removing a player ended capture'
        capture.terminate()
        assert capture.wait(timeout=5) == 0
        print(json.dumps({'backend': backend, 'excluded_only': excluded, 'foreign': included, 'mixed': mixed, 'moved': moved, 'exit': 0}))
    finally:
        for p in reversed(processes):
            if p.poll() is None:
                try:
                    if p.args[0] == sys.executable:
                        os.killpg(p.pid, signal.SIGTERM)
                    else:
                        p.terminate()
                except ProcessLookupError:
                    pass
        for p in reversed(processes):
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()
        log.close()
