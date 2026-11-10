// Global shortcut for "talking to an agent" (#135) through the XDG Desktop Portal
// (org.freedesktop.portal.GlobalShortcuts). Wayland forbids reading keys of other windows, the portal
// is the sanctioned way: the compositor reports press (Activated) and release (Deactivated).
//
// Portal sessions and their Request.Response / Activated signals are tied to ONE D-Bus connection (the
// portal sends them to the caller only), so a `gdbus call` per step cannot work: this helper keeps
// the connection open for as long as the shortcut should exist. Electron has no D-Bus client.
//
// Usage: diddy-global-shortcut <shortcut-id> <preferred-trigger> <description>
//   e.g. diddy-global-shortcut agent-voice-ctrl-f13 CTRL+F13 "Talk to an agent"
// stdout, one line each (the parent only reads these, see electron/lib/portalShortcut.cjs):
//   bound <trigger>   the shortcut is registered; <trigger> is what the desktop reports (may differ)
//   down | up         the shortcut was pressed / released
//   error <code>      no-bus | no-portal | create-failed | denied | bind-failed | closed | timeout
// The helper ends when stdin closes (the parent died), on SIGTERM/SIGINT, or after an error.
#define _POSIX_C_SOURCE 200809L
#include <gio/gio.h>
#include <glib-unix.h>
#include <stdio.h>
#include <unistd.h>
#include <string.h>

#define PORTAL_NAME "org.freedesktop.portal.Desktop"
#define PORTAL_PATH "/org/freedesktop/portal/desktop"
#define SHORTCUTS_IFACE "org.freedesktop.portal.GlobalShortcuts"
#define REQUEST_IFACE "org.freedesktop.portal.Request"
#define SESSION_IFACE "org.freedesktop.portal.Session"
// BindShortcuts may show a dialog of the desktop; give the user time, but not forever.
#define RESPONSE_TIMEOUT_SECONDS 120

static GDBusConnection *connection;
static GMainLoop *loop;
static char *session_path;
static const char *shortcut_id;
static volatile gboolean stopping;

static struct {
    char *path;
    gboolean done;
    guint32 code;
    GVariant *results;
} pending;

static void say(const char *format, ...) G_GNUC_PRINTF(1, 2);
static void say(const char *format, ...) {
    va_list args;
    va_start(args, format);
    vprintf(format, args);
    va_end(args);
    putchar('\n');
    fflush(stdout);
}

static void fail(const char *code) {
    say("error %s", code);
}

static void on_response(GDBusConnection *c, const char *sender, const char *path, const char *iface,
                        const char *signal, GVariant *parameters, gpointer data) {
    (void)c; (void)sender; (void)iface; (void)signal; (void)data;
    if (!pending.path || pending.done || strcmp(path, pending.path) != 0) return;
    g_variant_get(parameters, "(u@a{sv})", &pending.code, &pending.results);
    pending.done = TRUE;
}

static void on_activation(GDBusConnection *c, const char *sender, const char *path, const char *iface,
                          const char *signal, GVariant *parameters, gpointer data) {
    (void)c; (void)sender; (void)path; (void)iface; (void)data;
    const char *session = NULL, *id = NULL;
    guint64 timestamp = 0;
    GVariant *options = NULL;
    g_variant_get(parameters, "(&o&st@a{sv})", &session, &id, &timestamp, &options);
    if (session_path && strcmp(session, session_path) == 0 && strcmp(id, shortcut_id) == 0) {
        say("%s", strcmp(signal, "Activated") == 0 ? "down" : "up");
    }
    g_variant_unref(options);
}

static void on_session_closed(GDBusConnection *c, const char *sender, const char *path, const char *iface,
                              const char *signal, GVariant *parameters, gpointer data) {
    (void)c; (void)sender; (void)iface; (void)signal; (void)parameters; (void)data;
    if (session_path && strcmp(path, session_path) == 0) {
        fail("closed");
        g_main_loop_quit(loop);
        stopping = TRUE;
    }
}

static gboolean on_stdin(GIOChannel *source, GIOCondition condition, gpointer data) {
    (void)data;
    char buffer[256];
    gsize read = 0;
    if (condition & (G_IO_HUP | G_IO_ERR)) {
        stopping = TRUE;
        g_main_loop_quit(loop);
        return G_SOURCE_REMOVE;
    }
    GIOStatus status = g_io_channel_read_chars(source, buffer, sizeof(buffer), &read, NULL);
    if (status == G_IO_STATUS_EOF || status == G_IO_STATUS_ERROR) {
        stopping = TRUE;
        g_main_loop_quit(loop);
        return G_SOURCE_REMOVE;
    }
    return G_SOURCE_CONTINUE;
}

