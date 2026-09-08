/**
 * api.ts
 * ---------------------------------------------------------------
 * The dashboard's single connection to the BECS backend.
 */

import type {
  AlarmLog,
  AuditLogEntry,
  AutomationLog,
  AutomationRule,
  DeviceData,
  HistoryDataPoint,
  UserAccount,
  UserRole,
} from '../types';

// ---------------------------------------------------------------
// Base URL
// ---------------------------------------------------------------

const rawBase = (import.meta.env?.VITE_API_URL ?? '').trim();
export const API_BASE_URL = rawBase.replace(/\/+$/, '');

const DEFAULT_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------
// Errors
// ---------------------------------------------------------------

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, string>;
  readonly requestId?: string;

  constructor(
    message: string,
    options: { code: string; status: number; details?: Record<string, string>; requestId?: string }
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = options.code;
    this.status = options.status;
    if (options.details) this.details = options.details;
    if (options.requestId) this.requestId = options.requestId;
  }

  get isAuthFailure(): boolean {
    return this.status === 401;
  }

  get isOffline(): boolean {
    return this.code === 'NETWORK_UNREACHABLE' || this.code === 'TIMEOUT';
  }
}

export const isApiError = (err: unknown): err is ApiError => err instanceof ApiError;

export function errorMessage(err: unknown): string {
  if (isApiError(err)) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

// ---------------------------------------------------------------
// Session-expiry notification
// ---------------------------------------------------------------

type AuthExpiredHandler = () => void;
const authExpiredHandlers = new Set<AuthExpiredHandler>();

export function onAuthExpired(handler: AuthExpiredHandler): () => void {
  authExpiredHandlers.add(handler);
  return () => authExpiredHandlers.delete(handler);
}

let suppressAuthNotifications = false;

function notifyAuthExpired(): void {
  if (suppressAuthNotifications) return;
  for (const handler of authExpiredHandlers) {
    try {
      handler();
    } catch {
      // A listener throwing must not turn into a second failure on this request.
    }
  }
}

// ---------------------------------------------------------------
// The fetch wrapper
// ---------------------------------------------------------------

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
  skipAuthNotify?: boolean;
  signal?: AbortSignal;
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: Record<string, string>; requestId?: string };
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  let url = `${API_BASE_URL}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  return url;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, timeoutMs = DEFAULT_TIMEOUT_MS, skipAuthNotify, signal } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      credentials: 'include',
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
      mode: 'cors',
      redirect: 'follow',
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new ApiError(
        signal?.aborted ? 'That request was cancelled.' : 'The server did not respond in time. Check the connection and try again.',
        { code: 'TIMEOUT', status: 0 }
      );
    }
    throw new ApiError(
      `Cannot reach the BECS server${API_BASE_URL ? ` at ${API_BASE_URL}` : ''}. Check that it is running and that this device is on the network.`,
      { code: 'NETWORK_UNREACHABLE', status: 0 }
    );
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      if (!response.ok) {
        throw new ApiError(
          `The server returned an unexpected response (HTTP ${response.status}). It may be starting up or behind a proxy that is not passing requests through.`,
          { code: 'BAD_GATEWAY', status: response.status }
        );
      }
      throw new ApiError('The server sent a response this app could not read.', {
        code: 'INVALID_RESPONSE',
        status: response.status,
      });
    }
  }

  if (!response.ok) {
    const envelope = (parsed ?? {}) as ErrorEnvelope;
    const code = envelope.error?.code ?? 'INTERNAL';
    const message = envelope.error?.message ?? `The request failed (HTTP ${response.status}).`;

    if (response.status === 401 && !skipAuthNotify) notifyAuthExpired();

    throw new ApiError(message, {
      code,
      status: response.status,
      ...(envelope.error?.details ? { details: envelope.error.details } : {}),
      ...(envelope.error?.requestId ? { requestId: envelope.error.requestId } : {}),
    });
  }

  const envelope = (parsed ?? {}) as { data?: T };
  if (envelope.data !== undefined) return envelope.data;
  return (parsed as T) ?? (undefined as T);
}

export function fireAndForget(promise: Promise<unknown>, label: string): void {
  void promise.catch((err: unknown) => {
    if (isApiError(err) && err.isOffline) return;
    console.warn(`[api] ${label} failed:`, errorMessage(err));
  });
}

// ---------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------

const pad = (n: number): string => String(n).padStart(2, '0');

export function formatTimeDate(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function formatDateOnly(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)}`;
}

