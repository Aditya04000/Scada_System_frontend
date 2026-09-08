export type NavTab = 
  | 'LOGIN'
  | 'REAL TIME DATA'
  | 'ALARM'
  | 'AUTOMATION'
  | 'GRAPH'
  | 'ESP32 CONFIG'
  | 'DHU CONTROL'
  | 'ALARM REPORT'
  | 'AUDIT LOG'
  | 'LOGOUT';

export type UserRole = 'ADMIN' | 'OPERATOR';

export interface UserAccount {
  id: string;
  email: string;
  passwordHash: string; // In production stored as hash or encrypted
  role: UserRole;
  name: string;
  createdAt: string;
}

// Who did what, when — separate from AutomationLog, which is about device
// behavior. This is specifically for user accountability.
export interface AuditLogEntry {
  id: string;
  user: string; // display name or email of whoever performed the action
  role: UserRole;
  action: string; // e.g. "AHU Power ON", "Device Added", "Hostname Changed"
  target: string; // device id, or "System" for non-device actions
  details: string;
  timestamp: number;
  dateTime: string;
}

export interface DeviceData {
  id: string; // e.g. "Device 1"
  name: string;
  roomName: string;
  ipAddress: string; // e.g. "192.168.1.101" — auto-discovered, may change
  hostname?: string; // e.g. "my-esp32-01" -> resolves to my-esp32-01.local. Set once, used forever — takes priority over ipAddress since it survives IP changes.
  macAddress: string;
  pingMs: number;
  firmwareVersion: string;
  tempMax: number;
  tempReal: number | null; // null when ESP32 is disconnected (displays "......")
  tempMin: number;
  humidityMax: number;
  humidityReal: number | null; // null when ESP32 is disconnected (displays "......")
  humidityMin: number;
  // 2 Motor Control Systems per Device (Hot Water Supply & Cold Water Supply)
  hotValvePercent: 0 | 25 | 50 | 75 | 100;
  coldValvePercent: 0 | 25 | 50 | 75 | 100;
  hotValveAngle: number;  // 0-180 degrees
  coldValveAngle: number; // 0-180 degrees
  isOnline: boolean;
  mode: 'AUTO' | 'MANUAL';
  // Simple ON/OFF relay switches — 3 physical relays wired to the ESP32:
  // 1x AHU power relay (master on/off for the AHU unit) + 2x DHU relays
  // (Dehumidification Unit — no percentage/PID, just on/off).
  ahuPowerOn: boolean;
  dhu1On: boolean;
  dhu2On: boolean;
  // Closed-loop auto adjustment settings (ESP32 Onboard Microprocessor Loop)
  autoAdjustEnabled: boolean;
  targetTempSetpoint: number; // e.g. 23.0 °C
  targetHumSetpoint: number;  // e.g. 50.0 %
  lastUpdated: string;
}

export interface AlarmLog {
  id: string;
  alarmName: string;
  device: string;
  ipAddress?: string;
  parameter: 'Temperature' | 'Humidity' | 'Servo Motor Jam' | 'Power Supply' | 'ESP32 Wi-Fi Offline';
  lowHigh: 'Low' | 'High' | 'Warning' | 'Critical';
  value: string;
  timeDate: string;
  timestamp: number; // Epoch milliseconds for 1-year retention calculations
  category: 'REALTIME' | 'PAST';
  acknowledged: boolean;
  clearedAt?: string;
}

export interface AutomationLog {
  id: string;
  device: string;
  ipAddress?: string;
  parameter: 'Hot Supply Motor' | 'Cold Supply Motor' | 'Device Power' | 'Humidity Control';
  anglePercent: string; // e.g. "50%" or "90°"
  timePeriod: string;
  triggerReason: string; // e.g. "Auto PID: Temp < Target (Heating)" or "Manual Operator Override"
  date: string;
}

export interface AutomationRule {
  id: string;
  device: string;
  parameter: 'Temperature' | 'Humidity';
  condition: 'GREATER_THAN' | 'LESS_THAN';
  threshold: number;
  targetSupply: 'HOT' | 'COLD';
  targetValvePercent: 0 | 25 | 50 | 75 | 100;
  enabled: boolean;
}

export interface HistoryDataPoint {
  time: string;
  timestamp: number;
  device: string;
  temperature: number;
  humidity: number;
  hotServoAngle: number;
  coldServoAngle: number;
}
