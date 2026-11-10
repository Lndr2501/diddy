// Test double of the XDG GlobalShortcuts portal, only for electron/tests/globalShortcut.test.cjs.
// It follows the portal documentation (not the real xdg-desktop-portal): Requests answer through a
// unicast Response signal, Activated/Deactivated go to the caller only. Controlled over stdin:
//   down | up | close        emit Activated / Deactivated / Session.Closed
// stdout: "ready" once the name is owned, "session-closed-by-client" after Session.Close.
// FAKE_PORTAL_DENY=1 answers BindShortcuts with "cancelled by the user" (response code 1).
#define _POSIX_C_SOURCE 200809L
#include <gio/gio.h>
#include <stdio.h>
#include <string.h>

static GDBusConnection *connection;
static GMainLoop *loop;
static char *caller, *session_path;
static const char *shortcut_id = "";
static char *shortcut_id_copy;

static const char xml[] =
    "<node>"
    " <interface name='org.freedesktop.portal.GlobalShortcuts'>"
    "  <method name='CreateSession'><arg type='a{sv}' direction='in'/><arg type='o' direction='out'/></method>"
    "  <method name='BindShortcuts'><arg type='o' direction='in'/><arg type='a(sa{sv})' direction='in'/>"
    "   <arg type='s' direction='in'/><arg type='a{sv}' direction='in'/><arg type='o' direction='out'/></method>"
    "  <property name='version' type='u' access='read'/>"
    " </interface>"
    "</node>";
static const char session_xml[] =
    "<node><interface name='org.freedesktop.portal.Session'>"
    " <method name='Close'/></interface></node>";

typedef struct { char *path; guint code; GVariant *results; } Answer;

static gboolean send_response(gpointer data) {
    Answer *answer = data;
    GError *error = NULL;
    g_dbus_connection_emit_signal(connection, caller, answer->path, "org.freedesktop.portal.Request", "Response",
                                  g_variant_new("(u@a{sv})", answer->code, answer->results), &error);
    g_clear_error(&error);
    g_free(answer->path);
    g_free(answer);
    return G_SOURCE_REMOVE;
}

static char *request_path(const char *sender, const char *token) {
    char *clean = g_strdup(sender[0] == ':' ? sender + 1 : sender);
    g_strdelimit(clean, ".", '_');
    char *path = g_strdup_printf("/org/freedesktop/portal/desktop/request/%s/%s", clean, token);
    g_free(clean);
    return path;
}

static void session_method(GDBusConnection *c, const char *sender, const char *path, const char *iface,
                           const char *method, GVariant *parameters, GDBusMethodInvocation *invocation,
                           gpointer data) {
    (void)c; (void)sender; (void)path; (void)iface; (void)method; (void)parameters; (void)data;
    printf("session-closed-by-client\n");
    fflush(stdout);
    g_dbus_method_invocation_return_value(invocation, NULL);
}

