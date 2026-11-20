/**
 * esp32Api.ts
 * ---------------------------------------------------------------
 * Smart Router: Connects locally when on the same network,
 * connects via Render when accessed remotely.
 */

import { DeviceData } from '../types';

const REQUEST_TIMEOUT_MS = 2000;
const API_URL = import.meta.env.VITE_API_URL || 'https://scada-system-backend.onrender.com';

// ---------------------------------------------------------
// 1. TYPES & INTERFACES
// ---------------------------------------------------------

export interface Esp32TelemetryResponse {
  ip: string;
  mac?: string;
  hostname?: string;
  firmwareVersion?: string;
  tempReal: number | null;
  humidityReal: number | null;
  hotValvePercent: 0 | 25 | 50 | 75 | 100;
  coldValvePercent: 0 | 25 | 50 | 75 | 100;
  hotValveAngle: number;
  coldValveAngle: number;
  autoAdjustEnabled: boolean;
  targetTempSetpoint?: number;
  targetHumSetpoint?: number;
  ahuPowerOn: boolean;
  dhu1On: boolean;
  dhu2On: boolean;
}

export class Esp32CommunicationError extends Error {
  constructor(message: string, public deviceIp: string) {
    super(message);
    this.name = 'Esp32CommunicationError';
  }
}

// ---------------------------------------------------------
// 2. HELPERS
// ---------------------------------------------------------

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timeoutId) };
}

function isValidIp(ip: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip?.trim() || '');
}

function normalizeHostname(hostname: string): string {
  const trimmed = hostname.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return trimmed.endsWith('.local') ? trimmed : `${trimmed}.local`;
}

export function resolveDeviceTarget(device: { ipAddress: string; hostname?: string }): string {
  if (device.hostname && device.hostname.trim()) {
    return normalizeHostname(device.hostname);
  }
  return device.ipAddress;
}

// ---------------------------------------------------------
// 3. LOCAL FETCH (Direct to ESP32)
// ---------------------------------------------------------

async function fetchLocalTelemetry(target: string): Promise<Esp32TelemetryResponse> {
  const { signal, cancel } = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`http://${target}/api/telemetry`, {
      method: 'GET', signal, mode: 'cors', cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json() as Esp32TelemetryResponse;
  } finally {
    cancel();
  }
}

// ---------------------------------------------------------
// 4. CLOUD FETCH (Via Render)
// ---------------------------------------------------------

async function fetchCloudTelemetry(deviceId: string): Promise<Esp32TelemetryResponse | null> {
  const { signal, cancel } = withTimeout(5000); 
  try {
    const res = await fetch(`${API_URL}/api/device-sync/telemetry?deviceId=${encodeURIComponent(deviceId)}`, {
      method: 'GET', signal,
    });
    if (!res.ok) return null;
    
    const data = await res.json();
    if (!data || !data.receivedAt) return null;
    
    // Check if data is fresh (within 15 seconds)
    const isRecent = (Date.now() - new Date(data.receivedAt).getTime()) < 15000;
    if (!isRecent) return null; 

    return {
      ip: 'Cloud',
      tempReal: data.temp,
      humidityReal: data.humidity,
      ahuPowerOn: data.ahu,
      dhu1On: data.dhu1,
      dhu2On: data.dhu2,
      hotValvePercent: data.hotPercent ?? 0,
      coldValvePercent: data.coldPercent ?? 0,
      hotValveAngle: ((data.hotPercent ?? 0) / 100) * 180,
      coldValveAngle: ((data.coldPercent ?? 0) / 100) * 180,
      autoAdjustEnabled: data.autoAdjust ?? false,
    };
  } catch {
    return null;
  } finally {
    cancel();
  }
}

// ---------------------------------------------------------
// 5. SMART MAIN FUNCTIONS
// ---------------------------------------------------------

export async function fetchDeviceTelemetry(ipAddress: string, device?: DeviceData): Promise<Esp32TelemetryResponse> {
  if (!device) throw new Esp32CommunicationError('No device config', ipAddress);
  const target = resolveDeviceTarget(device);
  
  const isLocalEnv = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  // If on localhost, try local IP first
  if (isLocalEnv && isValidIp(target)) {
    try {
      return await fetchLocalTelemetry(target);
    } catch (e) {
      // Fallthrough to cloud
    }
  }

  // Otherwise, or if local fails, go to Cloud
  const cloudData = await fetchCloudTelemetry(device.id);
  if (cloudData) return cloudData;
  
  throw new Esp32CommunicationError('Unreachable via Local and Render', target);
}

