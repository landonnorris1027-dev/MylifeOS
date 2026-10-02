package com.mylifeos.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import java.util.UUID;

/** One native alarm owns each completion, even if the WebView or process dies. */
public class CompletionReminderReceiver extends BroadcastReceiver {
    private static final String PREFS = "mylifeos_reminder_claims";
    private static final Object LOCK = new Object();

    private static SharedPreferences claims(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static PendingIntent alarmIntent(Context context, int id, Intent intent) {
        return PendingIntent.getBroadcast(context, id, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void schedule(Context context, int id, long at, String title, String body,
                         boolean vibration, boolean sound, boolean notifications) {
        schedule(context, id, at, title, body, vibration, sound, notifications, null);
    }

    static void schedule(Context context, int id, long at, String title, String body,
                         boolean vibration, boolean sound, boolean notifications, String timerId) {
        synchronized (LOCK) {
            String token = UUID.randomUUID().toString();
            Intent intent = new Intent(context, CompletionReminderReceiver.class)
                .putExtra("id", id).putExtra("at", at).putExtra("token", token).putExtra("title", title).putExtra("body", body)
                .putExtra("vibration", vibration).putExtra("sound", sound).putExtra("notifications", notifications)
                .putExtra("timerId", timerId);
            AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarms == null) throw new IllegalStateException("No alarm service");
            PendingIntent pending = alarmIntent(context, id, intent);
            try {
                if (!claims(context).edit().putString(String.valueOf(id), token)
                    .putString(id + ":payload", intent.toUri(0)).commit()) {
                    throw new IllegalStateException("Cannot persist reminder");
                }
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()) {
                    alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
                } else {
                    alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
                }
            } catch (RuntimeException error) {
                cancel(context, id);
                throw error;
            }
        }
    }

    static void cancel(Context context, int id) {
        synchronized (LOCK) {
            claims(context).edit().remove(String.valueOf(id)).remove(id + ":payload").commit();
            AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            PendingIntent pending = alarmIntent(context, id, new Intent(context, CompletionReminderReceiver.class));
            if (alarms != null) alarms.cancel(pending);
            pending.cancel();
        }
    }

    static void completeForeground(Context context, int id) {
        synchronized (LOCK) {
            String payload = claims(context).getString(id + ":payload", null);
            if (payload == null) return;
            try {
                new CompletionReminderReceiver().onReceive(context, Intent.parseUri(payload, 0));
            } catch (java.net.URISyntaxException error) {
                Log.w("MyLifeOS", "Invalid reminder payload", error);
            }
        }
    }

    static boolean matches(Context context, org.json.JSONObject session) throws org.json.JSONException {
        synchronized (LOCK) {
            String payload = claims(context).getString(session.getInt("notificationId") + ":payload", null);
            if (payload == null) return false;
            try {
                Intent saved = Intent.parseUri(payload, 0);
                return session.getString("timerId").equals(saved.getStringExtra("timerId"))
                    && session.getLong("endTime") == saved.getLongExtra("at", -1);
            } catch (java.net.URISyntaxException error) { return false; }
        }
    }

    static void cancelAll(Context context) {
        for (String key : claims(context).getAll().keySet()) {
            if (!key.endsWith(":payload")) continue;
            try { cancel(context, Integer.parseInt(key.replace(":payload", ""))); }
            catch (NumberFormatException ignored) { /* unrelated preference */ }
        }
        if (!claims(context).edit().clear().commit()) throw new IllegalStateException("Cannot persist reminder cancellation");
    }

    static void completeManual(Context context, org.json.JSONObject session) throws org.json.JSONException {
        synchronized (LOCK) {
            String timerId = session.getString("timerId");
            if (claims(context).getBoolean("delivered:" + timerId, false)) return;
            int id = session.getInt("notificationId"); String token = UUID.randomUUID().toString();
            org.json.JSONObject messages = session.optJSONObject("notificationMessages");
            if (messages == null) messages = new org.json.JSONObject();
            Intent intent = new Intent(context, CompletionReminderReceiver.class).putExtra("id", id).putExtra("token", token)
                .putExtra("timerId", timerId).putExtra("title", messages.optString("focusCompleteTitle", "Focus complete"))
                .putExtra("body", messages.optString("focusCompleteBody", ""))
                .putExtra("sound", session.optBoolean("soundEnabled", true)).putExtra("vibration", session.optBoolean("vibrationEnabled", true))
                .putExtra("notifications", session.optBoolean("notificationsEnabled", true));
            if (!claims(context).edit().putString(String.valueOf(id), token).putString(id + ":payload", intent.toUri(0)).commit()) {
                throw new IllegalStateException("Cannot persist completion reminder");
            }
            new CompletionReminderReceiver().onReceive(context, intent);
        }
    }

    private static void restoreAlarms(Context context) {
        synchronized (LOCK) {
            for (String key : claims(context).getAll().keySet()) {
                if (!key.endsWith(":payload")) continue;
                try {
                    Intent saved = Intent.parseUri(claims(context).getString(key, ""), 0);
                    schedule(context, saved.getIntExtra("id", 0), saved.getLongExtra("at", System.currentTimeMillis()),
                        saved.getStringExtra("title"), saved.getStringExtra("body"),
                        saved.getBooleanExtra("vibration", true), saved.getBooleanExtra("sound", true),
                        saved.getBooleanExtra("notifications", true), saved.getStringExtra("timerId"));
                } catch (Exception error) {
                    Log.w("MyLifeOS", "Cannot restore reminder", error);
                }
            }
        }
    }

    static String ensureChannel(NotificationManager manager, boolean vibration, boolean sound) {
        String id = "mylifeos-focus-v3-" + (sound ? "sound-" : "silent-") + (vibration ? "vibrate" : "no-vibrate");
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || manager.getNotificationChannel(id) != null) return id;
        NotificationChannel old = manager.getNotificationChannel("mylifeos-focus-v2-" + (vibration ? "vibrate" : "sound"));
        if (old == null) old = manager.getNotificationChannel("mylifeos-focus");
        NotificationChannel channel = new NotificationChannel(id,
            "Focus timer (" + (sound ? "sound" : "silent") + (vibration ? ", vibration)" : ")"),
            old == null ? NotificationManager.IMPORTANCE_HIGH : old.getImportance());
        channel.setDescription("Focus and break completion alerts");
        channel.enableVibration(vibration && (old == null || old.shouldVibrate()));
        if (old != null) {
            channel.setSound(old.getSound(), old.getAudioAttributes());
            channel.setLockscreenVisibility(old.getLockscreenVisibility());
            channel.enableLights(old.shouldShowLights());
            channel.setLightColor(old.getLightColor());
        }
        if (!sound) channel.setSound(null, null);
        manager.createNotificationChannel(channel);
        return id;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction()) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) {
            restoreAlarms(context);
            try {
                // A process may die after committing a session and before scheduling its alarm.
                NativeStoragePlugin.ensureReminders(context, new NativeSnapshotStore(context).get().getJSONArray("sessions"), true);
            } catch (Exception error) { Log.w("MyLifeOS", "Cannot restore persisted sessions", error); }
            return;
        }
        synchronized (LOCK) {
            int id = intent.getIntExtra("id", 0);
            String token = intent.getStringExtra("token");
            if (token == null || !token.equals(claims(context).getString(String.valueOf(id), null))) return;
            String timerId = intent.getStringExtra("timerId");
            if (timerId != null) {
                try {
                    if (!new NativeSnapshotStore(context).completeAlarm(timerId, System.currentTimeMillis())) return;
                } catch (Exception error) {
                    // Keep the durable active session and claim. Reopening also
                    // reconciles this deadline; no completion is acknowledged yet.
                    Log.w("MyLifeOS", "Completion persistence failed", error);
                    schedule(context, id, System.currentTimeMillis() + 60000,
                        intent.getStringExtra("title"), intent.getStringExtra("body"),
                        intent.getBooleanExtra("vibration", true), intent.getBooleanExtra("sound", true),
                        intent.getBooleanExtra("notifications", true), timerId);
                    return;
                }
            }
            // Claim once before any effects; cancelled/replaced/duplicate broadcasts stay silent.
            boolean alreadyDelivered = timerId != null && claims(context).getBoolean("delivered:" + timerId, false);
            SharedPreferences.Editor claim = claims(context).edit().remove(String.valueOf(id)).remove(id + ":payload");
            if (timerId != null) claim.putBoolean("delivered:" + timerId, true);
            if (!claim.commit()) return;
            cancel(context, id);
            if (alreadyDelivered) return;
            try {
                if (NativeReminderPlugin.appActive && NativeReminderPlugin.timerVisible) {
                    ringForeground(context, intent.getBooleanExtra("sound", true), intent.getBooleanExtra("vibration", true));
                } else if (intent.getBooleanExtra("notifications", true)) {
                    notifyBackground(context, id, intent);
                }
            } catch (RuntimeException error) {
                Log.w("MyLifeOS", "Completion alert unavailable", error);
            }
        }
    }

    private static void ringForeground(Context context, boolean sound, boolean vibration) {
        if (sound && NativeReminderPlugin.alertsAllowed(context)) {
            Ringtone ringtone = RingtoneManager.getRingtone(context, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION));
            if (ringtone != null) {
                ringtone.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build());
                ringtone.play(); new Handler(Looper.getMainLooper()).postDelayed(ringtone::stop, 1000);
            }
        }
        if (vibration) NativeReminderPlugin.vibrateNow(context);
    }

    @SuppressWarnings("deprecation")
    private static void notifyBackground(Context context, int id, Intent intent) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || !manager.areNotificationsEnabled()) return;
        boolean vibration = intent.getBooleanExtra("vibration", true);
        boolean sound = intent.getBooleanExtra("sound", true);
        PendingIntent open = PendingIntent.getActivity(context, id, new Intent(context, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(context, ensureChannel(manager, vibration, sound));
        } else {
            int defaults = Notification.DEFAULT_LIGHTS;
            if (sound) defaults |= Notification.DEFAULT_SOUND;
            if (vibration) defaults |= Notification.DEFAULT_VIBRATE;
            builder = new Notification.Builder(context).setDefaults(defaults);
        }
        manager.notify(id, builder.setSmallIcon(R.drawable.ic_mylifeos_foreground)
            .setContentTitle(intent.getStringExtra("title")).setContentText(intent.getStringExtra("body"))
            .setContentIntent(open).setAutoCancel(true).setOnlyAlertOnce(true).build());
    }
}
