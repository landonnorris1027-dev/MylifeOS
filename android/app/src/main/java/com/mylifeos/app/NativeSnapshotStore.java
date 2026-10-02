package com.mylifeos.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** All foreground and receiver accesses use this lock, including read/modify/write. */
final class NativeSnapshotStore {
    static final Object LOCK = new Object();
    private final Context context;
    private final File primary;
    private final File previous;
    interface WriteCheck { void beforeWrite(File file) throws IOException; }
    private final WriteCheck writeCheck;

    NativeSnapshotStore(Context context) { this(context, new File(context.getNoBackupFilesDir(), "mylifeos")); }
    NativeSnapshotStore(Context context, File directory) {
        this(context, directory, file -> {});
    }
    NativeSnapshotStore(Context context, File directory, WriteCheck writeCheck) {
        this.context = context.getApplicationContext();
        this.writeCheck = writeCheck;
        primary = new File(directory, "app-data.json"); previous = new File(directory, "app-data.previous.json");
    }

    private JSONObject read(File file) throws IOException, JSONException {
        AtomicFile atomic = new AtomicFile(file);
        byte[] bytes;
        try (java.io.FileInputStream input = atomic.openRead()) {
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[8192]; int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            bytes = output.toByteArray();
        }
        JSONObject snapshot = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
        SnapshotRules.validate(snapshot); return snapshot;
    }

    private JSONObject readDurable() throws IOException, JSONException {
        try { return read(primary); }
        catch (IOException | JSONException error) {
            try { return read(previous); }
            catch (IOException | JSONException backupError) { throw new IOException("Native data unreadable; originals preserved", error); }
        }
    }

    private void writeAtomic(File file, JSONObject data) throws IOException {
        writeCheck.beforeWrite(file);
        File directory = file.getParentFile();
        if (directory != null && !directory.isDirectory() && !directory.mkdirs()) throw new IOException("Cannot create storage directory");
        AtomicFile atomic = new AtomicFile(file); FileOutputStream output = null;
        try {
            output = atomic.startWrite();
            output.write(data.toString().getBytes(StandardCharsets.UTF_8)); output.getFD().sync();
            atomic.finishWrite(output); output = null;
            // AtomicFile logs some rename errors. Read back before acknowledging.
            JSONObject verified = read(file);
            if (verified.getLong("revision") != data.getLong("revision")) throw new IOException("Snapshot replacement was not durable");
        } catch (JSONException error) { throw new IOException("Cannot verify native snapshot", error); }
        finally { if (output != null) atomic.failWrite(output); }
    }

    private void persist(JSONObject old, JSONObject next) throws IOException, JSONException {
        SnapshotRules.validate(next);
        if (old != null) writeAtomic(previous, old);
        writeAtomic(primary, next);
    }

    JSONObject load(JSONObject legacy, JSONArray dirty) throws IOException, JSONException {
        synchronized (LOCK) {
            if (primary.exists() || previous.exists() || new File(primary + ".bak").exists() || new File(primary + ".new").exists()) return view(readDurable());
            JSONObject next = SnapshotRules.empty(); JSONObject entries = next.getJSONObject("entries");
            SharedPreferences preferences = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
            java.util.HashSet<String> dirtyKeys = new java.util.HashSet<>();
            if (dirty != null) for (int i = 0; i < dirty.length(); i++) dirtyKeys.add(dirty.getString(i));
            for (String key : SnapshotRules.KEYS) {
                String nativeValue = preferences.getString(key, null);
                String localValue = legacy == null ? null : legacy.optString(key, null);
                String selected = dirtyKeys.contains(key) && localValue != null ? localValue : nativeValue != null ? nativeValue : localValue;
                if (selected != null) entries.put(key, selected);
            }
            String rawTimers = preferences.getString("mylifeos_native_pomodoro_timers", "[]");
            JSONArray timers = new JSONArray(rawTimers);
            for (int i = 0; i < timers.length(); i++) {
                JSONObject timer = timers.getJSONObject(i);
                timer.put("state", timer.getBoolean("isActive") ? "running" : "paused");
                SnapshotRules.validateSession(timer);
                next.getJSONObject("sessions").put(timer.getString("timerId"), timer);
                if (!timer.getBoolean("isFocusMode")) {
                    JSONObject task = SnapshotRules.findTask(next, timer.getString("taskDate"), timer.getString("taskId"));
                    SnapshotRules.require(task != null, "Legacy break task is missing");
                    JSONObject completion = new JSONObject().put("taskDate", timer.getString("taskDate"))
                        .put("taskId", timer.getString("taskId")).put("minutes", task.optInt("actualFocusMinutes", timer.getInt("taskDurationMinutes")))
                        .put("completedAt", System.currentTimeMillis());
                    SnapshotRules.applyCompletion(next, completion);
                    next.getJSONObject("completions").put(timer.getString("timerId").replaceFirst("_break$", ""), completion);
                }
            }
            // Legacy sources deliberately remain untouched after read-back verification.
            persist(null, next); return view(next);
        }
    }

    JSONObject get() throws IOException, JSONException { synchronized (LOCK) { return view(readDurable()); } }

    private void archive() throws IOException {
        String suffix = ".corrupt-" + System.currentTimeMillis();
        for (File file : new File[] { primary, previous, new File(primary + ".bak"), new File(primary + ".new") }) {
            if (!file.exists()) continue;
            File target = new File(file + suffix);
            try (java.io.FileInputStream input = new java.io.FileInputStream(file); FileOutputStream output = new FileOutputStream(target)) {
                byte[] buffer = new byte[8192]; int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                output.getFD().sync();
            }
            if (target.length() != file.length()) throw new IOException("Cannot archive damaged original");
        }
    }

