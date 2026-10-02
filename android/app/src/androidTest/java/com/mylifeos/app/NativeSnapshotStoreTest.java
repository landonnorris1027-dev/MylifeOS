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
}
