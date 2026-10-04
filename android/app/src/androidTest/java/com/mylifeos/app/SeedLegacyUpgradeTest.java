package com.mylifeos.app;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.json.JSONObject;
import org.json.JSONArray;
import static org.junit.Assert.*;

/** Run only on the fresh mylifeos-verify emulator, against the archived 0.1.2 APK. */
public class SeedLegacyUpgradeTest {
    @Test public void seed() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("0.1.2", context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName);
        JSONObject history = new JSONObject().put("id", "upgrade-history").put("habitId", "deleted-rule")
            .put("origin", "habit").put("name", "Upgrade history").put("date", "2026-10-01")
            .put("status", "completed").put("priority", "P1").put("durationMinutes", 25).put("actualFocusMinutes", 17);
        JSONObject active = new JSONObject().put("id", "upgrade-active").put("origin", "manual").put("name", "Upgrade paused focus")
            .put("date", "2026-10-01").put("status", "scheduled").put("priority", "P2").put("durationMinutes", 25).put("startTime", "12:00");
        JSONObject logs = new JSONObject().put("2026-10-01", new JSONObject().put("date", "2026-10-01")
            .put("tasks", new JSONArray().put(history).put(active)));
        JSONObject timer = new JSONObject().put("timerId", "upgrade-session").put("duration", 1500)
            .put("remaining", 900000).put("endTime", System.currentTimeMillis() + 900000).put("isActive", false)
            .put("isFocusMode", true).put("notificationId", 6001).put("taskId", "upgrade-active")
            .put("taskName", "Upgrade paused focus").put("taskDate", "2026-10-01").put("taskPriority", "P2")
            .put("taskDurationMinutes", 25).put("soundEnabled", false).put("notificationsEnabled", false);
        assertTrue(context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE).edit()
            .putString("mylifeos_goals", "[{\"id\":\"upgrade-goal\",\"name\":\"Upgrade goal\"}]")
            .putString("mylifeos_habits", "[]").putString("mylifeos_daily_logs", logs.toString()).putString("mylifeos_lang", "zh")
            .putString("mylifeos_focus_settings", "{\"soundEnabled\":false,\"notificationsEnabled\":false,\"breakDurationMinutes\":5}")
            .putString("mylifeos_native_pomodoro_timers", new JSONArray().put(timer).toString()).commit());
    }
}