static gboolean on_signal(gpointer data) {
    (void)data;
    stopping = TRUE;
    g_main_loop_quit(loop);
    return G_SOURCE_REMOVE;
}

static gboolean on_timeout(gpointer data) {
    *(gboolean *)data = TRUE;
    return G_SOURCE_REMOVE;
}

/* "1:42" style unique names become "1_42" inside the request path (portal convention). */
static char *sender_token(void) {
    const char *name = g_dbus_connection_get_unique_name(connection);
    char *token = g_strdup(name && name[0] == ':' ? name + 1 : name);
    g_strdelimit(token, ".", '_');
    return token;
}

/* Calls a portal method that answers through a Request. Returns TRUE and the results on code 0. */
static gboolean request(const char *method, GVariant *(*build)(const char *token, gpointer), gpointer data,
                        guint32 *code_out, GVariant **results_out) {
    static guint counter;
    char *sender = sender_token();
    char *token = g_strdup_printf("diddy_%u_%u", (guint)getpid(), ++counter);
    g_free(pending.path);
    pending.path = g_strdup_printf(PORTAL_PATH "/request/%s/%s", sender, token);
    pending.done = FALSE;
    g_clear_pointer(&pending.results, g_variant_unref);
    g_free(sender);

    GError *error = NULL;
    GVariant *reply = g_dbus_connection_call_sync(connection, PORTAL_NAME, PORTAL_PATH, SHORTCUTS_IFACE, method,
                                                   build(token, data), G_VARIANT_TYPE("(o)"),
                                                   G_DBUS_CALL_FLAGS_NONE, 10000, NULL, &error);
    g_free(token);
    if (!reply) {
        g_printerr("%s: %s\n", method, error->message);
        g_error_free(error);
        return FALSE;
    }
    const char *returned = NULL;
    g_variant_get(reply, "(&o)", &returned);
    // Portals older than 0.9 returned a different handle; follow what the portal says.
    if (!pending.done && strcmp(returned, pending.path) != 0) {
        g_free(pending.path);
        pending.path = g_strdup(returned);
    }
    g_variant_unref(reply);

    gboolean timed_out = FALSE;
    guint timer = g_timeout_add_seconds(RESPONSE_TIMEOUT_SECONDS, on_timeout, &timed_out);
    while (!pending.done && !timed_out && !stopping) g_main_context_iteration(NULL, TRUE);
    if (!timed_out) g_source_remove(timer);
    if (!pending.done) {
        if (timed_out) fail("timeout");
        return FALSE;
    }
    *code_out = pending.code;
    *results_out = pending.results;
    pending.results = NULL;
    return TRUE;
}

static GVariant *build_create(const char *token, gpointer data) {
    (void)data;
    GVariantBuilder options;
    g_variant_builder_init(&options, G_VARIANT_TYPE("a{sv}"));
    g_variant_builder_add(&options, "{sv}", "handle_token", g_variant_new_string(token));
    g_variant_builder_add(&options, "{sv}", "session_handle_token", g_variant_new_string(token));
    return g_variant_new("(a{sv})", &options);
}

static GVariant *build_bind(const char *token, gpointer data) {
    const char **arguments = data; // description, preferred trigger
    GVariantBuilder properties, shortcuts, options;
    g_variant_builder_init(&properties, G_VARIANT_TYPE("a{sv}"));
    g_variant_builder_add(&properties, "{sv}", "description", g_variant_new_string(arguments[0]));
    g_variant_builder_add(&properties, "{sv}", "preferred_trigger", g_variant_new_string(arguments[1]));
    g_variant_builder_init(&shortcuts, G_VARIANT_TYPE("a(sa{sv})"));
    g_variant_builder_add(&shortcuts, "(sa{sv})", shortcut_id, &properties);
    g_variant_builder_init(&options, G_VARIANT_TYPE("a{sv}"));
    g_variant_builder_add(&options, "{sv}", "handle_token", g_variant_new_string(token));
    return g_variant_new("(oa(sa{sv})sa{sv})", session_path, &shortcuts, "", &options);
}

static void close_session(void) {
    if (!session_path || !connection) return;
    GError *error = NULL;
    GVariant *reply = g_dbus_connection_call_sync(connection, PORTAL_NAME, session_path, SESSION_IFACE, "Close",
                                                   NULL, NULL, G_DBUS_CALL_FLAGS_NONE, 1000, NULL, &error);
    if (reply) g_variant_unref(reply);
    g_clear_error(&error);
}