function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours()}:${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------
// Server payload shapes
// ---------------------------------------------------------------

export interface DeviceDto {
  id: string;
  name: string;
  roomName: string;
  ipAddress: string;
  hostname?: string;
  macAddress: string;
  firmwareVersion: string;
  tempMax: number;
  tempMin: number;
  humidityMax: number;
  humidityMin: number;
  targetTempSetpoint: number;
  targetHumSetpoint: number;
  pingMs: number;
  hotValvePercent: number;
  coldValvePercent: number;
  hotValveAngle: number;
  coldValveAngle: number;
  autoAdjustEnabled: boolean;
  ahuPowerOn: boolean;
  dhu1On: boolean;
  dhu2On: boolean;
  mode: string;
}

export interface AlarmDto {
  id: string;
  alarmName: string;
  device: string;
  ipAddress?: string;
  parameter: AlarmLog['parameter'];
  lowHigh: AlarmLog['lowHigh'];
  value: string;
  timestamp: number;
  category: 'REALTIME' | 'PAST';
  acknowledged: boolean;
  clearedAt?: string;
}

export interface AuditLogDto {
  id: string;
  user: string;
  role: UserRole | 'SYSTEM';
  action: string;
  target: string;
  details: string;
  timestamp: number;
  dateTime: string;
}

export interface AutomationRuleDto {
  id: string;
  device: string;
  parameter: 'Temperature' | 'Humidity';
  condition: 'GREATER_THAN' | 'LESS_THAN';
  threshold: number;
  targetSupply: 'HOT' | 'COLD';
  targetValvePercent: number;
  enabled: boolean;
}

export interface AutomationLogDto {
  id: string;
  device: string;
  parameter: AutomationLog['parameter'];
  anglePercent: string;
  triggerReason: string;
  timePeriod: string;
  date: string;
}

export interface HistoryPointDto {
  device: string;
  temperature: number;
  humidity: number;
  hotServoAngle: number;
  coldServoAngle: number;
  timestamp: number;
}

export interface UserDto {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export type BreachKey =
  | 'tempHigh'
  | 'tempLow'
  | 'humHigh'
  | 'humLow'
  | 'servoJam'
  | 'powerSupply'
  | 'wifiOffline';

// ---------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------

function toValvePercent(value: number): 0 | 25 | 50 | 75 | 100 {
  const options: Array<0 | 25 | 50 | 75 | 100> = [0, 25, 50, 75, 100];
  let closest: 0 | 25 | 50 | 75 | 100 = 0;
  let smallestGap = Number.POSITIVE_INFINITY;
  for (const option of options) {
    const gap = Math.abs(option - value);
    if (gap < smallestGap) {
      smallestGap = gap;
      closest = option;
    }
  }
  return closest;
}

export function toDeviceData(dto: DeviceDto): DeviceData {
  const device: DeviceData = {
    id: dto.id,
    name: dto.name,
    roomName: dto.roomName,
    ipAddress: dto.ipAddress,
    macAddress: dto.macAddress,
    pingMs: dto.pingMs || 0,
    firmwareVersion: dto.firmwareVersion || 'Unknown',
    tempMax: dto.tempMax,
    tempReal: null,
    tempMin: dto.tempMin,
    humidityMax: dto.humidityMax,
    humidityReal: null,
    humidityMin: dto.humidityMin,
    hotValvePercent: 0,
    coldValvePercent: 0,
    hotValveAngle: 0,
    coldValveAngle: 0,
    isOnline: false,
    mode: 'AUTO',
    ahuPowerOn: false,
    dhu1On: false,
    dhu2On: false,
    autoAdjustEnabled: true,
    targetTempSetpoint: dto.targetTempSetpoint,
    targetHumSetpoint: dto.targetHumSetpoint,
    lastUpdated: 'Hardware Disconnected',
  };
  if (dto.hostname) device.hostname = dto.hostname;
  return device;
}

export function toAlarmLog(dto: AlarmDto): AlarmLog {
  return {
    id: dto.id,
    alarmName: dto.alarmName,
    device: dto.device,
    ipAddress: dto.ipAddress,
    parameter: dto.parameter,
    lowHigh: dto.lowHigh,
    value: dto.value,
    timeDate: formatTimeDate(dto.timestamp),
    timestamp: dto.timestamp,
    category: dto.category,
    acknowledged: dto.acknowledged,
    clearedAt: dto.clearedAt,
  };
}

export function toAuditLogEntry(dto: AuditLogDto): AuditLogEntry {
  return {
    id: dto.id,
    user: dto.user,
    role: dto.role === 'SYSTEM' ? 'OPERATOR' : dto.role,
    action: dto.action,
    target: dto.target,
    details: dto.details,
    timestamp: dto.timestamp,
    dateTime: dto.dateTime || formatTimeDate(dto.timestamp),
  };
}

export function toAutomationRule(dto: AutomationRuleDto): AutomationRule {
  return {
    id: dto.id,
    device: dto.device,
    parameter: dto.parameter,
    condition: dto.condition,
    threshold: dto.threshold,
    targetSupply: dto.targetSupply,
    targetValvePercent: toValvePercent(dto.targetValvePercent),
    enabled: dto.enabled,
  };
}

export function toAutomationLog(dto: AutomationLogDto): AutomationLog {
  return {
    id: dto.id,
    device: dto.device,
    parameter: dto.parameter,
    anglePercent: dto.anglePercent,
    timePeriod: dto.timePeriod,
    triggerReason: dto.triggerReason,
    date: dto.date || formatDateOnly(Date.now()),
  };
}

export function toHistoryPoint(dto: HistoryPointDto): HistoryDataPoint {
  return {
    time: new Date(dto.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    timestamp: dto.timestamp,
    device: dto.device,
    temperature: dto.temperature,
    humidity: dto.humidity,
    hotServoAngle: dto.hotServoAngle,
    coldServoAngle: dto.coldServoAngle,
  };
}

export function toUserAccount(dto: UserDto): UserAccount {
  return {
    id: String(dto.id),
    email: dto.email,
    passwordHash: '',
    role: dto.role,
    name: dto.name,
    createdAt: dto.createdAt,
  };
}

// ---------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------

export interface SignedInUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

const toSignedInUser = (dto: UserDto): SignedInUser => ({
  id: String(dto.id),
  email: dto.email,
  name: dto.name,
  role: dto.role,
});

export const authApi = {
  async login(email: string, password: string): Promise<SignedInUser> {
    suppressAuthNotifications = true;
    try {
      const data = await request<{ user: UserDto }>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
        skipAuthNotify: true,
      });
      return toSignedInUser(data.user);
    } finally {
      suppressAuthNotifications = false;
    }
  },

  async logout(): Promise<void> {
    try {
      await request<{ signedOut: boolean }>('/api/auth/logout', { method: 'POST', skipAuthNotify: true });
    } catch {
      // Already expired, or the network is down.
    }
  },

  async me(): Promise<SignedInUser | null> {
    try {
      const data = await request<{ user: UserDto }>('/api/auth/me', { skipAuthNotify: true });
      return toSignedInUser(data.user);
    } catch (err) {
      if (isApiError(err) && err.isAuthFailure) return null;
      throw err;
    }
  },
};

// ---------------------------------------------------------------
// Devices
// ---------------------------------------------------------------

export interface DevicePatch {
  name?: string;
  roomName?: string;
  ipAddress?: string | null;
  hostname?: string | null;
  macAddress?: string | null;
  firmwareVersion?: string;
  tempMin?: number;
  tempMax?: number;
  humidityMin?: number;
  humidityMax?: number;
  autoAdjustEnabled?: boolean;
  targetTempSetpoint?: number;
  targetHumSetpoint?: number;
  mode?: 'AUTO' | 'MANUAL';
  hotValvePercent?: number;
  coldValvePercent?: number;
  hotValveAngle?: number;
  coldValveAngle?: number;
  ahuPowerOn?: boolean;
  dhu1On?: boolean;
  dhu2On?: boolean;
}

export interface DiscoveredBinding {
  macAddress: string;
  ipAddress?: string | null;
  hostname?: string | null;
  firmwareVersion?: string | null;
  pingMs?: number | null;
}

export interface HistorySample {
  device: string;
  temperature: number;
  humidity: number;
  hotServoAngle: number;
  coldServoAngle: number;
  recordedAt?: number;
}

export const devicesApi = {
  async list(): Promise<DeviceData[]> {
    const data = await request<DeviceDto[] | { devices: DeviceDto[] }>('/api/devices');
    const devices = Array.isArray(data) ? data : data.devices;
    return devices.map(toDeviceData);
  },

  async create(input: { name?: string; roomName?: string }): Promise<DeviceData> {
    const data = await request<DeviceDto>('/api/devices', { method: 'POST', body: input });
    return toDeviceData(data);
  },

  async update(deviceId: string, patch: DevicePatch): Promise<DeviceData> {
    const data = await request<DeviceDto>(`/api/devices/${encodeURIComponent(deviceId)}`, {
      method: 'PATCH',
      body: patch,
    });
    return toDeviceData(data);
  },

  async remove(deviceId: string): Promise<void> {
    await request<void>(`/api/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
  },

  async bind(input: DiscoveredBinding): Promise<{ device: DeviceData; claimed: boolean }> {
    const data = await request<DeviceDto>('/api/devices/bind', {
      method: 'POST',
      body: input,
    });
    return { device: toDeviceData(data), claimed: true };
  },

  async history(params: { hours?: number; device?: string; limit?: number } = {}): Promise<HistoryDataPoint[]> {
    const data = await request<HistoryPointDto[] | { history: HistoryPointDto[] }>('/api/devices/history', {
      query: { hours: params.hours, device: params.device, limit: params.limit },
      timeoutMs: 30_000,
    });
    return (Array.isArray(data) ? data : data.history).map(toHistoryPoint);
  },

  async recordHistory(samples: HistorySample[]): Promise<{ recorded: number; skipped: number }> {
    if (samples.length === 0) return { recorded: 0, skipped: 0 };
    return request<{ recorded: number; skipped: number }>('/api/devices/history', {
      method: 'POST',
      body: { samples },
    });
  },
};

// ---------------------------------------------------------------
// Alarms
// ---------------------------------------------------------------

export interface RaiseAlarmInput {
  device: string;
  alarmName: string;
  parameter: AlarmLog['parameter'];
  lowHigh: AlarmLog['lowHigh'];
  value: string;
  breachKey: BreachKey;
  ipAddress?: string | null;
  occurredAt?: number;
}

export const alarmsApi = {
  async list(params: { limit?: number; offset?: number } = {}): Promise<{ alarms: AlarmLog[]; total: number }> {
    const data = await request<AlarmDto[] | { alarms: AlarmDto[] }>('/api/alarms');
    const alarms = Array.isArray(data) ? data : data.alarms;
    return { alarms: alarms.map(toAlarmLog), total: alarms.length };
  },

  async raise(input: RaiseAlarmInput): Promise<{ alarm: AlarmLog; created: boolean }> {
    const data = await request<AlarmDto>('/api/alarms', {
      method: 'POST',
      body: {
        ...input,
        timestamp: input.occurredAt || Date.now(),
        timeDate: formatTimeDate(input.occurredAt || Date.now()),
        category: 'REALTIME',
      },
    });
    return { alarm: toAlarmLog(data), created: true };
  },

  async resolve(device: string, breachKey?: BreachKey): Promise<AlarmLog[]> {
    const data = await request<AlarmDto[]>('/api/alarms/resolve', {
      method: 'POST',
      body: { device, breachKey: breachKey ?? null },
    });
    return data.map(toAlarmLog);
  },

  async acknowledge(id: string): Promise<AlarmLog> {
    const data = await request<AlarmDto>(`/api/alarms/${encodeURIComponent(id)}/ack`, {
      method: 'PATCH',
      body: { clearedAt: new Date().toISOString() },
    });
    return toAlarmLog(data);
  },

  async acknowledgeAll(): Promise<AlarmLog[]> {
    const data = await request<AlarmDto[]>('/api/alarms/ack-all', {
      method: 'PATCH',
    });
    return data.map(toAlarmLog);
  },

  async remove(id: string): Promise<void> {
    await request<void>(`/api/alarms/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};

// ---------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------

export type ClientAuditAction = 'REPORT_EXPORTED' | 'NETWORK_SCAN' | 'DEVICE_ONLINE_TOGGLED' | 'AUTOMATION_TRIGGERED';

export const auditApi = {
  async list(params: { limit?: number; offset?: number } = {}): Promise<{ entries: AuditLogEntry[]; total: number }> {
    const data = await request<AuditLogDto[] | { entries: AuditLogDto[] }>('/api/audit-log');
    const entries = Array.isArray(data) ? data : data.entries;
    return { entries: entries.map(toAuditLogEntry), total: entries.length };
  },

  async record(action: ClientAuditAction, target: string, details: string): Promise<void> {
    await request<{ recorded: boolean }>('/api/audit-log', {
      method: 'POST',
      body: { action, target, details },
    });
  },
};

// ---------------------------------------------------------------
// Automation rules and history
// ---------------------------------------------------------------

export interface RuleInput {
  device: string;
  parameter: 'Temperature' | 'Humidity';
  condition: 'GREATER_THAN' | 'LESS_THAN';
  threshold: number;
  targetSupply: 'HOT' | 'COLD';
  targetValvePercent: number;
  enabled?: boolean;
}

export interface RulePatch {
  parameter?: 'Temperature' | 'Humidity';
  condition?: 'GREATER_THAN' | 'LESS_THAN';
  threshold?: number;
  targetSupply?: 'HOT' | 'COLD';
  targetValvePercent?: number;
  enabled?: boolean;
}

export interface AutomationLogInput {
  device: string;
  parameter: AutomationLog['parameter'];
  anglePercent: string;
  triggerReason: string;
  isAutomatic: boolean;
  ruleId?: string | null;
  occurredAt?: number;
}

export const rulesApi = {
  async list(): Promise<AutomationRule[]> {
    const data = await request<AutomationRuleDto[] | { rules: AutomationRuleDto[] }>('/api/rules');
    return (Array.isArray(data) ? data : data.rules).map(toAutomationRule);
  },

  async create(input: RuleInput): Promise<AutomationRule> {
    const data = await request<AutomationRuleDto>('/api/rules', { method: 'POST', body: input });
    return toAutomationRule(data);
  },

  async update(id: string, patch: RulePatch): Promise<AutomationRule> {
    const data = await request<AutomationRuleDto>(`/api/rules/${encodeURIComponent(id)}/toggle`, {
      method: 'PATCH',
      body: patch,
    });
    return toAutomationRule(data);
  },

  async remove(id: string): Promise<void> {
    await request<{ deleted: boolean }>(`/api/rules/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async log(params: { limit?: number; device?: string } = {}): Promise<AutomationLog[]> {
    const data = await request<AutomationLogDto[] | { logs: AutomationLogDto[] }>('/api/automation-log');
    return (Array.isArray(data) ? data : data.logs).map(toAutomationLog);
  },

  async recordLog(input: AutomationLogInput): Promise<AutomationLog> {
    const data = await request<AutomationLogDto>('/api/automation-log', {
      method: 'POST',
      body: {
        device: input.device,
        parameter: input.parameter,
        anglePercent: input.anglePercent,
        timePeriod: formatClock(input.occurredAt || Date.now()),
        triggerReason: input.triggerReason,
        date: formatDateOnly(input.occurredAt || Date.now()),
      },
    });
    return toAutomationLog(data);
  },
};

// ---------------------------------------------------------------
// Reports
// ---------------------------------------------------------------

export interface ReportRange {
  avg: number | null;
  min: number | null;
  max: number | null;
}

export interface ReportDevice {
  device: string;
  name: string;
  roomName: string;
  samples: number;
  temperature: ReportRange;
  humidity: ReportRange;
  valves: { hotAvgAngle: number | null; coldAvgAngle: number | null };
  firstSampleAt: number | null;
  lastSampleAt: number | null;
}

export interface Report {
  period: 'daily' | 'weekly' | 'monthly';
  days: number;
  timezone: string;
  generatedAt: number;
  from: number;
  to: number;
  totals: {
    devices: number;
    devicesReporting: number;
    samples: number;
    alarms: number;
    alarmsUnacknowledged: number;
    alarmsStillOpen: number;
    automationActions: number;
    automationAutomatic: number;
    automationManual: number;
  };
  alarmBreakdown: {
    byParameter: Record<'Temperature' | 'Humidity', number>;
    bySeverity: Record<'High' | 'Low' | 'Critical' | 'Warning', number>;
    byDevice: Array<{ device: string; alarms: number; unacknowledged: number; minutesOutOfRange: number }>;
  };
  devices: ReportDevice[];
  series: Array<{ bucket: string; samples: number; temperatureAvg: number | null; humidityAvg: number | null }>;
}

export const reportsApi = {
  async get(period: 'daily' | 'weekly' | 'monthly', options: { days?: number } = {}): Promise<Report> {
    const data = await request<Report>(`/api/reports/${period}`, {
      query: { days: options.days },
      timeoutMs: 45_000,
    });
    return data;
  },
};

// ---------------------------------------------------------------
// Users (ADMIN only)
// ---------------------------------------------------------------

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserInput {
  name?: string;
  role?: UserRole;
  isActive?: boolean;
  password?: string;
}

export const usersApi = {
  async list(): Promise<UserDto[]> {
    const data = await request<UserDto[] | { users: UserDto[] }>('/api/users');
    return Array.isArray(data) ? data : data.users;
  },

  async create(input: CreateUserInput): Promise<UserDto> {
    const data = await request<UserDto>('/api/users', { method: 'POST', body: input });
    return data;
  },

  async update(id: string, input: UpdateUserInput): Promise<UserDto> {
    if (input.password) {
      await request<{ ok: boolean }>(`/api/users/${encodeURIComponent(id)}/password`, {
        method: 'PATCH',
        body: { password: input.password },
      });
      return { id: Number(id), email: '', name: '', role: 'OPERATOR', createdAt: '' } as UserDto;
    }
    if (input.role) {
      const data = await request<UserDto>(`/api/users/${encodeURIComponent(id)}/role`, {
        method: 'PATCH',
        body: { role: input.role },
      });
      return data;
    }
    return { id: Number(id), email: '', name: '', role: 'OPERATOR', createdAt: '' } as UserDto;
  },

  async remove(id: string): Promise<void> {
    await request<{ deleted: boolean }>(`/api/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async exportText(): Promise<string> {
    const users = await this.list();
    const lines = users.map((u) => `${u.email}\t${u.name}\t${u.role}\t[redacted — bcrypt digest, not exportable]`);
    return `BECS HVAC Credentials File\n============================\n\n${lines.join('\n')}\n\nTotal accounts: ${users.length}\n`;
  },
};

// ---------------------------------------------------------------
// Settings
// ---------------------------------------------------------------

export interface AppSettings {
  scanSubnet: string;
  autoScanEnabled: boolean;
  historyRetentionDays: number;
}

export const settingsApi = {
  async get(): Promise<AppSettings> {
    return { scanSubnet: '192.168.137', autoScanEnabled: true, historyRetentionDays: 365 };
  },

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    return { scanSubnet: '192.168.137', autoScanEnabled: true, historyRetentionDays: 365, ...patch };
  },
};

// ---------------------------------------------------------------
// Health
// ---------------------------------------------------------------

export const healthApi = {
  async check(): Promise<{ status: string; database: string; databaseLatencyMs: number | null }> {
    return request<{ status: string; database: string; databaseLatencyMs: number | null }>('/api/health', {
      timeoutMs: 8_000,
    });
  },
};