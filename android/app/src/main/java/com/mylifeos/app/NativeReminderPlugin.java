package com.mylifeos.app;

import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeReminder")
public class NativeReminderPlugin extends Plugin {
    static volatile boolean appActive;
    static volatile boolean timerVisible;

    @Override
    protected void handleOnResume() { appActive = true; }

    @Override
    protected void handleOnPause() { appActive = false; }

    @PluginMethod
    public void setTimerVisible(PluginCall call) {
        timerVisible = call.getBoolean("visible", false);
        appActive = getActivity().hasWindowFocus();
        call.resolve();
    }

    @PluginMethod
    public void schedule(PluginCall call) {
        Integer id = call.getInt("id");
        Long at = call.getLong("at");
        if (id == null || at == null) {
            call.reject("Missing reminder id or deadline");
            return;
        }
        try {
            CompletionReminderReceiver.schedule(getContext(), id, at, call.getString("title", ""),
                call.getString("body", ""), call.getBoolean("vibrationEnabled", true),
                call.getBoolean("soundEnabled", true), call.getBoolean("notificationsEnabled", true));
            call.resolve();
        } catch (RuntimeException error) {
            call.reject("Reminder scheduling unavailable", error);
        }
    }

    @PluginMethod
    public void completeForeground(PluginCall call) {
        Integer id = call.getInt("id");
        if (id != null && appActive && timerVisible) {
            CompletionReminderReceiver.completeForeground(getContext(), id);
        }
        call.resolve();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        Integer id = call.getInt("id");
        if (id != null) {
            CompletionReminderReceiver.cancel(getContext(), id);
        }
        call.resolve();
    }

    static boolean alertsAllowed(Context context) {
        AudioManager audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        NotificationManager notifications = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        return audio != null && audio.getRingerMode() == AudioManager.RINGER_MODE_NORMAL
            && notifications != null
            && notifications.getCurrentInterruptionFilter() == NotificationManager.INTERRUPTION_FILTER_ALL;
    }

    @PluginMethod
    public void canAlert(PluginCall call) {
        JSObject result = new JSObject();
        result.put("allowed", alertsAllowed(getContext()));
        call.resolve(result);
    }

    @SuppressWarnings("deprecation")
    @PluginMethod
    public void vibrate(PluginCall call) {
        try {
            vibrateNow(getContext());
            call.resolve();
        } catch (RuntimeException error) {
            call.reject("Vibration unavailable", error);
        }
    }

    @SuppressWarnings("deprecation")
    static void vibrateNow(Context context) {
            Vibrator vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            if (alertsAllowed(context) && vibrator != null && vibrator.hasVibrator()) {
                long[] pattern = { 0, 200, 150, 200 };
                AudioAttributes attributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1), attributes);
                } else {
                    vibrator.vibrate(pattern, -1, attributes);
                }
            }
    }
}
