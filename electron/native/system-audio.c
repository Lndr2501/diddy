// Linux application-audio capture. libpulse also talks to pipewire-pulse.
// Record each application's sink input separately, excluding the entire Diddy process tree.
// No sink moves, virtual devices or persistent sound-server configuration changes.
#define _POSIX_C_SOURCE 200809L
#include <pulse/pulseaudio.h>
#include <pulse/timeval.h>
#include <sys/prctl.h>
#include <signal.h>
#include <unistd.h>
#include <errno.h>
#include <math.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>

#define RATE 48000
#define CHANNELS 2
#define BLOCK 480
#define CAPACITY (RATE / 5)
#define MAX_INPUTS 128
// A sink input whose monitor keeps failing is ignored after this many failures (each CHANGE event would
// otherwise retry it forever). Sink input indexes only grow, so a small ring of recent failures suffices.
#define DENY_AFTER 3
#define MAX_FAILURES 64

typedef struct {
    uint32_t index, sink;
    char app[64], binary[64], sink_name[96]; // Diagnostics only.
    pa_stream *stream;
    float samples[CAPACITY * CHANNELS];
    size_t read, count;
} Input;
static Input inputs[MAX_INPUTS];
static pa_mainloop *loop;
static pa_context *context;
static pid_t excluded_pid;
static volatile sig_atomic_t stopping;
static int failed;

static struct { uint32_t index; int count; } failures[MAX_FAILURES];
static unsigned next_failure;

