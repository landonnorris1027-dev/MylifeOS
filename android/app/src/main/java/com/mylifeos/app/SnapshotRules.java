package com.mylifeos.app;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.Iterator;

/** Pure snapshot rules shared by the foreground plugin and alarm receiver. */
final class SnapshotRules {
    static final String LOGS = "mylifeos_daily_logs";
    static final String[] KEYS = { "mylifeos_habits", "mylifeos_goals", LOGS, "mylifeos_lang",
        "mylifeos_focus_settings", "mylifeos_profile_settings", "mylifeos_planner_settings",
        "mylifeos_recovery_points", "mylifeos_desktop_settings" };

    static JSONObject empty() throws JSONException {
        return new JSONObject().put("formatVersion", 1).put("revision", 0)
            .put("entries", new JSONObject()).put("sessions", new JSONObject()).put("completions", new JSONObject());
    }

    static boolean finite(Object value) {
        return value instanceof Number && Double.isFinite(((Number) value).doubleValue());
    }

    static void require(boolean valid, String reason) throws JSONException {
        if (!valid) throw new JSONException(reason);
    }

    static boolean text(Object value) { return value instanceof String && !((String) value).trim().isEmpty(); }
    static boolean date(String value) {
        if (!value.matches("\\d{4}-\\d{2}-\\d{2}")) return false;
        java.text.SimpleDateFormat format = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.ROOT);
        format.setLenient(false);
        try { return format.format(format.parse(value)).equals(value); } catch (java.text.ParseException error) { return false; }
    }

    static void validate(JSONObject snapshot) throws JSONException {
        require(snapshot.optInt("formatVersion") == 1, "Unsupported native snapshot format");
        require(finite(snapshot.opt("revision")) && snapshot.getLong("revision") >= 0
            && snapshot.getDouble("revision") == snapshot.getLong("revision"), "Invalid native revision");
        JSONObject entries = snapshot.getJSONObject("entries");
        Iterator<String> keys = entries.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            require(entries.get(key) instanceof String, "Invalid entry " + key);
            String raw = entries.getString(key);
            if (key.equals("mylifeos_lang")) { require(raw.equals("zh") || raw.equals("en"), "Invalid language"); continue; }
            if (key.equals("mylifeos_goals") || key.equals("mylifeos_habits")) {
                JSONArray records = new JSONArray(raw);
                java.util.HashSet<String> seen = new java.util.HashSet<>();
                for (int i = 0; i < records.length(); i++) {
                    JSONObject record = records.getJSONObject(i);
                    require(text(record.opt("id")) && seen.add(record.getString("id")) && text(record.opt("name")), "Invalid or duplicate record");
                    if (key.equals("mylifeos_habits")) {
                        require(record.optInt("dailyQuota") > 0 && record.optInt("defaultDurationMinutes") > 0,
                            "Invalid habit duration or quota");
                        require(record.optString("priority").matches("P[123]"), "Invalid habit priority");
                        require(record.optString("effectiveType").matches("permanent|range"), "Invalid habit effective type");
                        for (String field : new String[] { "startDate", "endDate" })
                            if (record.has(field)) require(date(record.getString(field)), "Invalid habit date");
                        if (record.has("weekdays")) {
                            JSONArray days = record.getJSONArray("weekdays");
                            require(days.length() > 0, "Empty weekday rule");
                            java.util.HashSet<Integer> weekdays = new java.util.HashSet<>();
                            for (int j = 0; j < days.length(); j++) require(days.getInt(j) >= 0 && days.getInt(j) <= 6 && weekdays.add(days.getInt(j)), "Invalid weekdays");
                        }
                    }
                }
            } else if (key.equals(LOGS)) {
                JSONObject logs = new JSONObject(raw);
                Iterator<String> dates = logs.keys();
                java.util.HashSet<String> ids = new java.util.HashSet<>();
                while (dates.hasNext()) {
                    String dayKey = dates.next();
                    JSONObject day = logs.getJSONObject(dayKey);
                    require(date(dayKey) && dayKey.equals(day.getString("date")), "Invalid log date");
                    JSONArray tasks = day.getJSONArray("tasks");
                    for (int i = 0; i < tasks.length(); i++) {
                        JSONObject task = tasks.getJSONObject(i);
                        require(text(task.opt("id")) && ids.add(task.getString("id")) && text(task.opt("name")), "Invalid task");
                        require(dayKey.equals(task.getString("date")) && task.optInt("durationMinutes") > 0, "Invalid task date or duration");
                        require(task.optString("status").matches("inbox|scheduled|completed|deleted") && (task.optString("priority").matches("P[123]") || task.optString("priority").equals("none") && (task.optString("origin").equals("manual") || !task.has("habitId"))), "Invalid task status or priority");
                        if (task.has("actualFocusMinutes")) require(finite(task.get("actualFocusMinutes")) && task.getDouble("actualFocusMinutes") >= 0, "Invalid focus minutes");
                        if (task.has("startTime")) require(task.getString("startTime").matches("([01]\\d|2[0-3]):[0-5]\\d"), "Invalid scheduled time");
                    }
                }
            } else if (key.equals("mylifeos_recovery_points")) {
                JSONArray points = new JSONArray(raw);
                require(points.length() <= 7, "Too many recovery points");
                for (int i = 0; i < points.length(); i++) {
                    JSONObject point = points.getJSONObject(i);
                    require(text(point.opt("id")) && text(point.opt("createdAt")) && text(point.opt("backupJson")), "Invalid recovery point");
                    JSONObject backup = new JSONObject(point.getString("backupJson"));
                    backup.getJSONArray("habits"); backup.getJSONObject("dailyLogs");
                }
            } else if (key.equals("mylifeos_focus_settings")) {
                JSONObject value = new JSONObject(raw);
                require(value.opt("soundEnabled") instanceof Boolean && value.opt("notificationsEnabled") instanceof Boolean,
                    "Invalid focus settings");
                require(value.optInt("breakDurationMinutes") == 3 || value.optInt("breakDurationMinutes") == 5
                    || value.optInt("breakDurationMinutes") == 10 || value.optInt("breakDurationMinutes") == 15, "Invalid break duration");
                if (value.has("vibrationEnabled")) require(value.get("vibrationEnabled") instanceof Boolean, "Invalid vibration preference");
            } else if (key.equals("mylifeos_planner_settings")) {
                require(new JSONObject(raw).optString("timelineMode").matches("daytime|fullDay"), "Invalid planner settings");
            } else if (key.equals("mylifeos_profile_settings")) {
                int minutes = new JSONObject(raw).getInt("weeklyTargetMinutes");
                require(minutes >= 60 && minutes <= 4800, "Invalid weekly target");
            } else if (key.equals("mylifeos_desktop_settings")) {
                require(new JSONObject(raw).opt("minimizeToTray") instanceof Boolean, "Invalid desktop settings");
            } else { throw new JSONException("Unknown storage key " + key); }
        }
        JSONObject sessions = snapshot.getJSONObject("sessions");
        Iterator<String> sessionIds = sessions.keys();
        while (sessionIds.hasNext()) {
            String id = sessionIds.next(); JSONObject session = sessions.getJSONObject(id);
            validateSession(session);
            require(id.equals(session.getString("timerId")), "Mismatched session id");
        }
        JSONObject completions = snapshot.getJSONObject("completions");
        Iterator<String> completedIds = completions.keys();
        while (completedIds.hasNext()) {
            JSONObject completion = completions.getJSONObject(completedIds.next());
            require(date(completion.optString("taskDate")) && text(completion.opt("taskId"))
                && finite(completion.opt("minutes")) && completion.getDouble("minutes") >= 1
                && completion.getDouble("minutes") == completion.getInt("minutes")
                && finite(completion.opt("completedAt")), "Invalid completion ledger");
        }
    }

    static void validateSession(JSONObject session) throws JSONException {
        require(text(session.opt("timerId")) && finite(session.opt("duration")) && session.getDouble("duration") > 0,
            "Invalid session id or duration");
        require(finite(session.opt("endTime")) && finite(session.opt("remaining")) && session.getDouble("remaining") >= 0
            && session.getDouble("remaining") <= session.getDouble("duration") * 1000, "Invalid session deadline or remaining time");
        require(session.opt("isFocusMode") instanceof Boolean && session.opt("isActive") instanceof Boolean,
            "Invalid session mode");
        require(session.optString("state").matches("running|paused|completed"), "Invalid session state");
        require("running".equals(session.getString("state")) == session.getBoolean("isActive"), "Inconsistent session state");
        require(session.optInt("notificationId") > 0, "Invalid notification id");
        require(text(session.opt("taskId")) && text(session.opt("taskName")) && date(session.optString("taskDate")),
            "Invalid session task");
    }

    static JSONObject findTask(JSONObject snapshot, String date, String id) throws JSONException {
        JSONObject logs = new JSONObject(snapshot.getJSONObject("entries").optString(LOGS, "{}"));
        JSONObject day = logs.optJSONObject(date);
        if (day == null) return null;
        JSONArray tasks = day.getJSONArray("tasks");
        for (int i = 0; i < tasks.length(); i++) if (id.equals(tasks.getJSONObject(i).optString("id"))) return tasks.getJSONObject(i);
        return null;
    }

    /** Completion and the task write live in the same persisted snapshot. */
    static boolean complete(JSONObject snapshot, String timerId, long now, boolean early) throws JSONException {
        JSONObject session = snapshot.getJSONObject("sessions").optJSONObject(timerId);
        if (session == null || "completed".equals(session.optString("state"))) return false;
        if (!early && (!session.getBoolean("isActive") || session.getLong("endTime") > now)) return false;
        long remaining = session.getBoolean("isActive") ? Math.max(0, session.getLong("endTime") - now) : session.getLong("remaining");
        int minutes = Math.max(1, (int) Math.round((session.getDouble("duration") * 1000 - (early ? remaining : 0)) / 60000));
        if (session.getBoolean("isFocusMode")) {
            JSONObject completion = new JSONObject().put("taskDate", session.getString("taskDate"))
                .put("taskId", session.getString("taskId")).put("minutes", minutes)
                .put("completedAt", early ? now : session.getLong("endTime"));
            applyCompletion(snapshot, completion);
            snapshot.getJSONObject("completions").put(timerId, completion);
        }
        session.put("state", "completed").put("isActive", false).put("remaining", 0).put("actualFocusMinutes", minutes);
        return true;
    }

    static void applyCompletion(JSONObject snapshot, JSONObject completion) throws JSONException {
        JSONObject entries = snapshot.getJSONObject("entries");
        JSONObject logs = new JSONObject(entries.optString(LOGS, "{}"));
        JSONObject day = logs.optJSONObject(completion.getString("taskDate"));
        require(day != null, "Completed session task date is missing");
        JSONArray tasks = day.getJSONArray("tasks"); boolean found = false;
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject task = tasks.getJSONObject(i);
            if (completion.getString("taskId").equals(task.optString("id"))) {
                require(!"deleted".equals(task.optString("status")), "Completed session task was deleted");
                if (task.optString("origin").equals("manual") || !task.has("habitId")) task.put("priority", "none");
                task.put("status", "completed").put("actualFocusMinutes", completion.getInt("minutes")); found = true; break;
            }
        }
        require(found, "Completed session task is missing");
        entries.put(LOGS, logs.toString());
    }

    static void protectSessions(JSONObject previous, JSONObject next) throws JSONException {
        JSONObject sessions = previous.getJSONObject("sessions"); Iterator<String> ids = sessions.keys();
        while (ids.hasNext()) {
            JSONObject session = sessions.getJSONObject(ids.next());
            if ("completed".equals(session.optString("state"))) continue;
            JSONObject task = findTask(next, session.getString("taskDate"), session.getString("taskId"));
            require(task != null && !"deleted".equals(task.optString("status")), "Cannot remove an unfinished session task");
        }
        JSONObject completed = previous.getJSONObject("completions"); ids = completed.keys();
        while (ids.hasNext()) {
            JSONObject completion = completed.getJSONObject(ids.next());
            JSONObject task = findTask(next, completion.getString("taskDate"), completion.getString("taskId"));
            if (task != null && !"deleted".equals(task.optString("status"))) applyCompletion(next, completion);
        }
    }
}
