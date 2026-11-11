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
import time
from audio_harness import PCMReader, wait_until


def player(hz):
    # Synthetic playback needs headroom on non-realtime CI runners, not 20 ms latency.
    process = subprocess.Popen(['pacat', '--playback', '--raw', '--format=float32le', '--rate=48000', '--channels=2', '--latency-msec=200'], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=None)
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
expected_exits = set()
with tempfile.TemporaryDirectory(prefix='diddy-audio-') as runtime:
    # Ignore inherited remote endpoints/configuration; every socket belongs to this run.
    for key in ['PULSE_CLIENTCONFIG', 'PULSE_SOURCE', 'PIPEWIRE_REMOTE', 'PIPEWIRE_RUNTIME_DIR',
                'PIPEWIRE_CONFIG_DIR', 'WIREPLUMBER_CONFIG_DIR', 'PULSE_SINK']:
        os.environ.pop(key, None)
    os.environ['PIPEWIRE_RUNTIME_DIR'] = runtime
    os.environ['XDG_CACHE_HOME'] = runtime + '/cache'
    os.environ['XDG_RUNTIME_DIR'] = runtime
    os.environ['XDG_CONFIG_HOME'] = runtime + '/config'
    os.environ['XDG_STATE_HOME'] = runtime + '/state'
    os.environ['PULSE_SERVER'] = 'unix:' + runtime + '/pulse/native'
    os.makedirs(runtime + '/pulse')
    log = open(runtime + '/server.log', 'w')
    helper_log = open(runtime + '/helper.log', 'w')
    def command(args, **kwargs):
        return subprocess.run(args, timeout=5, **kwargs)
    def healthy():
        for process in processes:
            if process.poll() is not None and process.pid not in expected_exits:
                raise RuntimeError(f'Child exited ({process.returncode}): {process.args}')
    def sinks():
        return json.loads(subprocess.check_output(
            ['pactl', '-f', 'json', 'list', 'sink-inputs'], timeout=5))
    def player_stream(process):
        for stream in sinks():
            pid = stream['properties'].get('application.process.id', '')
            try:
                parent = Path('/proc/' + pid + '/status').read_text().split('PPid:')[1].split()[0]
            except (OSError, IndexError):
                continue
            if parent == str(process.pid):
                return stream
        return None
    def launch(args, **kwargs):
        p = subprocess.Popen(args, **kwargs)
        processes.append(p)
        return p
    try:
        if backend == 'pipewire':
            launch(['pipewire'], stdout=log, stderr=log)
            wait_until('PipeWire core', lambda: command(['pw-cli', 'info', '0'],
                       stdout=subprocess.DEVNULL, stderr=log).returncode == 0, check=healthy)
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
        wait_until('Pulse protocol', lambda: command(['pactl', 'info'],
                   stdout=subprocess.DEVNULL, stderr=log).returncode == 0, check=healthy)
        for name in ['diddy_test', 'diddy_other']:
            command(['pactl', 'load-module', 'module-null-sink', 'sink_name=' + name], check=True, stdout=subprocess.DEVNULL)
        os.environ['PULSE_SINK'] = 'diddy_test'
        # This process tree stands in for Diddy's main process + Chromium audio subprocess.
        own = launch([sys.executable, __file__, 'player', '880'], stdout=log, stderr=log, start_new_session=True)
        wait_until('excluded player stream', lambda: player_stream(own), check=healthy)
        capture = launch([helper, str(own.pid)], stdout=subprocess.PIPE, stderr=helper_log)
        reader = PCMReader(capture.stdout)
        wait_until('capture READY', lambda: b'READY\n' in Path(runtime + '/helper.log').read_bytes(), check=healthy)
        def measure(timeout=30):
            healthy()
            data = array.array('f')
            data.frombytes(reader.sample(timeout=timeout))
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
        settle_attempts = []
        def wait_for_tones(*tones):
            # Policy managers can connect a newly discovered stream asynchronously.
            # Require the actual tones, bounded in time; never tolerate Diddy's tone.
            deadline = time.monotonic() + 60
            attempts = 0
            while True:
                levels = measure(timeout=min(30, max(0, deadline - time.monotonic())))
                attempts += 1
                assert levels[880] < 0.005, ('own process leaked', levels)
                if all(levels[tone] > 0.05 for tone in tones):
                    settle_attempts.append(attempts)
                    return levels
                if time.monotonic() >= deadline:
                    # The helper's INFO/WARN lines explain which stream was not captured and why.
                    raise AssertionError(('audio did not settle', tones, levels))

        excluded = measure()
        assert excluded[880] < 0.005, ('own process leaked', excluded)
        foreign = launch([sys.executable, __file__, 'player', '440'], stdout=log, stderr=log, start_new_session=True)
        wait_until('foreign player stream', lambda: player_stream(foreign), check=healthy)
        included = wait_for_tones(440)
        assert included[440] > 0.05 and included[880] < 0.005, ('foreign/excluded mix', included)
        second = launch([sys.executable, __file__, 'player', '660'], stdout=log, stderr=log, start_new_session=True)
        wait_until('second player stream', lambda: player_stream(second), check=healthy)
        mixed = wait_for_tones(440, 660)
        assert mixed[440] > 0.05 and mixed[660] > 0.05 and mixed[880] < 0.005, ('dynamic mix', mixed)
        stream = player_stream(foreign)
        assert stream, 'Foreign playback stream disappeared before move'
        command(['pactl', 'move-sink-input', str(stream['index']), 'diddy_other'], check=True)
        destinations = json.loads(subprocess.check_output(['pactl', '-f', 'json', 'list', 'sinks'], timeout=5))
        other = next(sink['index'] for sink in destinations if sink['name'] == 'diddy_other')
        wait_until('stream moved to diddy_other',
                   lambda: (player_stream(foreign) or {}).get('sink') == other, check=healthy)
        moved = wait_for_tones(440, 660)
        assert moved[440] > 0.05 and moved[880] < 0.005, ('capture after sink move', moved)
        os.killpg(foreign.pid, signal.SIGTERM)
        foreign.wait(timeout=5)
        expected_exits.add(foreign.pid)
        wait_until('removed player stream', lambda: player_stream(foreign) is None)
        remaining = wait_for_tones(660)
        assert remaining[440] < 0.005, ('removed player still captured', remaining)
        assert capture.poll() is None, 'Removing a player ended capture'
        capture.terminate()
        assert capture.wait(timeout=5) == 0
        print(json.dumps({'backend': backend, 'settle_attempts': settle_attempts, 'excluded_only': excluded, 'foreign': included, 'mixed': mixed, 'moved': moved, 'exit': 0}))
    except BaseException:
        log.flush()
        helper_log.flush()
        for name in ['server.log', 'helper.log']:
            print(f'--- {backend} {name} ---', flush=True)
            print(Path(runtime, name).read_text(errors='replace'), flush=True)
        for p in processes:
            print(f'child status={p.poll()}: {p.args}', flush=True)
        for kind in ['info', 'list']:
            try:
                result = command(['pactl', kind], capture_output=True, text=True)
                print(result.stdout, result.stderr, flush=True)
            except Exception as error:
                print(f'pactl {kind}: {error}', flush=True)
        raise
    finally:
        for p in reversed(processes):
            if p.poll() is None or p.args[0] == sys.executable:
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
                if p.args[0] == sys.executable:
                    os.killpg(p.pid, signal.SIGKILL)
                else:
                    p.kill()
                p.wait(timeout=5)
        helper_log.close()
        log.close()
