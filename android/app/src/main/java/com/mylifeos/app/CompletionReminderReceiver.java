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
        synchronized (LOCK) {
            String token = UUID.randomUUID().toString();
            Intent intent = new Intent(context, CompletionReminderReceiver.class)
                .putExtra("id", id).putExtra("at", at).putExtra("token", token).putExtra("title", title).putExtra("body", body)
                .putExtra("vibration", vibration).putExtra("sound", sound).putExtra("notifications", notifications);
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

    private static void restoreAlarms(Context context) {
        synchronized (LOCK) {
            for (String key : claims(context).getAll().keySet()) {
                if (!key.endsWith(":payload")) continue;
                try {
                    Intent saved = Intent.parseUri(claims(context).getString(key, ""), 0);
                    schedule(context, saved.getIntExtra("id", 0), saved.getLongExtra("at", System.currentTimeMillis()),
                        saved.getStringExtra("title"), saved.getStringExtra("body"),
                        saved.getBooleanExtra("vibration", true), saved.getBooleanExtra("sound", true),
                        saved.getBooleanExtra("notifications", true));
                } catch (Exception error) {
                    Log.w("MyLifeOS", "Cannot restore reminder", error);
                }
            }
        }
    }

    static String ensureChannel(NotificationManager manager, boolean vibration) {
        String id = "mylifeos-focus-v2-" + (vibration ? "vibrate" : "sound");
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || manager.getNotificationChannel(id) != null) return id;
        NotificationChannel old = manager.getNotificationChannel("mylifeos-focus");
        NotificationChannel channel = new NotificationChannel(id,
            vibration ? "Focus timer (sound and vibration)" : "Focus timer (sound only)",
            old == null ? NotificationManager.IMPORTANCE_HIGH : old.getImportance());
        channel.setDescription("Focus and break completion alerts");
        channel.enableVibration(vibration && (old == null || old.shouldVibrate()));
        if (old != null) {
            channel.setSound(old.getSound(), old.getAudioAttributes());
            channel.setLockscreenVisibility(old.getLockscreenVisibility());
            channel.enableLights(old.shouldShowLights());
            channel.setLightColor(old.getLightColor());
        }
        manager.createNotificationChannel(channel);
        return id;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction()) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) {
            restoreAlarms(context);
            return;
        }
        synchronized (LOCK) {
            int id = intent.getIntExtra("id", 0);
            String token = intent.getStringExtra("token");
            if (token == null || !token.equals(claims(context).getString(String.valueOf(id), null))) return;
            // Claim once before any effects; cancelled/replaced/duplicate broadcasts stay silent.
            if (!claims(context).edit().remove(String.valueOf(id)).remove(id + ":payload").commit()) return;
            cancel(context, id);
            try {
                if (NativeReminderPlugin.appActive && NativeReminderPlugin.timerVisible) {
                    if (intent.getBooleanExtra("sound", true)) ringForeground(context, intent.getBooleanExtra("vibration", true));
                } else if (intent.getBooleanExtra("notifications", true)) {
                    notifyBackground(context, id, intent);
                }
            } catch (RuntimeException error) {
                Log.w("MyLifeOS", "Completion alert unavailable", error);
            }
        }
    }

    private static void ringForeground(Context context, boolean vibration) {
        if (!NativeReminderPlugin.alertsAllowed(context)) return;
        Ringtone ringtone = RingtoneManager.getRingtone(context, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION));
        if (ringtone == null) return;
        ringtone.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build());
        ringtone.play();
        new Handler(Looper.getMainLooper()).postDelayed(ringtone::stop, 1000);
        if (vibration) NativeReminderPlugin.vibrateNow(context);
    }

    @SuppressWarnings("deprecation")
    private static void notifyBackground(Context context, int id, Intent intent) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || !manager.areNotificationsEnabled()) return;
        boolean vibration = intent.getBooleanExtra("vibration", true);
        PendingIntent open = PendingIntent.getActivity(context, id, new Intent(context, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(context, ensureChannel(manager, vibration));
        } else {
            int defaults = Notification.DEFAULT_SOUND | Notification.DEFAULT_LIGHTS;
            if (vibration) defaults |= Notification.DEFAULT_VIBRATE;
            builder = new Notification.Builder(context).setDefaults(defaults);
        }
        manager.notify(id, builder.setSmallIcon(R.drawable.ic_mylifeos_foreground)
            .setContentTitle(intent.getStringExtra("title")).setContentText(intent.getStringExtra("body"))
            .setContentIntent(open).setAutoCancel(true).setOnlyAlertOnce(true).build());
    }
}
