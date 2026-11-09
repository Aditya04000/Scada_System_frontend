/**
 * esp32Api.ts
 * ---------------------------------------------------------------
 * Direct browser <-> ESP32 communication layer.
 *
 * Two modes, selected by the VITE_API_URL environment variable:
 *   - localhost      → LAN mode: http://<device-ip>/api/...
 *   - deployed URL   → Proxy mode: <Render-URL>/api/esp32/telemetry
 */

import { DeviceData } from '../types';

const REQUEST_TIMEOUT_MS = 5000; // Increased slightly to allow tunnel latency

// NO SIMULATION - real data only
const SIMULATION_MODE = false;

// ------------------------------------------------------------------
// BASE URL CONFIG
// ------------------------------------------------------------------
const VITE_API_URL = import.meta.env.VITE_API_URL || '';

// If running on localhost, we assume LAN mode (talk directly to ESP32).
// If running on Vercel, VITE_API_URL will be your Render URL (talk to proxy).
const IS_LOCAL = VITE_API_URL.includes('localhost') || VITE_API_URL === '';
const RAW_BASE_URL = IS_LOCAL ? '' : VITE_API_URL.replace(/\/+$/, '');

// Access key for the tunnel (only needed if your Render backend passes it, 
// otherwise you can leave this empty as Render handles the secret).
const TUNNEL_KEY = (import.meta.env.VITE_ESP32_KEY || '').trim();

// Returns true when we're talking to the Render backend instead of the LAN.
function usingTunnel(): boolean {
  return RAW_BASE_URL.length > 0;
}

// Append the access key to a URL as ?key=... (only when using the tunnel).
function withKey(url: string): string {
  if (!TUNNEL_KEY) return url;
  return url + (url.includes('?') ? '&' : '?') + `key=${encodeURIComponent(TUNNEL_KEY)}`;
}

// Build the URL for a device endpoint.
function buildUrl(target: string, path: string): string {
  if (usingTunnel()) {
    return withKey(`${RAW_BASE_URL}${path}`);
  }
  return `http://${target}${path}`;
}

// ------------------------------------------------------------------
// TYPES
// ------------------------------------------------------------------

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
export function resolveDeviceTarget(device: { ipAddress: string; hostname?: string }): string {
  if (device.hostname && device.hostname.trim()) {
    return normalizeHostname(device.hostname);
  }
  return device.ipAddress;
}

function isValidTarget(target: string): boolean {
  return isValidIp(target) || isValidHostname(target) || /\.local$/i.test(target?.trim() || '');
}

// ------------------------------------------------------------------
// TELEMETRY
// ------------------------------------------------------------------

export async function fetchDeviceTelemetry(ipAddress: string, device?: DeviceData): Promise<Esp32TelemetryResponse> {
  const target = device?.hostname ? normalizeHostname(device.hostname) : ipAddress;

  if (!usingTunnel() && !isValidTarget(target) && !device) {
    throw new Esp32CommunicationError('Invalid or unconfigured address', ipAddress);
  }

  // --- THE FIX: Choose the path based on mode ---
  // Locally: hit the ESP32 directly at /api/telemetry
  // Online: hit the Render proxy at /api/esp32/telemetry
  const endpointPath = usingTunnel() ? '/api/esp32/telemetry' : '/api/telemetry';

  const { signal, cancel } = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(buildUrl(target, endpointPath), {
      method: 'GET',
      signal,
      mode: 'cors',
      cache: 'no-store',
      headers: TUNNEL_KEY ? { 'X-Tunnel-Key': TUNNEL_KEY } : undefined,
    });
    if (!res.ok) {
      throw new Esp32CommunicationError(`Device responded with HTTP ${res.status}`, target);
    }
    const data = (await res.json()) as Esp32TelemetryResponse;
    return data;
  } catch (err) {
    if (!(err instanceof DOMException && err.name === 'AbortError')) {
      console.warn(`[ESP32] Could not reach ${usingTunnel() ? RAW_BASE_URL : target}:`, err instanceof Error ? err.message : err);
    }
    if (err instanceof Esp32CommunicationError) throw err;
    throw new Esp32CommunicationError(
      err instanceof DOMException && err.name === 'AbortError'
        ? 'Timed out waiting for device'
        : `Unreachable: ${(err as Error).message}`,
      target
    );
  } finally {
    cancel();
  }
}

// ------------------------------------------------------------------
// COMMANDS
// ------------------------------------------------------------------

