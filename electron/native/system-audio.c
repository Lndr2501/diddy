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
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>

#define RATE 48000
#define CHANNELS 2
#define BLOCK 480
#define CAPACITY (RATE / 5)
#define MAX_INPUTS 128

typedef struct {
    uint32_t index, sink;
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

static void fail(const char *message) {
    fprintf(stderr, "ERROR %s\n", message);
    failed = 1;
    pa_mainloop_quit(loop, 1);
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
        if (pa_stream_peek(stream, &data, &bytes) < 0) { fail("Audio stream read failed"); return; }
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
    if (pa_stream_get_state(stream) == PA_STREAM_FAILED) {
        // A playback stream may disappear while its monitor is being connected.
        // The subscription event removes it; other capture failures must be visible.
        int error = pa_context_errno(context);
        if (error == PA_ERR_NOENTITY || error == PA_ERR_KILLED) {
            Input *in = userdata;
            uint32_t index = in->index - 1;
            remove_input(in);
            operation(pa_context_get_sink_input_info(context, index, input_info, NULL));
        } else fail("Application audio monitor failed");
    }
}
typedef struct { Input *input; uint32_t index, sink; } SinkRequest;
static void sink_info(pa_context *ctx, const pa_sink_info *info, int eol, void *userdata) {
    SinkRequest *request = userdata;
    if (eol) { free(request); return; }
    Input *in = request->input;
    if (!info || in->index != request->index || in->sink != request->sink || in->stream || in->sink != info->index) return;
    pa_sample_spec spec = { PA_SAMPLE_FLOAT32LE, RATE, CHANNELS };
    pa_proplist *props = pa_proplist_new();
    pa_proplist_sets(props, PA_PROP_APPLICATION_ID, "app.diddy.desktop.capture");
    in->stream = pa_stream_new_with_proplist(ctx, "Diddy shared application audio", &spec, NULL, props);
    pa_proplist_free(props);
    if (!in->stream) { fail("Cannot create application audio monitor"); return; }
    pa_stream_set_read_callback(in->stream, read_samples, in);
    pa_stream_set_state_callback(in->stream, stream_state, in);
    pa_buffer_attr attr = { .maxlength = (uint32_t)-1, .tlength = (uint32_t)-1,
        .prebuf = (uint32_t)-1, .minreq = (uint32_t)-1, .fragsize = BLOCK * CHANNELS * sizeof(float) };
    if (pa_stream_set_monitor_stream(in->stream, in->index - 1) < 0 ||
        pa_stream_connect_record(in->stream, info->monitor_source_name, &attr,
            PA_STREAM_ADJUST_LATENCY | PA_STREAM_DONT_MOVE) < 0)
        fail("Cannot connect application audio monitor");
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
    if (skip || existing) return;
    if (!empty) { fail("Too many application audio streams"); return; }
    empty->index = info->index + 1;
    empty->sink = info->sink;
    SinkRequest *request = malloc(sizeof(*request));
    if (!request) { fail("Cannot allocate audio monitor"); return; }
    *request = (SinkRequest){ empty, empty->index, empty->sink };
    pa_operation *op = pa_context_get_sink_info_by_index(ctx, info->sink, sink_info, request);
    if (op) pa_operation_unref(op);
    else { free(request); fail("Cannot inspect audio output device"); }
}
static void subscribed(pa_context *ctx, pa_subscription_event_type_t type, uint32_t index, void *userdata) {
    (void)userdata;
    if ((type & PA_SUBSCRIPTION_EVENT_FACILITY_MASK) != PA_SUBSCRIPTION_EVENT_SINK_INPUT) return;
    if ((type & PA_SUBSCRIPTION_EVENT_TYPE_MASK) == PA_SUBSCRIPTION_EVENT_REMOVE) {
        for (int i = 0; i < MAX_INPUTS; i++) if (inputs[i].index == index + 1) remove_input(&inputs[i]);
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
    case PA_CONTEXT_FAILED: case PA_CONTEXT_TERMINATED: fail("Audio server disconnected or unavailable"); break;
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