static void on_method(GDBusConnection *c, const char *sender, const char *path, const char *iface,
                      const char *method, GVariant *parameters, GDBusMethodInvocation *invocation, gpointer data) {
    (void)c; (void)path; (void)iface; (void)data;
    g_free(caller);
    caller = g_strdup(sender);
    Answer *answer = g_new0(Answer, 1);
    GVariantBuilder results;
    g_variant_builder_init(&results, G_VARIANT_TYPE("a{sv}"));
    if (strcmp(method, "CreateSession") == 0) {
        GVariant *options = g_variant_get_child_value(parameters, 0);
        const char *token = NULL, *session_token = NULL;
        g_variant_lookup(options, "handle_token", "&s", &token);
        g_variant_lookup(options, "session_handle_token", "&s", &session_token);
        answer->path = request_path(sender, token);
        char *clean = g_strdup(sender + 1);
        g_strdelimit(clean, ".", '_');
        g_free(session_path);
        session_path = g_strdup_printf("/org/freedesktop/portal/desktop/session/%s/%s", clean, session_token);
        g_free(clean);
        GDBusNodeInfo *info = g_dbus_node_info_new_for_xml(session_xml, NULL);
        static const GDBusInterfaceVTable vtable = { session_method, NULL, NULL, { 0 } };
        g_dbus_connection_register_object(connection, session_path, info->interfaces[0], &vtable, NULL, NULL, NULL);
        g_variant_builder_add(&results, "{sv}", "session_handle", g_variant_new_string(session_path));
        g_variant_unref(options);
    } else {
        GVariant *options = g_variant_get_child_value(parameters, 3);
        const char *token = NULL;
        g_variant_lookup(options, "handle_token", "&s", &token);
        answer->path = request_path(sender, token);
        g_variant_unref(options);
        GVariant *shortcuts = g_variant_get_child_value(parameters, 1);
        const char *id = NULL;
        GVariant *properties = NULL;
        GVariantIter *iter = g_variant_iter_new(shortcuts);
        GVariantBuilder bound;
        g_variant_builder_init(&bound, G_VARIANT_TYPE("a(sa{sv})"));
        while (g_variant_iter_next(iter, "(&s@a{sv})", &id, &properties)) {
            const char *wanted = NULL;
            g_variant_lookup(properties, "preferred_trigger", "&s", &wanted);
            g_free(shortcut_id_copy);
            shortcut_id_copy = g_strdup(id);
            shortcut_id = shortcut_id_copy;
            char *description = g_strdup_printf("%s (fake desktop)", wanted ? wanted : "");
            GVariantBuilder props;
            g_variant_builder_init(&props, G_VARIANT_TYPE("a{sv}"));
            g_variant_builder_add(&props, "{sv}", "trigger_description", g_variant_new_string(description));
            g_variant_builder_add(&bound, "(sa{sv})", id, &props);
            g_free(description);
            g_variant_unref(properties);
        }
        g_variant_iter_free(iter);
        g_variant_unref(shortcuts);
        g_variant_builder_add(&results, "{sv}", "shortcuts", g_variant_builder_end(&bound));
        if (g_getenv("FAKE_PORTAL_DENY")) answer->code = 1;
    }
    answer->results = g_variant_ref_sink(g_variant_builder_end(&results));
    g_dbus_method_invocation_return_value(invocation, g_variant_new("(o)", answer->path));
    // The answer comes a little later, like a real portal's, never before the call returned.
    g_timeout_add(30, send_response, answer);
}

static GVariant *on_property(GDBusConnection *c, const char *sender, const char *path, const char *iface,
                             const char *name, GError **error, gpointer data) {
    (void)c; (void)sender; (void)path; (void)iface; (void)name; (void)error; (void)data;
    return g_variant_new_uint32(1);
}

static gboolean on_stdin(GIOChannel *source, GIOCondition condition, gpointer data) {
    (void)condition; (void)data;
    char *line = NULL;
    gsize length = 0;
    GIOStatus status = g_io_channel_read_line(source, &line, &length, NULL, NULL);
    if (status == G_IO_STATUS_EOF || status == G_IO_STATUS_ERROR) {
        g_main_loop_quit(loop);
        return G_SOURCE_REMOVE;
    }
    if (line) {
        g_strstrip(line);
        GError *error = NULL;
        if (!caller || !session_path) {
            /* nothing bound yet */
        } else if (strcmp(line, "down") == 0 || strcmp(line, "up") == 0) {
            g_dbus_connection_emit_signal(
                connection, caller, "/org/freedesktop/portal/desktop", "org.freedesktop.portal.GlobalShortcuts",
                line[0] == 'd' ? "Activated" : "Deactivated",
                g_variant_new("(osta{sv})", session_path, shortcut_id, (guint64)1, NULL), &error);
        } else if (strcmp(line, "close") == 0) {
            g_dbus_connection_emit_signal(connection, caller, session_path, "org.freedesktop.portal.Session", "Closed",
                                          g_variant_new("(a{sv})", NULL), &error);
        }
        g_clear_error(&error);
        g_free(line);
    }
    return G_SOURCE_CONTINUE;
}

static void on_bus(GDBusConnection *c, const char *name, gpointer data) {
    (void)name; (void)data;
    connection = c;
    GDBusNodeInfo *info = g_dbus_node_info_new_for_xml(xml, NULL);
    static const GDBusInterfaceVTable vtable = { on_method, on_property, NULL, { 0 } };
    g_dbus_connection_register_object(c, "/org/freedesktop/portal/desktop", info->interfaces[0], &vtable, NULL, NULL,
                                      NULL);
}

static void on_name(GDBusConnection *c, const char *name, gpointer data) {
    (void)c; (void)name; (void)data;
    printf("ready\n");
    fflush(stdout);
}

int main(void) {
    loop = g_main_loop_new(NULL, FALSE);
    g_bus_own_name(G_BUS_TYPE_SESSION, "org.freedesktop.portal.Desktop", G_BUS_NAME_OWNER_FLAGS_NONE, on_bus, on_name,
                   NULL, NULL, NULL);
    GIOChannel *input = g_io_channel_unix_new(0);
    g_io_add_watch(input, G_IO_IN | G_IO_HUP, on_stdin, NULL);
    g_main_loop_run(loop);
    return 0;
}