int main(int argc, char **argv) {
    if (argc != 4) {
        fprintf(stderr, "usage: %s <shortcut-id> <preferred-trigger> <description>\n", argv[0]);
        return 2;
    }
    shortcut_id = argv[1];
    const char *bind_arguments[2] = { argv[3], argv[2] };
    loop = g_main_loop_new(NULL, FALSE);

    GError *error = NULL;
    connection = g_bus_get_sync(G_BUS_TYPE_SESSION, NULL, &error);
    if (!connection) {
        g_printerr("session bus: %s\n", error->message);
        fail("no-bus");
        return 1;
    }

    // Is there a portal with GlobalShortcuts at all? (GNOME < 48 has none; this also starts the portal.)
    GVariant *version = g_dbus_connection_call_sync(
        connection, PORTAL_NAME, PORTAL_PATH, "org.freedesktop.DBus.Properties", "Get",
        g_variant_new("(ss)", SHORTCUTS_IFACE, "version"), G_VARIANT_TYPE("(v)"),
        G_DBUS_CALL_FLAGS_NONE, 5000, NULL, &error);
    if (!version) {
        g_printerr("GlobalShortcuts portal: %s\n", error->message);
        fail("no-portal");
        return 1;
    }
    g_variant_unref(version);

    g_unix_signal_add(SIGTERM, on_signal, NULL);
    g_unix_signal_add(SIGINT, on_signal, NULL);
    g_unix_signal_add(SIGHUP, on_signal, NULL);
    GIOChannel *input = g_io_channel_unix_new(0);
    g_io_channel_set_encoding(input, NULL, NULL);
    g_io_channel_set_flags(input, G_IO_FLAG_NONBLOCK, NULL);
    g_io_add_watch(input, G_IO_IN | G_IO_HUP | G_IO_ERR, on_stdin, NULL);

    // Subscribe before the first call: the answer must not be missed.
    g_dbus_connection_signal_subscribe(connection, PORTAL_NAME, REQUEST_IFACE, "Response", NULL, NULL,
                                       G_DBUS_SIGNAL_FLAGS_NONE, on_response, NULL, NULL);
    g_dbus_connection_signal_subscribe(connection, PORTAL_NAME, SHORTCUTS_IFACE, "Activated", PORTAL_PATH, NULL,
                                       G_DBUS_SIGNAL_FLAGS_NONE, on_activation, NULL, NULL);
    g_dbus_connection_signal_subscribe(connection, PORTAL_NAME, SHORTCUTS_IFACE, "Deactivated", PORTAL_PATH, NULL,
                                       G_DBUS_SIGNAL_FLAGS_NONE, on_activation, NULL, NULL);
    g_dbus_connection_signal_subscribe(connection, PORTAL_NAME, SESSION_IFACE, "Closed", NULL, NULL,
                                       G_DBUS_SIGNAL_FLAGS_NONE, on_session_closed, NULL, NULL);

    guint32 code = 0;
    GVariant *results = NULL;
    if (!request("CreateSession", build_create, NULL, &code, &results)) {
        if (!stopping) fail("create-failed");
        return stopping ? 0 : 1;
    }
    const char *handle = NULL;
    if (code != 0 || !g_variant_lookup(results, "session_handle", "&s", &handle) ||
        !g_variant_is_object_path(handle)) {
        fail("create-failed");
        return 1;
    }
    session_path = g_strdup(handle);
    g_variant_unref(results);
    results = NULL;

    if (!request("BindShortcuts", build_bind, bind_arguments, &code, &results)) {
        if (!stopping) fail("bind-failed");
        close_session();
        return stopping ? 0 : 1;
    }
    if (code != 0) {
        fail(code == 1 ? "denied" : "bind-failed");
        close_session();
        return 1;
    }
    const char *trigger = "";
    GVariantIter *iter = NULL;
    if (g_variant_lookup(results, "shortcuts", "a(sa{sv})", &iter)) {
        const char *id = NULL;
        GVariant *properties = NULL;
        while (g_variant_iter_next(iter, "(&s@a{sv})", &id, &properties)) {
            const char *description = NULL;
            if (strcmp(id, shortcut_id) == 0 &&
                g_variant_lookup(properties, "trigger_description", "&s", &description)) {
                trigger = description;
            }
            g_variant_unref(properties);
        }
        g_variant_iter_free(iter);
    }
    say("bound %s", trigger);
    // `trigger` points into `results`, which stays alive until the process ends.

    if (!stopping) g_main_loop_run(loop);
    close_session();
    return 0;
}
