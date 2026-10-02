package com.mylifeos.app;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.json.JSONObject;
import org.json.JSONArray;
import static org.junit.Assert.*;

public class VerifyUpgradeTest {
    @Test public void verify() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("0.1.4", context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName);
        JSONObject data = new NativeSnapshotStore(context).load(new JSONObject(), new JSONArray());
        assertTrue(data.getJSONObject("entries").getString("mylifeos_goals").contains("upgrade-goal"));
        JSONObject logs = new JSONObject(data.getJSONObject("entries").getString(SnapshotRules.LOGS));
        JSONArray tasks = logs.getJSONObject("2026-10-01").getJSONArray("tasks");
        assertEquals(2, tasks.length()); assertEquals(17, tasks.getJSONObject(0).getInt("actualFocusMinutes"));
        assertEquals("deleted-rule", tasks.getJSONObject(0).getString("habitId"));
        assertEquals(1, data.getJSONArray("sessions").length());
        JSONObject session = data.getJSONArray("sessions").getJSONObject(0);
        assertEquals("upgrade-session", session.getString("timerId"));
        assertEquals("paused", session.getString("state")); assertEquals(900000, session.getLong("remaining"));
        assertTrue(context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE).getString("mylifeos_native_pomodoro_timers", "").contains("upgrade-session"));
    }
}