    JSONObject write(JSONObject entries, long expectedRevision, boolean replace, boolean recover) throws IOException, JSONException {
        synchronized (LOCK) {
            JSONObject old = null;
            if (recover) {
                JSONObject readable = null;
                try { readable = readDurable(); } catch (IOException | JSONException ignored) { /* damaged originals are archived below */ }
                if (readable != null) requireFinished(readable);
                archive();
            }
            else { old = readDurable(); SnapshotRules.require(old.getLong("revision") == expectedRevision, "Native data changed; reload before retrying"); }
            JSONObject next = old == null ? SnapshotRules.empty() : new JSONObject(old.toString());
            if (replace) {
                requireFinished(next);
                next.put("sessions", new JSONObject()).put("completions", new JSONObject());
            }
            Iterator<String> keys = entries.keys();
            while (keys.hasNext()) { String key = keys.next(); next.getJSONObject("entries").put(key, entries.getString(key)); }
            if (old != null && !replace) SnapshotRules.protectSessions(old, next);
            next.put("revision", old == null ? 1 : old.getLong("revision") + 1);
            persist(old, next); return view(next);
        }
    }

    private static void requireFinished(JSONObject snapshot) throws JSONException {
        Iterator<String> ids = snapshot.getJSONObject("sessions").keys();
        while (ids.hasNext()) SnapshotRules.require("completed".equals(snapshot.getJSONObject("sessions").getJSONObject(ids.next()).getString("state")), "Stop unfinished sessions before importing or restoring");
    }

    JSONObject timer(String action, String id, JSONObject data, long now) throws IOException, JSONException {
        synchronized (LOCK) {
            JSONObject old = readDurable(); JSONObject next = new JSONObject(old.toString());
            JSONObject sessions = next.getJSONObject("sessions"); JSONObject timer = sessions.optJSONObject(id);
            if (action.equals("start")) {
                SnapshotRules.require(data != null && id.equals(data.getString("timerId")), "Missing session payload");
                Iterator<String> ids = sessions.keys();
                while (ids.hasNext()) {
                    JSONObject other = sessions.getJSONObject(ids.next());
                    SnapshotRules.require("completed".equals(other.optString("state")), "Another session is unfinished");
                }
                timer = new JSONObject(data.toString()); long remaining = Math.round(timer.getDouble("duration") * 1000);
                timer.put("remaining", remaining).put("endTime", now + remaining).put("isActive", true).put("state", "running")
                    .put("notificationId", Math.max(1, id.hashCode() & 0x7fffffff));
                SnapshotRules.validateSession(timer);
                JSONObject task = SnapshotRules.findTask(next, timer.getString("taskDate"), timer.getString("taskId"));
                SnapshotRules.require(task != null && (!timer.getBoolean("isFocusMode") || !"completed".equals(task.optString("status")))
                    && !"deleted".equals(task.optString("status")), "Task unavailable for this session");
                sessions.put(id, timer);
            } else if (timer != null) {
                if (action.equals("stop")) sessions.remove(id);
                else if (action.equals("complete")) SnapshotRules.complete(next, id, now, true);
                else if (action.equals("toggle") && !"completed".equals(timer.optString("state"))) {
                    if (timer.getBoolean("isActive") && timer.getLong("endTime") <= now) SnapshotRules.complete(next, id, now, false);
                    else if (timer.getBoolean("isActive")) timer.put("remaining", Math.max(0, timer.getLong("endTime") - now)).put("isActive", false).put("state", "paused");
                    else timer.put("endTime", now + timer.getLong("remaining")).put("isActive", true).put("state", "running");
                }
            }
            next.put("revision", old.getLong("revision") + 1); persist(old, next); return view(next);
        }
    }

    JSONObject reconcile(long now) throws IOException, JSONException {
        synchronized (LOCK) {
            JSONObject old = readDurable(); JSONObject next = new JSONObject(old.toString()); boolean changed = false;
            Iterator<String> ids = next.getJSONObject("sessions").keys();
            while (ids.hasNext()) changed |= SnapshotRules.complete(next, ids.next(), now, false);
            if (changed) { next.put("revision", old.getLong("revision") + 1); persist(old, next); }
            return view(next);
        }
    }

    boolean completeAlarm(String id, long now) throws IOException, JSONException {
        synchronized (LOCK) {
            JSONObject old = readDurable(); JSONObject next = new JSONObject(old.toString());
            JSONObject timer = next.getJSONObject("sessions").optJSONObject(id);
            if (timer == null || (!timer.getBoolean("isActive") && !"completed".equals(timer.optString("state")))) return false;
            if (SnapshotRules.complete(next, id, now, false)) {
                next.put("revision", old.getLong("revision") + 1); persist(old, next);
            }
            return "completed".equals(timer.optString("state"));
        }
    }

    static JSONObject view(JSONObject data) throws JSONException {
        JSONArray sessions = new JSONArray(); Iterator<String> ids = data.getJSONObject("sessions").keys();
        while (ids.hasNext()) sessions.put(data.getJSONObject("sessions").getJSONObject(ids.next()));
        return new JSONObject().put("revision", data.getLong("revision")).put("entries", data.getJSONObject("entries")).put("sessions", sessions);
    }
}
