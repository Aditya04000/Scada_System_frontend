import { DeviceData } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'https://scada-system-backend.onrender.com';

// ---------------------------------------------------------
// TYPES
// ---------------------------------------------------------
export interface Esp32TelemetryResponse {
  ip: string;
  tempReal: number | null;
  humidityReal: number | null;
  hotValvePercent: 0 | 25 | 50 | 75 | 100;
  coldValvePercent: 0 | 25 | 50 | 75 | 100;
  hotValveAngle: number;
  coldValveAngle: number;
  autoAdjustEnabled: boolean;
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
// FETCH DATA FROM RENDER
// ---------------------------------------------------------
export async function fetchDeviceTelemetry(ipAddress: string, device?: DeviceData): Promise<Esp32TelemetryResponse> {
  if (!device?.id) throw new Esp32CommunicationError('No device ID provided', ipAddress);

  // Query Render directly
  const res = await fetch(`${API_URL}/api/device-sync/telemetry?deviceId=${encodeURIComponent(device.id)}`);
  
  if (!res.ok) throw new Esp32CommunicationError('HTTP Error', ipAddress);
  
  const data = await res.json();
  
  // If Render has no data (empty object), the ESP32 is offline
  if (!data || !data.receivedAt) {
    throw new Esp32CommunicationError('Device offline in cloud', ipAddress);
  }

  // Convert Render format to Local format for the UI
  return {
    ip: 'Cloud',
    tempReal: data.temp ?? null,
    humidityReal: data.humidity ?? null,
    ahuPowerOn: data.ahu ?? false,
    dhu1On: data.dhu1 ?? false,
    dhu2On: data.dhu2 ?? false,
    hotValvePercent: data.hotPercent ?? 0,
    coldValvePercent: data.coldPercent ?? 0,
    hotValveAngle: ((data.hotPercent ?? 0) / 100) * 180,
    coldValveAngle: ((data.coldPercent ?? 0) / 100) * 180,
    autoAdjustEnabled: data.autoAdjust ?? false,
  };
}

export async function pollAllDevices(devices: DeviceData[]): Promise<DeviceData[]> {
  const results = await Promise.allSettled(
    devices.map((d) => fetchDeviceTelemetry(d.ipAddress, d))
  );

  return devices.map((dev, idx) => {
    const result = results[idx];
    if (result.status === 'rejected') {
      // Return offline if Render returns no data
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

// ---------------------------------------------------------
// SEND COMMANDS TO RENDER
// ---------------------------------------------------------
export async function sendServoCommand(ipAddress: string, type: 'hot' | 'cold', percent: number, deviceId?: string): Promise<void> {
  if (!deviceId) return;
  const commandKey = type === 'hot' ? 'hotPercent' : 'coldPercent';
  await fetch(`${API_URL}/api/device-sync/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, [commandKey]: percent, autoAdjust: false }),
  });
}

export async function sendRelayCommand(ipAddress: string, relay: 'AHU' | 'DHU1' | 'DHU2', on: boolean, deviceId?: string): Promise<void> {
  if (!deviceId) return;
  const relayKey = relay.toLowerCase();
  await fetch(`${API_URL}/api/device-sync/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, [relayKey]: on }),
  });
}

export async function sendAutoAdjustMode(ipAddress: string, enabled: boolean, deviceId?: string): Promise<void> {
  if (!deviceId) return;
  await fetch(`${API_URL}/api/device-sync/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, autoAdjust: enabled }),
  });
}

export async function pingDevice(ipAddress: string): Promise<{ ok: boolean; latencyMs: number }> {
  return { ok: true, latencyMs: 0 };
}

// ---------------------------------------------------------
// FALLBACKS (To prevent TS errors in App.tsx)
// ---------------------------------------------------------
export function resolveDeviceTarget(device: { ipAddress: string; hostname?: string }): string {
  return device.ipAddress; 
}

export async function scanSubnetForDevices(subnetPrefix: string): Promise<any[]> {
  console.warn("Local network scanning is disabled when using Vercel.");
  return [];
}