/**
 * esp32Api.ts
 * ---------------------------------------------------------------
 * Direct browser <-> ESP32 communication layer.
 */

import { DeviceData } from '../types';

const REQUEST_TIMEOUT_MS = 2500;

// NO SIMULATION - real data only
const SIMULATION_MODE = false;

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

class Esp32CommunicationError extends Error {
  constructor(message: string, public deviceIp: string) {
    super(message);
    this.name = 'Esp32CommunicationError';
  }
}

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

function isValidHostname(hostname: string): boolean {
  return /^[a-zA-Z0-9-]+(\.local)?$/.test(hostname?.trim() || '');
}

// CRITICAL: This function decides WHERE to connect
// If hostname is set, ALWAYS use hostname (mDNS) - NEVER use IP
export function resolveDeviceTarget(device: { ipAddress: string; hostname?: string }): string {
  // ALWAYS use hostname if set - it's more reliable
  if (device.hostname && device.hostname.trim()) {
    return normalizeHostname(device.hostname);
  }
  // Only use IP if NO hostname is set
  return device.ipAddress;
}

function isValidTarget(target: string): boolean {
  return isValidIp(target) || isValidHostname(target) || /\.local$/i.test(target?.trim() || '');
}

export async function fetchDeviceTelemetry(ipAddress: string, device?: DeviceData): Promise<Esp32TelemetryResponse> {
  // If device has hostname, use hostname (mDNS) - ignore IP
  const target = device?.hostname ? normalizeHostname(device.hostname) : ipAddress;
  
  if (!isValidTarget(target) && !device) {
    throw new Esp32CommunicationError('Invalid or unconfigured address', ipAddress);
  }

  const { signal, cancel } = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`http://${target}/api/telemetry`, {
      method: 'GET',
      signal,
      mode: 'cors',
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Esp32CommunicationError(`ESP32 responded with HTTP ${res.status}`, target);
    }
    const data = (await res.json()) as Esp32TelemetryResponse;
    return data;
  } catch (err) {
    // Only log if it's NOT a timeout (timeouts are expected when device is off)
    if (!(err instanceof DOMException && err.name === 'AbortError')) {
      console.warn(`[ESP32] Could not reach ${target}:`, err instanceof Error ? err.message : err);
    }
    if (err instanceof Esp32CommunicationError) throw err;
    throw new Esp32CommunicationError(
      err instanceof DOMException && err.name === 'AbortError'
        ? 'Timed out waiting for ESP32'
        : `Unreachable: ${(err as Error).message}`,
      target
    );
  } finally {
    cancel();
  }
}

export async function sendServoCommand(
  ipAddress: string,
  type: 'hot' | 'cold',
  percent: 0 | 25 | 50 | 75 | 100
): Promise<void> {
  // Use hostname if available, otherwise IP
  const target = ipAddress;
  if (!isValidTarget(target)) throw new Esp32CommunicationError('Invalid or unconfigured address', target);

  const { signal, cancel } = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`http://${target}/api/servo`, {
      method: 'POST',
      signal,
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, percent }),
    });
    if (!res.ok) throw new Esp32CommunicationError(`ESP32 rejected servo command (HTTP ${res.status})`, target);
  } catch (err) {
    if (err instanceof Esp32CommunicationError) throw err;
    throw new Esp32CommunicationError(`Unreachable: ${(err as Error).message}`, target);
  } finally {
    cancel();
  }
}

export async function sendAutoAdjustMode(ipAddress: string, enabled: boolean): Promise<void> {
  const target = ipAddress;
  if (!isValidTarget(target)) throw new Esp32CommunicationError('Invalid or unconfigured address', target);

  const { signal, cancel } = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`http://${target}/api/mode`, {
      method: 'POST',
      signal,
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoAdjust: enabled }),
    });
    if (!res.ok) throw new Esp32CommunicationError(`ESP32 rejected mode change (HTTP ${res.status})`, target);
  } catch (err) {
    if (err instanceof Esp32CommunicationError) throw err;
    throw new Esp32CommunicationError(`Unreachable: ${(err as Error).message}`, target);
  } finally {
    cancel();
  }
}

export async function sendSetpoints(
  ipAddress: string,
  targetTemp?: number,
  targetHum?: number
): Promise<void> {
  const target = ipAddress;
  if (!isValidTarget(target)) throw new Esp32CommunicationError('Invalid or unconfigured address', target);

  const { signal, cancel } = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`http://${target}/api/setpoint`, {
      method: 'POST',
      signal,
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetTemp, targetHum }),
    });
    if (!res.ok) throw new Esp32CommunicationError(`ESP32 rejected setpoint update (HTTP ${res.status})`, target);
  } catch (err) {
    if (err instanceof Esp32CommunicationError) throw err;
    throw new Esp32CommunicationError(`Unreachable: ${(err as Error).message}`, target);
  } finally {
    cancel();
  }
}

