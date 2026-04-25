/**
 * ============================================
 * Device ID Utility
 * ============================================
 * Generates a persistent unique device identifier
 * for pairing with the web dashboard.
 */

import { Platform } from 'react-native';
import * as Application from 'expo-application';

const DEVICE_ID_STORAGE_KEY = 'camguard_device_id';

/**
 * Get or generate a unique device ID
 */
export async function getDeviceId(): Promise<string> {
  try {
    // On Android, try to use the Android ID
    if (Platform.OS === 'android' && Application.androidId) {
      return `android-${Application.androidId}`;
    }

    // On iOS, use the vendor identifier
    if (Platform.OS === 'ios' && Application.getIosIdForVendorAsync) {
      const iosId = await Application.getIosIdForVendorAsync();
      if (iosId) return `ios-${iosId}`;
    }

    // Fallback: generate a random UUID-like ID
    return generateFallbackId();
  } catch {
    return generateFallbackId();
  }
}

function generateFallbackId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `gen-${result}`;
}

/**
 * Get a human-readable device name
 */
export function getDeviceName(): string {
  if (Platform.OS === 'android') {
    return `Android Device`;
  }
  return `iOS Device`;
}

/**
 * Generate a 6-digit pairing code for manual pairing
 */
export function generatePairingCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
