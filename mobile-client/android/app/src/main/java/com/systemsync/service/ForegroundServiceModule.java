package com.systemsync.service;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.module.annotations.ReactModule;

import android.content.Intent;
import android.os.Build;
import android.app.ActivityManager;
import android.content.Context;

/**
 * ============================================
 * React Native Module - ForegroundServiceModule
 * ============================================
 * 
 * Exposes the native ForegroundService to React Native
 * via the bridge, allowing the JS code to start, stop,
 * and update the foreground service.
 */
@ReactModule(name = "ForegroundServiceModule")
public class ForegroundServiceModule extends ReactContextBaseJavaModule {

    private static final String MODULE_NAME = "ForegroundServiceModule";

    public ForegroundServiceModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    /**
     * Start the foreground service
     */
    @ReactMethod
    public void startService(String title, String text, String channelId, 
                             String channelName, boolean ongoing, String importance, Promise promise) {
        try {
            ReactApplicationContext context = getReactApplicationContext();
            Intent serviceIntent = new Intent(context, ForegroundService.class);
            serviceIntent.setAction(ForegroundService.ACTION_START);
            serviceIntent.putExtra(ForegroundService.EXTRA_TITLE, title);
            serviceIntent.putExtra(ForegroundService.EXTRA_TEXT, text);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }

            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("SERVICE_ERROR", "Failed to start foreground service: " + e.getMessage());
        }
    }

    /**
     * Stop the foreground service
     */
    @ReactMethod
    public void stopService(Promise promise) {
        try {
            ReactApplicationContext context = getReactApplicationContext();
            Intent serviceIntent = new Intent(context, ForegroundService.class);
            serviceIntent.setAction(ForegroundService.ACTION_STOP);
            context.startService(serviceIntent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("SERVICE_ERROR", "Failed to stop foreground service: " + e.getMessage());
        }
    }

    /**
     * Update the notification text
     */
    @ReactMethod
    public void updateNotification(String title, String text, Promise promise) {
        try {
            ReactApplicationContext context = getReactApplicationContext();
            Intent serviceIntent = new Intent(context, ForegroundService.class);
            serviceIntent.setAction(ForegroundService.ACTION_UPDATE);
            serviceIntent.putExtra(ForegroundService.EXTRA_TITLE, title);
            serviceIntent.putExtra(ForegroundService.EXTRA_TEXT, text);
            context.startService(serviceIntent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("SERVICE_ERROR", "Failed to update notification: " + e.getMessage());
        }
    }

    /**
     * Check if the foreground service is running
     */
    @ReactMethod
    public void isRunning(Promise promise) {
        try {
            ReactApplicationContext context = getReactApplicationContext();
            ActivityManager manager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
            
            if (manager != null) {
                for (ActivityManager.RunningServiceInfo service : manager.getRunningServices(Integer.MAX_VALUE)) {
                    if (ForegroundService.class.getName().equals(service.service.getClassName())) {
                        promise.resolve(true);
                        return;
                    }
                }
            }
            promise.resolve(false);
        } catch (Exception e) {
            promise.reject("SERVICE_ERROR", "Failed to check service status: " + e.getMessage());
        }
    }
}