export async function sendServoCommand(
  ipAddress: string,
  type: 'hot' | 'cold',
  percent: 0 | 25 | 50 | 75 | 100
): Promise<void> {
  const target = ipAddress;
  if (!usingTunnel() && !isValidTarget(target)) {
    throw new Esp32CommunicationError('Invalid or unconfigured address', target);
  }

  const { signal, cancel } = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(buildUrl(target, '/api/servo'), {
      method: 'POST',
      signal,
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        ...(TUNNEL_KEY ? { 'X-Tunnel-Key': TUNNEL_KEY } : {}),
      },
      body: JSON.stringify({ type, percent }),
    });
    if (!res.ok) throw new Esp32CommunicationError(`Device rejected servo command (HTTP ${res.status})`, target);
  } catch (err) {
    if (err instanceof Esp32CommunicationError) throw err;
    throw new Esp32CommunicationError(`Unreachable: ${(err as Error).message}`, target);
  } finally {
    cancel();
  }
}

export async function sendAutoAdjustMode(ipAddress: string, enabled: boolean): Promise<void> {
  const target = ipAddress;
  if (!usingTunnel() && !isValidTarget(target)) {
    throw new Esp32CommunicationError('Invalid or unconfigured address', target);
  }

  const { signal, cancel } = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(buildUrl(target, '/api/mode'), {
      method: 'POST',
      signal,
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        ...(TUNNEL_KEY ? { 'X-Tunnel-Key': TUNNEL_KEY } : {}),
      },
      body: JSON.stringify({ autoAdjust: enabled }),
    });
    if (!res.ok) throw new Esp32CommunicationError(`Device rejected mode change (HTTP ${res.status})`, target);
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
  if (!usingTunnel() && !isValidTarget(target)) {
    throw new Esp32CommunicationError('Invalid or unconfigured address', target);
  }

  const { signal, cancel } = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(buildUrl(target, '/api/setpoint'), {
      method: 'POST',
      signal,
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        ...(TUNNEL_KEY ? { 'X-Tunnel-Key': TUNNEL_KEY } : {}),
      },
      body: JSON.stringify({ targetTemp, targetHum }),
    });
    if (!res.ok) throw new Esp32CommunicationError(`Device rejected setpoint update (HTTP ${res.status})`, target);
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
  if (!usingTunnel() && !isValidTarget(target)) {
    throw new Esp32CommunicationError('Invalid or unconfigured address', target);
  }

  const { signal, cancel } = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(buildUrl(target, '/api/relay'), {
      method: 'POST',
      signal,
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        ...(TUNNEL_KEY ? { 'X-Tunnel-Key': TUNNEL_KEY } : {}),
      },
      body: JSON.stringify({ relay, on }),
    });
    if (!res.ok) throw new Esp32CommunicationError(`Device rejected relay command (HTTP ${res.status})`, target);
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

// ------------------------------------------------------------------
// POLLING
// ------------------------------------------------------------------
export async function pollAllDevices(devices: DeviceData[]): Promise<DeviceData[]> {
  const results = await Promise.allSettled(
    devices.map(async (d) => {
      const target = d.hostname ? normalizeHostname(d.hostname) : d.ipAddress;
      try {
        return await fetchDeviceTelemetry(target, d);
      } catch (err) {
        console.log(`[ESP32] Device ${d.id} unreachable at ${usingTunnel() ? RAW_BASE_URL : target}`);
        throw err;
      }
    })
  );

  return devices.map((dev, idx) => {
    const result = results[idx];
    if (result.status === 'rejected') {
      return {
        ...dev,
        isOnline: false,
        tempReal: null,
        humidityReal: null,
        lastUpdated: new Date().toLocaleTimeString(),
      } as DeviceData;
    }

    const t = result.value;

    return {
      ...dev,
      isOnline: true,
      tempReal: t.tempReal,
      humidityReal: t.humidityReal,
      macAddress: t.mac || dev.macAddress,
      firmwareVersion: t.firmwareVersion || dev.firmwareVersion,
      lastUpdated: new Date().toLocaleTimeString(),
    } as DeviceData;
  });
}

// ------------------------------------------------------------------
// SUBNET SCAN
// ------------------------------------------------------------------
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
  if (usingTunnel()) {
    console.warn('[SCAN] Subnet scan skipped: tunnel mode is single-endpoint.');
    return [];
  }

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