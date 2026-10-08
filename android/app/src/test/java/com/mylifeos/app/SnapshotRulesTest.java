package com.mylifeos.app;

import org.json.JSONObject;
import org.json.JSONException;
import org.junit.Test;
import static org.junit.Assert.*;

public class SnapshotRulesTest {
    static JSONObject fixture() throws Exception {
        JSONObject snapshot = SnapshotRules.empty();
        snapshot.getJSONObject("entries").put(SnapshotRules.LOGS,
            "{\"2026-10-02\":{\"date\":\"2026-10-02\",\"tasks\":[{\"id\":\"t\",\"name\":\"Focus\",\"date\":\"2026-10-02\",\"status\":\"scheduled\",\"priority\":\"P1\",\"durationMinutes\":25,\"habitId\":\"deleted-habit\"}]}}");
        snapshot.getJSONObject("sessions").put("s", new JSONObject()
            .put("timerId", "s").put("duration", 1500).put("endTime", 1500000).put("remaining", 1500000)
            .put("isFocusMode", true).put("isActive", true).put("state", "running").put("notificationId", 1)
            .put("taskId", "t").put("taskName", "Focus").put("taskDate", "2026-10-02"));
        return snapshot;
    }
    @Test public void lateAndDuplicateBroadcastsRecordOnceAtOriginalDeadline() throws Exception {
        JSONObject data = fixture();
        assertTrue(SnapshotRules.complete(data, "s", 9999999, false));
        assertFalse(SnapshotRules.complete(data, "s", 10000000, false));
        assertEquals(25, SnapshotRules.findTask(data, "2026-10-02", "t").getInt("actualFocusMinutes"));
        assertEquals(1500000, data.getJSONObject("completions").getJSONObject("s").getLong("completedAt"));
        SnapshotRules.validate(data);
    }
    @Test public void earlyCompletionUsesElapsedMinutes() throws Exception {
        JSONObject data = fixture();
        assertTrue(SnapshotRules.complete(data, "s", 180000, true));
        assertEquals(3, SnapshotRules.findTask(data, "2026-10-02", "t").getInt("actualFocusMinutes"));
    }
    @Test public void pausedSessionNeverFinishesOnClockDeadline() throws Exception {
        JSONObject data = fixture();
        data.getJSONObject("sessions").getJSONObject("s").put("isActive", false).put("state", "paused").put("remaining", 1200000);
        assertFalse(SnapshotRules.complete(data, "s", 9999999, false));
        assertTrue(SnapshotRules.complete(data, "s", 9999999, true));
        assertEquals(5, SnapshotRules.findTask(data, "2026-10-02", "t").getInt("actualFocusMinutes"));
    }
    @Test public void notYetDueDoesNotComplete() throws Exception {
        assertFalse(SnapshotRules.complete(fixture(), "s", 1000, false));
    }
    @Test public void stalePageCannotUndoPersistedCompletion() throws Exception {
        JSONObject old = fixture(), next = fixture();
        SnapshotRules.complete(old, "s", 1500000, false);
        SnapshotRules.protectSessions(old, next);
        assertEquals("completed", SnapshotRules.findTask(next, "2026-10-02", "t").getString("status"));
        assertEquals(25, SnapshotRules.findTask(next, "2026-10-02", "t").getInt("actualFocusMinutes"));
    }
    @Test(expected = JSONException.class) public void cannotRemoveUnfinishedTask() throws Exception {
        JSONObject old = fixture(), next = fixture();
        next.getJSONObject("entries").put(SnapshotRules.LOGS, "{}");
        SnapshotRules.protectSessions(old, next);
    }
    @Test public void finishedTaskMayBeIntentionallyDeleted() throws Exception {
        JSONObject old = fixture(), next = fixture();
        SnapshotRules.complete(old, "s", 1500000, false);
        JSONObject logs = new JSONObject(next.getJSONObject("entries").getString(SnapshotRules.LOGS));
        logs.getJSONObject("2026-10-02").getJSONArray("tasks").getJSONObject(0).put("status", "deleted");
        next.getJSONObject("entries").put(SnapshotRules.LOGS, logs.toString());
        SnapshotRules.protectSessions(old, next);
        assertEquals("deleted", SnapshotRules.findTask(next, "2026-10-02", "t").getString("status"));
    }
    @Test public void breakCompletionDoesNotOverwriteFocusMinutes() throws Exception {
        JSONObject data = fixture();
        SnapshotRules.complete(data, "s", 1500000, false);
        JSONObject rest = new JSONObject(data.getJSONObject("sessions").getJSONObject("s").toString());
        rest.put("timerId", "s_break").put("isFocusMode", false).put("isActive", true).put("state", "running")
            .put("duration", 300).put("remaining", 300000).put("endTime", 1800000);
        data.getJSONObject("sessions").put("s_break", rest);
        SnapshotRules.complete(data, "s_break", 9999999, false);
        assertEquals(25, SnapshotRules.findTask(data, "2026-10-02", "t").getInt("actualFocusMinutes"));
        assertEquals(1, data.getJSONObject("completions").length());
    }
    @Test(expected = JSONException.class) public void rejectsInvalidCalendarDate() throws Exception {
        JSONObject data = fixture();
        data.getJSONObject("sessions").getJSONObject("s").put("taskDate", "2026-02-30");
        SnapshotRules.validate(data);
    }
    @Test(expected = JSONException.class) public void rejectsCorruptCompletionLedger() throws Exception {
        JSONObject data = fixture();
        data.getJSONObject("completions").put("s", new JSONObject().put("minutes", -1));
        SnapshotRules.validate(data);
    }
    @Test public void acceptsUnprioritizedManualTasksAndCompletesTheirTimer() throws Exception {
        JSONObject data = fixture();
        JSONObject logs = new JSONObject(data.getJSONObject("entries").getString(SnapshotRules.LOGS));
        JSONObject task = logs.getJSONObject("2026-10-02").getJSONArray("tasks").getJSONObject(0);
        task.remove("habitId"); task.put("origin", "manual").put("priority", "none");
        data.getJSONObject("entries").put(SnapshotRules.LOGS, logs.toString());
        data.getJSONObject("sessions").getJSONObject("s").put("taskPriority", "none");
        SnapshotRules.validate(data);
        assertTrue(SnapshotRules.complete(data, "s", 1500000, false));
        assertEquals("none", SnapshotRules.findTask(data, "2026-10-02", "t").getString("priority"));
        SnapshotRules.validate(data);
    }
    @Test public void completingLegacyManualTaskRemovesItsPriority() throws Exception {
        JSONObject data = fixture();
        JSONObject logs = new JSONObject(data.getJSONObject("entries").getString(SnapshotRules.LOGS));
        logs.getJSONObject("2026-10-02").getJSONArray("tasks").getJSONObject(0).remove("habitId");
        data.getJSONObject("entries").put(SnapshotRules.LOGS, logs.toString());
        assertTrue(SnapshotRules.complete(data, "s", 1500000, false));
        assertEquals("none", SnapshotRules.findTask(data, "2026-10-02", "t").getString("priority"));
        SnapshotRules.validate(data);
    }
    @Test(expected = JSONException.class) public void rejectsUnprioritizedHabitTask() throws Exception {
        JSONObject data = fixture();
        JSONObject logs = new JSONObject(data.getJSONObject("entries").getString(SnapshotRules.LOGS));
        logs.getJSONObject("2026-10-02").getJSONArray("tasks").getJSONObject(0).put("priority", "none");
        data.getJSONObject("entries").put(SnapshotRules.LOGS, logs.toString());
        SnapshotRules.validate(data);
    }
}
