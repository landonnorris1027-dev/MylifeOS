package com.mylifeos.app;

import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Before;
import org.junit.Test;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

/** Uses isolated files/preferences; never the personal app's persistent data. */
public class NativeSnapshotStoreTest {
    private File directory;
    private Context context;
    private NativeSnapshotStore store;
    @Before public void setup() throws Exception {
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String suffix = "mylifeos-test-" + java.util.UUID.randomUUID();
        directory = new File(target.getCacheDir(), suffix);
        context = new ContextWrapper(target) {
            @Override public Context getApplicationContext() { return this; }
            @Override public SharedPreferences getSharedPreferences(String name, int mode) {
                return super.getSharedPreferences(suffix + name, mode);
            }
        };
        store = new NativeSnapshotStore(context, directory);
        store.load(new JSONObject().put("mylifeos_goals", "[]").put("mylifeos_habits", "[]"), new JSONArray());
    }
    @Test public void failedPrimaryWritePreservesAllOldEntriesAndAllowsRetry() throws Exception {
        NativeSnapshotStore failing = new NativeSnapshotStore(context, directory, file -> {
            if (file.getName().equals("app-data.json")) throw new IOException("injected disk failure");
        });
        JSONObject entries = new JSONObject().put("mylifeos_goals", "[{\"id\":\"new\",\"name\":\"New\"}]").put("mylifeos_habits", "[]");
        try { failing.write(entries, 0, true, false); fail("Must reject failed replacement"); }
        catch (IOException expected) { assertEquals("[]", store.get().getJSONObject("entries").getString("mylifeos_goals")); }
        assertEquals(1, store.write(entries, 0, true, false).getLong("revision"));
    }
    @Test public void corruptedPrimaryFallsBackToIndependentPreviousSnapshot() throws Exception {
        store.write(new JSONObject().put("mylifeos_lang", "en"), 0, false, false);
        try (FileOutputStream output = new FileOutputStream(new File(directory, "app-data.json"))) {
            output.write("corrupt".getBytes(StandardCharsets.UTF_8)); output.getFD().sync();
        }
        assertEquals(0, store.get().getLong("revision"));
        assertEquals("[]", store.get().getJSONObject("entries").getString("mylifeos_goals"));
    }
    @Test public void interruptedAtomicReplacementKeepsCommittedSnapshot() throws Exception {
        try (FileOutputStream output = new FileOutputStream(new File(directory, "app-data.json.new"))) {
            output.write("incomplete".getBytes(StandardCharsets.UTF_8)); output.getFD().sync();
        }
        assertEquals(0, store.get().getLong("revision"));
    }
    @Test public void staleRevisionCannotReplaceBusinessData() throws Exception {
        store.write(new JSONObject().put("mylifeos_lang", "en"), 0, false, false);
        try { store.write(new JSONObject().put("mylifeos_lang", "zh"), 0, false, false); fail("CAS must reject stale page"); }
        catch (org.json.JSONException expected) { assertEquals("en", store.get().getJSONObject("entries").getString("mylifeos_lang")); }
    }
    @Test public void unreadableRecoveryRequiresExplicitSessionStopAndPreservesOriginal() throws Exception {
        try (FileOutputStream output = new FileOutputStream(new File(directory, "app-data.json"))) {
            output.write("damaged-original".getBytes(StandardCharsets.UTF_8)); output.getFD().sync();
        }
        try { store.write(new JSONObject().put("mylifeos_goals", "[]"), 0, true, true); fail("Cannot treat unreadable sessions as absent"); }
        catch (IOException expected) { assertTrue(expected.getMessage().contains("Stop unreadable sessions")); }
        assertTrue(store.stopForRecovery().getBoolean("recoveryStopped"));
        store.write(new JSONObject().put("mylifeos_goals", "[]"), 0, true, true);
        File[] archives = directory.listFiles((folder, name) -> name.startsWith("app-data.json.corrupt-"));
        assertNotNull(archives); assertEquals(1, archives.length);
        assertEquals("damaged-original".length(), archives[0].length());
    }

    private static JSONObject taskEntries() throws Exception {
        JSONObject task = new JSONObject().put("id", "t").put("name", "Focus").put("date", "2026-10-02")
            .put("status", "scheduled").put("priority", "P1").put("durationMinutes", 25).put("habitId", "deleted-rule");
        JSONObject day = new JSONObject().put("date", "2026-10-02").put("tasks", new JSONArray().put(task));
        return new JSONObject().put(SnapshotRules.LOGS, new JSONObject().put("2026-10-02", day).toString());
    }
    private static JSONObject timerData() throws Exception {
        return new JSONObject().put("timerId", "s").put("duration", 1500).put("isFocusMode", true)
            .put("taskId", "t").put("taskName", "Focus").put("taskDate", "2026-10-02").put("taskDurationMinutes", 25);
    }
    @Test public void repeatedStartPauseResumeAreIdempotentAndUnfinishedSessionsBlockReplace() throws Exception {
        store.write(taskEntries(), 0, false, false);
        store.timer("start", "s", timerData(), 1000);
        store.timer("start", "s", timerData(), 2000);
        assertEquals(1501000, store.get().getJSONArray("sessions").getJSONObject(0).getLong("endTime"));
        store.timer("pause", "s", null, 61000); store.timer("pause", "s", null, 121000);
        assertEquals(1440000, store.get().getJSONArray("sessions").getJSONObject(0).getLong("remaining"));
        store.timer("resume", "s", null, 121000); store.timer("resume", "s", null, 181000);
        assertEquals(1561000, store.get().getJSONArray("sessions").getJSONObject(0).getLong("endTime"));
        try { store.write(new JSONObject(), store.get().getLong("revision"), true, false); fail("Unfinished session must block import"); }
        catch (org.json.JSONException expected) { assertEquals(1, store.get().getJSONArray("sessions").length()); }
    }
    @Test public void receiverAndRepeatedReconciliationSaveOneCompletion() throws Exception {
        store.write(taskEntries(), 0, false, false); store.timer("start", "s", timerData(), 1000);
        assertTrue(store.completeAlarm("s", 9999999));
        long completedRevision = store.get().getLong("revision");
        assertTrue(store.completeAlarm("s", 10000000)); store.reconcile(10000001);
        assertEquals(completedRevision, store.get().getLong("revision"));
        JSONObject logs = new JSONObject(store.get().getJSONObject("entries").getString(SnapshotRules.LOGS));
        assertEquals(25, logs.getJSONObject("2026-10-02").getJSONArray("tasks").getJSONObject(0).getInt("actualFocusMinutes"));
    }
    @Test public void dirtyLegacyPreferenceMigrationKeepsRollbackSources() throws Exception {
        SharedPreferences legacy = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        legacy.edit().putString("mylifeos_goals", "[{\"id\":\"old\",\"name\":\"Old\"}]").commit();
        NativeSnapshotStore migrating = new NativeSnapshotStore(context, new File(directory, "migration"));
        JSONObject loaded = migrating.load(new JSONObject().put("mylifeos_goals", "[{\"id\":\"new\",\"name\":\"New\"}]"), new JSONArray().put("mylifeos_goals"));
        assertTrue(loaded.getJSONObject("entries").getString("mylifeos_goals").contains("new"));
        assertTrue(legacy.getString("mylifeos_goals", "").contains("old"));
    }
}