export async function sendServoCommand(
  target: string, type: 'hot' | 'cold', percent: 0 | 25 | 50 | 75 | 100, deviceId?: string
): Promise<void> {
  const isLocalEnv = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if (isLocalEnv && isValidIp(target)) {
    try {
      const { signal, cancel } = withTimeout(REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(`http://${target}/api/servo`, {
          method: 'POST', signal, mode: 'cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, percent }),
        });
        if (res.ok) return; 
      } finally { cancel(); }
    } catch { /* fallback */ }
  }

  if (deviceId) {
    const commandKey = type === 'hot' ? 'hotPercent' : 'coldPercent';
    await fetch(`${API_URL}/api/device-sync/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, [commandKey]: percent, autoAdjust: false }),
    });
    return;
  }
  throw new Error('Failed to send command');
}

export async function sendRelayCommand(
  target: string, relay: 'AHU' | 'DHU1' | 'DHU2', on: boolean, deviceId?: string
): Promise<void> {
  const isLocalEnv = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if (isLocalEnv && isValidIp(target)) {
    try {
      const { signal, cancel } = withTimeout(REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(`http://${target}/api/relay`, {
          method: 'POST', signal, mode: 'cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ relay, on }),
        });
        if (res.ok) return;
      } finally { cancel(); }
    } catch { /* fallback */ }
  }

  if (deviceId) {
    const relayKey = relay.toLowerCase();
    await fetch(`${API_URL}/api/device-sync/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, [relayKey]: on }),
    });
    return;
  }
  throw new Error('Failed to send command');
}

export async function sendAutoAdjustMode(target: string, enabled: boolean, deviceId?: string): Promise<void> {
  const isLocalEnv = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if (isLocalEnv && isValidIp(target)) {
    try {
      const { signal, cancel } = withTimeout(REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch(`http://${target}/api/mode`, {
          method: 'POST', signal, mode: 'cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ autoAdjust: enabled }),
        });
        if (res.ok) return;
      } finally { cancel(); }
    } catch { /* fallback */ }
  }

  if (deviceId) {
    await fetch(`${API_URL}/api/device-sync/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, autoAdjust: enabled }),
    });
  }
}

export async function sendSetpoints(target: string, targetTemp?: number, targetHum?: number): Promise<void> {
  if (!isValidIp(target)) return;
  const { signal, cancel } = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    await fetch(`http://${target}/api/setpoint`, {
      method: 'POST', signal, mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetTemp, targetHum }),
    });
  } finally { cancel(); }
}

export async function pingDevice(target: string): Promise<{ ok: boolean; latencyMs: number }> {
  const start = performance.now();
  try {
    const { signal, cancel } = withTimeout(1500);
    try {
      const res = await fetch(`http://${target}/api/telemetry`, { method: 'HEAD', signal });
      return { ok: res.ok, latencyMs: Math.round(performance.now() - start) };
    } finally { cancel(); }
  } catch {
    return { ok: false, latencyMs: 0 };
  }
}

// ---------------------------------------------------------
// 6. POLLING & SCANNING
// ---------------------------------------------------------

export async function pollAllDevices(devices: DeviceData[]): Promise<DeviceData[]> {
  const results = await Promise.allSettled(
    devices.map((d) => fetchDeviceTelemetry(d.ipAddress, d))
  );

  return devices.map((dev, idx) => {
    const result = results[idx];
    if (result.status === 'rejected') {
      return { ...dev, isOnline: false, tempReal: null, humidityReal: null }; 
    }

    const t = result.value;
    return {
      ...dev,
      isOnline: true,
      tempReal: t.tempReal,
      humidityReal: t.humidityReal,
      ahuPowerOn: t.ahuPowerOn,
      dhu1On: t.dhu1On,
      dhu2On: t.dhu2On,
      hotValvePercent: t.hotValvePercent,
      coldValvePercent: t.coldValvePercent,
      hotValveAngle: t.hotValveAngle,
      coldValveAngle: t.coldValveAngle,
      autoAdjustEnabled: t.autoAdjustEnabled,
      lastUpdated: new Date().toLocaleTimeString(),
    } as DeviceData;
  });
}

export interface ScannedDevice {
  ip: string;
  telemetry: Esp32TelemetryResponse;
}

export async function scanSubnetForDevices(subnetPrefix: string, rangeSize = 254): Promise<ScannedDevice[]> {
  const prefix = subnetPrefix.trim().replace(/\.$/, '');
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(prefix)) {
    throw new Error('Subnet prefix must look like "192.168.1"');
  }

  const found: ScannedDevice[] = [];
  const totalHosts = Math.max(1, Math.min(rangeSize, 4096));

  for (let batchStart = 1; batchStart <= totalHosts; batchStart += 50) {
    const batchEnd = Math.min(batchStart + 49, totalHosts);
    const offsets = Array.from({ length: batchEnd - batchStart + 1 }, (_, i) => batchStart + i);

    const results = await Promise.allSettled(
      offsets.map(async (offset) => {
        const ip = `${prefix}.${offset}`;
        const { signal, cancel } = withTimeout(500);
        try {
          const res = await fetch(`http://${ip}/api/telemetry`, { method: 'GET', signal, mode: 'cors', cache: 'no-store' });
          if (!res.ok) throw new Error('not ok');
          const data = (await res.json()) as Esp32TelemetryResponse;
          return { ip, telemetry: data } as ScannedDevice;
        } finally {
          cancel();
        }
      })
    );

    results.forEach((r) => {
      if (r.status === 'fulfilled') found.push(r.value);
    });
  }

  return found;
}