package com.mylifeos.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "NativeStorage")
public class NativeStoragePlugin extends Plugin {
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();
    interface Operation { JSONObject run() throws Exception; }
    private NativeSnapshotStore store() { return new NativeSnapshotStore(getContext()); }
    private void run(PluginCall call, Operation operation) {
        IO.execute(() -> {
            try { call.resolve(new JSObject(operation.run().toString())); }
            catch (Exception error) { call.reject(error.getMessage(), error); }
        });
    }

    @PluginMethod public void load(PluginCall call) {
        run(call, () -> {
            JSONObject result = store().load(call.getObject("legacy"), call.getArray("dirty"));
            try { ensureReminders(getContext(), result.getJSONArray("sessions"), true); }
            catch (RuntimeException error) { result.put("reminderError", error.getMessage()); }
            return result;
        });
    }

    @PluginMethod public void write(PluginCall call) {
        run(call, () -> {
            JSONObject entries = call.getObject("entries");
            if (entries == null) throw new IllegalArgumentException("Missing snapshot entries");
            JSONObject result = store().write(entries, call.getLong("expectedRevision", -1L),
                call.getBoolean("replace", false), call.getBoolean("recover", false));
            if (call.getBoolean("replace", false)) CompletionReminderReceiver.cancelAll(getContext());
            return result;
        });
    }

    @PluginMethod public void timer(PluginCall call) {
        run(call, () -> {
            String id = call.getString("timerId"); String action = call.getString("action");
            if (id == null || action == null || !action.matches("start|toggle|pause|resume|stop|complete")) throw new IllegalArgumentException("Invalid timer action");
            JSONObject result = store().timer(action, id, call.getObject("data"), System.currentTimeMillis());
            JSONArray sessions = result.getJSONArray("sessions"); JSONObject session = null;
            for (int i = 0; i < sessions.length(); i++) if (id.equals(sessions.getJSONObject(i).getString("timerId"))) session = sessions.getJSONObject(i);
            int notificationId = Math.max(1, id.hashCode() & 0x7fffffff);
            if (session != null && "completed".equals(session.optString("state")) && action.equals("complete")) {
                try { CompletionReminderReceiver.completeManual(getContext(), session); }
                catch (RuntimeException error) { result.put("reminderError", error.getMessage()); }
            }
            CompletionReminderReceiver.cancel(getContext(), notificationId);
            if (session != null && session.getBoolean("isActive")) {
                try { schedule(getContext(), session); }
                catch (RuntimeException error) { result.put("reminderError", error.getMessage()); }
            }
            return result;
        });
    }

    @PluginMethod public void stopForRecovery(PluginCall call) {
        run(call, () -> {
            CompletionReminderReceiver.cancelAll(getContext());
            return store().stopForRecovery();
        });
    }

    private static void schedule(android.content.Context context, JSONObject session) throws org.json.JSONException {
        JSONObject messages = session.optJSONObject("notificationMessages");
        if (messages == null) messages = new JSONObject();
        boolean focus = session.getBoolean("isFocusMode");
        CompletionReminderReceiver.schedule(context, session.getInt("notificationId"), session.getLong("endTime"),
            messages.optString(focus ? "focusCompleteTitle" : "breakFinishedTitle", focus ? "Focus complete" : "Break finished"),
            messages.optString(focus ? "focusCompleteBody" : "breakFinishedBody", ""),
            session.optBoolean("vibrationEnabled", true), session.optBoolean("soundEnabled", true),
            session.optBoolean("notificationsEnabled", true), session.getString("timerId"));
    }

    static void ensureReminders(android.content.Context context, JSONArray sessions, boolean rearm) throws org.json.JSONException {
        for (int i = 0; i < sessions.length(); i++) {
            JSONObject session = sessions.getJSONObject(i);
            if (session.getBoolean("isActive") && (rearm || !CompletionReminderReceiver.matches(context, session))) schedule(context, session);
        }
    }

    @PluginMethod public void timers(PluginCall call) {
        run(call, () -> {
            JSONObject result = store().reconcile(System.currentTimeMillis());
            JSONArray sessions = result.getJSONArray("sessions");
            try { ensureReminders(getContext(), sessions, call.getBoolean("rearm", false)); }
            catch (RuntimeException error) { result.put("reminderError", error.getMessage()); }
            for (int i = 0; i < sessions.length(); i++) {
                JSONObject session = sessions.getJSONObject(i);
                if ("completed".equals(session.optString("state")) && NativeReminderPlugin.appActive && NativeReminderPlugin.timerVisible) {
                    CompletionReminderReceiver.completeForeground(getContext(), session.getInt("notificationId"));
                }
            }
            return result;
        });
    }

    @PluginMethod public void saveDocument(PluginCall call) {
        if (call.getString("content") == null || call.getString("filename") == null) { call.reject("Missing document"); return; }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
            .setType("application/json").putExtra(Intent.EXTRA_TITLE, call.getString("filename"));
        startActivityForResult(call, intent, "documentSelected");
    }

    @ActivityCallback private void documentSelected(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.resolve(new JSObject().put("canceled", true)); return;
        }
        Uri uri = result.getData().getData();
        run(call, () -> {
            try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "w")) {
                if (output == null) throw new java.io.IOException("Cannot open backup document");
                output.write(call.getString("content").getBytes(StandardCharsets.UTF_8)); output.flush();
            }
            // Resolve only after close succeeds; sharing is a separate API.
            return new JSONObject().put("canceled", false).put("uri", uri.toString());
        });
    }
}