export async function sendRelayCommand(
  ipAddress: string,
  relay: 'AHU' | 'DHU1' | 'DHU2',
  on: boolean
): Promise<void> {
  const target = ipAddress;
  if (!isValidTarget(target)) throw new Esp32CommunicationError('Invalid or unconfigured address', target);

  const { signal, cancel } = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`http://${target}/api/relay`, {
      method: 'POST',
      signal,
      mode: 'cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relay, on }),
    });
    if (!res.ok) throw new Esp32CommunicationError(`ESP32 rejected relay command (HTTP ${res.status})`, target);
  } catch (err) {
    if (err instanceof Esp32CommunicationError) throw err;
    throw new Esp32CommunicationError(`Unreachable: ${(err as Error).message}`, target);
  } finally {
    cancel();
  }
}

export async function pingDevice(ipAddress: string): Promise<{ ok: boolean; latencyMs: number }> {
  const start = performance.now();
  try {
    await fetchDeviceTelemetry(ipAddress);
    return { ok: true, latencyMs: Math.round(performance.now() - start) };
  } catch {
    return { ok: false, latencyMs: 0 };
  }
}

// CRITICAL: This function ONLY returns sensor data, NEVER control fields
// Control fields (valves, relays, auto-adjust) are user-controlled
export async function pollAllDevices(devices: DeviceData[]): Promise<DeviceData[]> {
  const results = await Promise.allSettled(
    devices.map(async (d) => {
      // Use hostname if set, otherwise IP
      const target = d.hostname ? normalizeHostname(d.hostname) : d.ipAddress;
      try {
        return await fetchDeviceTelemetry(target, d);
      } catch (err) {
        // Silently ignore unreachable devices - don't throw
        console.log(`[ESP32] Device ${d.id} unreachable at ${target}`);
        throw err;
      }
    })
  );

  return devices.map((dev, idx) => {
    const result = results[idx];
    if (result.status === 'rejected') {
      // Device is unreachable - keep it as-is, DON'T mark as offline
      // Don't change any control fields
      return dev;
    }

    const t = result.value;
    
    // CRITICAL: ONLY return sensor data, NEVER control fields
    return {
      ...dev,
      isOnline: true,
      tempReal: t.tempReal,
      humidityReal: t.humidityReal,
      macAddress: t.mac || dev.macAddress,
      firmwareVersion: t.firmwareVersion || dev.firmwareVersion,
      lastUpdated: new Date().toLocaleTimeString(),
      // DO NOT update these from polling:
      // hotValvePercent: dev.hotValvePercent,
      // coldValvePercent: dev.coldValvePercent,
      // hotValveAngle: dev.hotValveAngle,
      // coldValveAngle: dev.coldValveAngle,
      // autoAdjustEnabled: dev.autoAdjustEnabled,
      // ahuPowerOn: dev.ahuPowerOn,
      // dhu1On: dev.dhu1On,
      // dhu2On: dev.dhu2On,
    } as DeviceData;
  });
}

const SCAN_TIMEOUT_MS = 500;
const DEFAULT_SCAN_RANGE_SIZE = 510;
const SCAN_BATCH_SIZE = 128;

export interface ScannedDevice {
  ip: string;
  telemetry: Esp32TelemetryResponse;
}

function addressAtOffset(prefix: string, offset: number): string {
  const parts = prefix.split('.').map(Number);
  const thirdOctetBump = Math.floor((offset - 1) / 254);
  const lastOctet = ((offset - 1) % 254) + 1;
  const thirdOctet = parts[2] + thirdOctetBump;
  return `${parts[0]}.${parts[1]}.${thirdOctet}.${lastOctet}`;
}

export async function scanSubnetForDevices(
  subnetPrefix: string,
  rangeSize: number = DEFAULT_SCAN_RANGE_SIZE
): Promise<ScannedDevice[]> {
  const prefix = subnetPrefix.trim().replace(/\.$/, '');
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(prefix)) {
    throw new Error('Subnet prefix must look like "192.168.137" (first 3 octets only)');
  }

  const found: ScannedDevice[] = [];
  const totalHosts = Math.max(1, Math.min(rangeSize, 4096));

  try {
    for (let batchStart = 1; batchStart <= totalHosts; batchStart += SCAN_BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + SCAN_BATCH_SIZE - 1, totalHosts);
      const offsets = Array.from({ length: batchEnd - batchStart + 1 }, (_, i) => batchStart + i);

      const results = await Promise.allSettled(
        offsets.map(async (offset) => {
          const ip = addressAtOffset(prefix, offset);
          const { signal, cancel } = withTimeout(SCAN_TIMEOUT_MS);
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
  } catch (err) {
    console.error('[SCAN] Error during subnet scan:', err);
  }

  return found;
}

export { Esp32CommunicationError };