// One line per call, written with a single write() so lines never interleave. The parent turns ERROR lines
// into a fatal capture error; every line (READY, INFO, WARN, ERROR) is copied to the app log.
static void report(const char *level, const char *format, ...) __attribute__((format(printf, 2, 3)));
static void report(const char *level, const char *format, ...) {
    char line[512];
    int n = snprintf(line, sizeof(line), "%s ", level);
    va_list args;
    va_start(args, format);
    int m = vsnprintf(line + n, sizeof(line) - (size_t)n - 1, format, args);
    va_end(args);
    size_t length = m < 0 ? (size_t)n : (size_t)n + (size_t)m;
    if (length > sizeof(line) - 2) length = sizeof(line) - 2;
    for (size_t i = 0; i < length; i++) if ((unsigned char)line[i] < 0x20) line[i] = ' ';
    line[length++] = '\n';
    ssize_t ignored = write(STDERR_FILENO, line, length);
    (void)ignored;
}
// Fatal: the whole capture ends. Only for failures of the audio server connection itself.
static void fail(const char *message) {
    report("ERROR", "%s", message);
    failed = 1;
    pa_mainloop_quit(loop, 1);
}
static void copy_text(char *dest, size_t size, const char *text) {
    snprintf(dest, size, "%s", text ? text : "");
    for (char *c = dest; *c; c++) if ((unsigned char)*c < 0x20 || *c == '"') *c = ' ';
}
static int record_failure(uint32_t key, int weight) {
    unsigned slot = MAX_FAILURES;
    for (unsigned i = 0; i < MAX_FAILURES; i++) if (failures[i].index == key) slot = i;
    if (slot == MAX_FAILURES) {
        slot = next_failure++ % MAX_FAILURES; // Overwrites the oldest entry.
        failures[slot].index = key;
        failures[slot].count = 0;
    }
    return failures[slot].count += weight;
}
static int denied(uint32_t key) {
    for (unsigned i = 0; i < MAX_FAILURES; i++) if (failures[i].index == key) return failures[i].count >= DENY_AFTER;
    return 0;
}
static void forget_failures(uint32_t key) {
    for (unsigned i = 0; i < MAX_FAILURES; i++) if (failures[i].index == key) memset(&failures[i], 0, sizeof(failures[i]));
}
static void operation(pa_operation *op) { if (op) pa_operation_unref(op); }
static void on_signal(int sig) { (void)sig; stopping = 1; }
static int excluded(const char *text) {
    if (!text || !*text) return 1; // Unknown ownership: never risk recording the call.
    char *end;
    long pid = strtol(text, &end, 10);
    if (*end || pid <= 1) return 1;
    for (int depth = 0; depth < 128 && pid > 1; depth++) {
        if (pid == excluded_pid) return 1;
        char path[64], line[512];
        snprintf(path, sizeof(path), "/proc/%ld/status", pid);
        FILE *file = fopen(path, "r");
        if (!file) return 1;
        long parent = -1;
        while (fgets(line, sizeof(line), file))
            if (sscanf(line, "PPid: %ld", &parent) == 1) break;
        fclose(file);
        if (parent < 0 || parent == pid) return 1;
        if (!parent) return 0; // A process at the root of this PID namespace.
        pid = parent;
    }
    return pid != 1;
}
static void remove_input(Input *in);
static void describe(const Input *in, char *out, size_t size) {
    snprintf(out, size, "sink input %u (app \"%s\", binary \"%s\", sink \"%s\")",
        in->index - 1, in->app, in->binary, in->sink_name);
}
// Give up on one application's monitor without touching the others. Returns 1 when the input is now ignored
// for good, 0 when a later event may try it again.
static int drop_input(Input *in, int weight, const char *what, int error) {
    char who[320];
    describe(in, who, sizeof(who));
    int count = record_failure(in->index, weight);
    int ignored = count >= DENY_AFTER;
    report("WARN", "%s: %s; %s, %s", what, pa_strerror(error), who,
        ignored ? "not capturing this stream" : "will retry on its next change");
    remove_input(in);
    return ignored;
}
static void remove_input(Input *in) {
    if (in->stream) {
        pa_stream_set_read_callback(in->stream, NULL, NULL);
        pa_stream_set_state_callback(in->stream, NULL, NULL);
        pa_stream_disconnect(in->stream);
        pa_stream_unref(in->stream);
    }
    memset(in, 0, sizeof(*in));
}
static void read_samples(pa_stream *stream, size_t requested, void *userdata) {
    (void)requested;
    Input *in = userdata;
    const void *data;
    size_t bytes;
    while (pa_stream_readable_size(stream) > 0) {
        if (pa_stream_peek(stream, &data, &bytes) < 0) { drop_input(in, DENY_AFTER, "Application audio read failed", pa_context_errno(context)); return; }
        if (!bytes) break;
        size_t frames = bytes / (sizeof(float) * CHANNELS);
        const float *samples = data;
        for (size_t f = 0; f < frames; f++) {
            if (in->count == CAPACITY) { in->read = (in->read + 1) % CAPACITY; in->count--; }
            size_t dest = ((in->read + in->count) % CAPACITY) * CHANNELS;
            for (int c = 0; c < CHANNELS; c++)
                in->samples[dest+c] = samples && isfinite(samples[f*CHANNELS+c]) ? samples[f*CHANNELS+c] : 0;
            in->count++;
        }
        pa_stream_drop(stream);
    }
}
static void input_info(pa_context *, const pa_sink_input_info *, int, void *);
static void stream_state(pa_stream *stream, void *userdata) {
    if (pa_stream_get_state(stream) != PA_STREAM_FAILED) return;
    // One application stream that cannot be monitored must not end the capture of all others.
    Input *in = userdata;
    uint32_t index = in->index - 1;
    int error = pa_context_errno(context);
    // A playback stream may disappear, or (older PipeWire) not be linkable yet, while its monitor is being
    // connected. That is not a failure of this stream: look it up again, as often as it takes, without
    // counting it towards the deny-list (the REMOVE event ends the retries once the stream is gone).
    if (error == PA_ERR_NOENTITY || error == PA_ERR_KILLED) {
        remove_input(in);
        operation(pa_context_get_sink_input_info(context, index, input_info, NULL));
        return;
    }
    drop_input(in, DENY_AFTER, "Application audio monitor failed", error);
}
typedef struct { Input *input; uint32_t index, sink; } SinkRequest;
static void sink_info(pa_context *ctx, const pa_sink_info *info, int eol, void *userdata) {
    SinkRequest *request = userdata;
    Input *in = request->input;
    int current = in->index == request->index && in->sink == request->sink && !in->stream;
    if (eol) {
        if (eol < 0 && current) drop_input(in, 1, "Cannot inspect audio output device", pa_context_errno(ctx));
        free(request);
        return;
    }
    if (!info || !current || in->sink != info->index) return;
    copy_text(in->sink_name, sizeof(in->sink_name), info->name);
    pa_sample_spec spec = { PA_SAMPLE_FLOAT32LE, RATE, CHANNELS };
    pa_proplist *props = pa_proplist_new();
    pa_proplist_sets(props, PA_PROP_APPLICATION_ID, "app.diddy.desktop.capture");
    in->stream = pa_stream_new_with_proplist(ctx, "Diddy shared application audio", &spec, NULL, props);
    pa_proplist_free(props);
    if (!in->stream) { drop_input(in, DENY_AFTER, "Cannot create application audio monitor", pa_context_errno(ctx)); return; }
    pa_stream_set_read_callback(in->stream, read_samples, in);
    pa_stream_set_state_callback(in->stream, stream_state, in);
    pa_buffer_attr attr = { .maxlength = (uint32_t)-1, .tlength = (uint32_t)-1,
        .prebuf = (uint32_t)-1, .minreq = (uint32_t)-1, .fragsize = BLOCK * CHANNELS * sizeof(float) };
    if (pa_stream_set_monitor_stream(in->stream, in->index - 1) < 0 ||
        pa_stream_connect_record(in->stream, info->monitor_source_name, &attr,
            PA_STREAM_ADJUST_LATENCY | PA_STREAM_DONT_MOVE) < 0) {
        drop_input(in, DENY_AFTER, "Cannot connect application audio monitor", pa_context_errno(ctx));
        return;
    }
    char who[320];
    describe(in, who, sizeof(who));
    report("INFO", "Monitoring %s", who);
}
static void input_info(pa_context *ctx, const pa_sink_input_info *info, int eol, void *userdata) {
    (void)userdata;
    if (eol || !info || info->index == UINT32_MAX || info->sink == PA_INVALID_INDEX) return;
    Input *existing = NULL, *empty = NULL;
    for (int i = 0; i < MAX_INPUTS; i++) {
        if (inputs[i].index == info->index + 1) existing = &inputs[i];
        if (!inputs[i].index && !empty) empty = &inputs[i];
    }
    const char *app = pa_proplist_gets(info->proplist, PA_PROP_APPLICATION_ID);
    int skip = (app && !strncmp(app, "app.diddy.desktop", 17)) ||
        excluded(pa_proplist_gets(info->proplist, PA_PROP_APPLICATION_PROCESS_ID));
    if (existing && (skip || existing->sink != info->sink)) { remove_input(existing); empty = existing; existing = NULL; }
    if (skip || existing || denied(info->index + 1)) return;
    if (!empty) { report("WARN", "Too many application audio streams; not capturing sink input %u", info->index); return; }
    empty->index = info->index + 1;
    empty->sink = info->sink;
    copy_text(empty->app, sizeof(empty->app), pa_proplist_gets(info->proplist, PA_PROP_APPLICATION_NAME));
    copy_text(empty->binary, sizeof(empty->binary), pa_proplist_gets(info->proplist, PA_PROP_APPLICATION_PROCESS_BINARY));
    SinkRequest *request = malloc(sizeof(*request));
    if (!request) { drop_input(empty, DENY_AFTER, "Cannot allocate audio monitor", PA_ERR_INTERNAL); return; }
    *request = (SinkRequest){ empty, empty->index, empty->sink };
    pa_operation *op = pa_context_get_sink_info_by_index(ctx, info->sink, sink_info, request);
    if (op) pa_operation_unref(op);
    else { free(request); drop_input(empty, 1, "Cannot inspect audio output device", pa_context_errno(ctx)); }
}
static void subscribed(pa_context *ctx, pa_subscription_event_type_t type, uint32_t index, void *userdata) {
    (void)userdata;
    if ((type & PA_SUBSCRIPTION_EVENT_FACILITY_MASK) != PA_SUBSCRIPTION_EVENT_SINK_INPUT) return;
    if ((type & PA_SUBSCRIPTION_EVENT_TYPE_MASK) == PA_SUBSCRIPTION_EVENT_REMOVE) {
        for (int i = 0; i < MAX_INPUTS; i++) if (inputs[i].index == index + 1) remove_input(&inputs[i]);
        forget_failures(index + 1);
    } else operation(pa_context_get_sink_input_info(ctx, index, input_info, NULL));
}
static void context_state(pa_context *ctx, void *userdata) {
    (void)userdata;
    switch (pa_context_get_state(ctx)) {
    case PA_CONTEXT_READY:
        pa_context_set_subscribe_callback(ctx, subscribed, NULL);
        operation(pa_context_subscribe(ctx, PA_SUBSCRIPTION_MASK_SINK_INPUT, NULL, NULL));
        operation(pa_context_get_sink_input_info_list(ctx, input_info, NULL));
        fprintf(stderr, "READY\n");
        break;
    case PA_CONTEXT_FAILED: case PA_CONTEXT_TERMINATED: {
        char message[160];
        snprintf(message, sizeof(message), "Audio server disconnected or unavailable: %s", pa_strerror(pa_context_errno(ctx)));
        fail(message);
        break;
    }
    default: break;
    }
}
static void tick(pa_mainloop_api *api, pa_time_event *event, const struct timeval *now, void *userdata) {
    (void)userdata;
    if (stopping) { api->quit(api, 0); return; }
    float block[BLOCK * CHANNELS] = {0};
    for (int i = 0; i < MAX_INPUTS; i++) {
        Input *in = &inputs[i];
        size_t count = in->count < BLOCK ? in->count : BLOCK;
        // Drop old queued audio instead of accumulating latency when the consumer stalls.
        if (in->count > BLOCK * 6) { in->read = (in->read + in->count - BLOCK * 4) % CAPACITY; in->count = BLOCK * 4; }
        for (size_t f = 0; f < count; f++) {
            size_t src = ((in->read + f) % CAPACITY) * CHANNELS;
            for (int c = 0; c < CHANNELS; c++) block[f*CHANNELS+c] += in->samples[src+c];
        }
        in->read = (in->read + count) % CAPACITY;
        in->count -= count;
    }
    for (size_t i = 0; i < BLOCK * CHANNELS; i++) block[i] = fmaxf(-1, fminf(1, block[i]));
    // One block fits PIPE_BUF: nonblocking writes either succeed or drop a whole block.
    ssize_t written = write(STDOUT_FILENO, block, sizeof(block));
    if ((written >= 0 && written != (ssize_t)sizeof(block)) || (written < 0 && errno != EAGAIN && errno != EINTR)) { api->quit(api, 1); return; }
    struct timeval next = *now;
    pa_timeval_add(&next, 10000);
    struct timeval actual;
    pa_gettimeofday(&actual);
    if (pa_timeval_cmp(&next, &actual) <= 0) { next = actual; pa_timeval_add(&next, 10000); }
    api->time_restart(event, &next);
}
int main(int argc, char **argv) {
    if (argc != 2) { fprintf(stderr, "Usage: diddy-system-audio EXCLUDED_PID\n"); return 2; }
    char *end;
    long root = strtol(argv[1], &end, 10);
    if (*end || root <= 1) return 2;
    excluded_pid = (pid_t)root;
    // Never leave a capture process alive if Electron crashes.
    pid_t parent = getppid();
    prctl(PR_SET_PDEATHSIG, SIGTERM);
    if (getppid() != parent) return 1;
    signal(SIGTERM, on_signal); signal(SIGINT, on_signal); signal(SIGPIPE, SIG_IGN);
    fcntl(STDOUT_FILENO, F_SETFL, fcntl(STDOUT_FILENO, F_GETFL) | O_NONBLOCK);
    loop = pa_mainloop_new();
    context = pa_context_new(pa_mainloop_get_api(loop), "Diddy system audio");
    pa_context_set_state_callback(context, context_state, NULL);
    if (pa_context_connect(context, NULL, PA_CONTEXT_NOAUTOSPAWN, NULL) < 0) { fprintf(stderr, "ERROR Audio server unavailable\n"); return 1; }
    struct timeval now; pa_gettimeofday(&now); pa_timeval_add(&now, 10000);
    pa_mainloop_get_api(loop)->time_new(pa_mainloop_get_api(loop), &now, tick, NULL);
    int result = 0;
    pa_mainloop_run(loop, &result);
    pa_context_set_state_callback(context, NULL, NULL);
    for (int i = 0; i < MAX_INPUTS; i++) remove_input(&inputs[i]);
    pa_context_disconnect(context); pa_context_unref(context); pa_mainloop_free(loop);
    return failed ? 1 : result;
}
