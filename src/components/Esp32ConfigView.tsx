import React, { useEffect, useState } from 'react';
import { DeviceData, UserRole } from '../types';
import { Wifi, Cpu, RefreshCw, Check, Copy, Terminal, Edit2, Lock, ShieldCheck, Plus, Trash2 } from 'lucide-react';
import { AdminCredentialsView } from './AdminCredentialsView';
import { pingDevice } from '../services/esp32Api';

interface Esp32ConfigViewProps {
  devices: DeviceData[];
  userRole?: UserRole;
  onUpdateDeviceIp: (deviceId: string, newIp: string) => void;
  onUpdateDeviceName?: (deviceId: string, newName: string) => void;
  onUpdateDeviceHostname?: (deviceId: string, newHostname: string) => void;
  onToggleAutoAdjust: (deviceId: string, enabled: boolean) => void;
  onToggleDeviceOnline?: (deviceId: string) => void;
  onScanNetwork?: (
    subnetPrefix: string
  ) => Promise<{ found: number; assigned: number; updated: number; messages: string[] }>;
  onRefreshDeviceIP?: (deviceId: string) => Promise<boolean>;
  lastScanResult?: {
    found: number;
    assigned: number;
    updated: number;
    messages: string[];
    timestamp: string;
    automatic: boolean;
  } | null;
  isAutoScanEnabled?: boolean;
  onAddDevice?: (name: string, roomName: string) => void;
  onRemoveDevice?: (deviceId: string) => void;
  maxDevices?: number;
  scanSubnet?: string;
  onScanSubnetChange?: (value: string) => void;
}

export const Esp32ConfigView: React.FC<Esp32ConfigViewProps> = ({
  devices,
  userRole = 'OPERATOR',
  onUpdateDeviceIp,
  onUpdateDeviceName,
  onUpdateDeviceHostname,
  onToggleAutoAdjust,
  onToggleDeviceOnline,
  onScanNetwork,
  onRefreshDeviceIP,
  lastScanResult,
  isAutoScanEnabled = false,
  onAddDevice,
  onRemoveDevice,
  maxDevices = 500,
  scanSubnet,
  onScanSubnetChange,
}) => {
  const [selectedDevId, setSelectedDevId] = useState<string>('Device 1');
  const [ipInput, setIpInput] = useState<string>('192.168.1.101');
  const [hostnameInput, setHostnameInput] = useState<string>('');
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newDeviceRoom, setNewDeviceRoom] = useState('');
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingHostname, setIsEditingHostname] = useState(false);
  const [nameInput, setNameInput] = useState<string>('Device 1');
  const [pingingId, setPingingId] = useState<string | null>(null);
  const [pingResults, setPingResults] = useState<Record<string, { ok: boolean; latencyMs: number }>>({});
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeTabSub, setActiveTabSub] = useState<'IP_MANAGER' | 'FIRMWARE_CODE' | 'USER_CREDENTIALS_FILE'>('IP_MANAGER');
  const [subnetPrefix, setSubnetPrefix] = useState<string>(scanSubnet || '192.168.137');
  const [isManualScanning, setIsManualScanning] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  useEffect(() => {
    if (scanSubnet) setSubnetPrefix(scanSubnet);
  }, [scanSubnet]);

  const handleSubnetChange = (val: string) => {
    setSubnetPrefix(val);
    onScanSubnetChange?.(val);
  };

  const handleScanClick = async () => {
    if (!onScanNetwork) return;
    setIsManualScanning(true);
    try {
      await onScanNetwork(subnetPrefix);
    } finally {
      setIsManualScanning(false);
    }
  };

  const handleRefreshDeviceIP = async (deviceId: string) => {
    if (!onRefreshDeviceIP) return;
    setRefreshingId(deviceId);
    try {
      await onRefreshDeviceIP(deviceId);
    } finally {
      setRefreshingId(null);
    }
  };

  const selectedDevice = devices.find((d) => d.id === selectedDevId) || devices[0];

  // Helper: generate mDNS hostname from device ID
  const generateHostname = (deviceId: string): string => {
    const num = parseInt(deviceId.replace(/\D/g, '')) || 0;
    if (num > 0) {
      return `my-esp32-${String(num).padStart(2, '0')}`;
    }
    return '';
  };

  const handleSelectDevice = (dev: DeviceData) => {
    setSelectedDevId(dev.id);
    setIpInput(dev.ipAddress);
    setNameInput(dev.name || dev.id);
    
    // Auto-assign mDNS hostname if not set
    const deviceNum = parseInt(dev.id.replace(/\D/g, '')) || 0;
    if (dev.hostname) {
      setHostnameInput(dev.hostname.replace(/\.local$/, ''));
    } else if (deviceNum > 0) {
      const autoHostname = `my-esp32-${String(deviceNum).padStart(2, '0')}`;
      setHostnameInput(autoHostname);
      if (onUpdateDeviceHostname) {
        onUpdateDeviceHostname(dev.id, autoHostname);
      }
    } else {
      setHostnameInput('');
    }
    
    setIsEditingName(false);
    setIsEditingHostname(false);
  };

  const handleSaveName = () => {
    if (userRole === 'ADMIN' && onUpdateDeviceName && nameInput.trim()) {
      onUpdateDeviceName(selectedDevId, nameInput.trim());
    }
    setIsEditingName(false);
  };

  const handleSaveHostname = () => {
    if (userRole === 'ADMIN' && onUpdateDeviceHostname) {
      onUpdateDeviceHostname(selectedDevId, hostnameInput.trim());
    }
    setIsEditingHostname(false);
  };

  const handlePingDevice = async (dev: DeviceData) => {
    setPingingId(dev.id);
    const result = await pingDevice(dev.ipAddress);
    setPingResults((prev) => ({
      ...prev,
      [dev.id]: result,
    }));
    setPingingId(null);
  };

  const esp32FirmwareCode = `/*
  BECS HVAC — ESP32 Node Firmware
  --------------------------------
  Pins:
    GPIO 2   -> DHT11 DATA         (1 pin: Temp + Humidity)
    GPIO 18  -> Hot Supply Servo   (Servo 1)
    GPIO 19  -> Cold Supply Servo  (Servo 2)
    GPIO 26  -> Relay 1 = AHU Power
    GPIO 27  -> Relay 2 = DHU 1
    GPIO 14  -> Relay 3 = DHU 2

  Libraries needed (Library Manager):
    - ESP32Servo
    - DHT sensor library (Adafruit) + Adafruit Unified Sensor
    - ArduinoJson (v6)
    - ESPmDNS (bundled with the ESP32 board package — no separate install)

  mDNS: this device also answers at http://DEVICE_HOSTNAME.local — set
  DEVICE_HOSTNAME below to something unique per physical board (e.g.
  "my-esp32-01"). Once set in the dashboard's ESP32 CONFIG page too, the
  connection survives the IP changing — no re-typing an IP ever again.

  Exposes over WiFi (same LAN as the dashboard):
    GET  /api/telemetry
    POST /api/servo      { "type": "hot"|"cold", "percent": 0|25|50|75|100 }
    POST /api/mode        { "autoAdjust": true|false }
    POST /api/setpoint    { "targetTemp": number, "targetHum": number }
    POST /api/relay       { "relay": "AHU"|"DHU1"|"DHU2", "on": true|false }
*/

#include <WiFi.h>
#include <WebServer.h>
#include <ESP32Servo.h>
#include <DHT.h>
#include <ArduinoJson.h>
#include <ESPmDNS.h>

// ---------- WiFi ----------
const char* WIFI_SSID = "ADITYA_";
const char* WIFI_PASS = "Aditya123";

// Unique per physical board — e.g. "my-esp32-01", "my-esp32-02", ...
// Must match the hostname entered in the dashboard's ESP32 CONFIG page.
const char* DEVICE_HOSTNAME = "my-esp32-01";

// ---------- Pins ----------
#define DHT_PIN        2    // GPIO 2 
#define HOT_SERVO_PIN  18
#define COLD_SERVO_PIN 19
#define RELAY_AHU_PIN  26
#define RELAY_DHU1_PIN 27
#define RELAY_DHU2_PIN 14

#define DHT_TYPE DHT11    

DHT dht(DHT_PIN, DHT_TYPE);
Servo hotServo;
Servo coldServo;
WebServer server(80);

// ---------- Live state ----------
float tempReal = NAN;
float humidityReal = NAN;

int hotValvePercent = 0;
int coldValvePercent = 0;
int hotValveAngle = 0;
int coldValveAngle = 0;

bool autoAdjustEnabled = true;
float targetTempSetpoint = 23.0;
float targetHumSetpoint = 50.0;

bool ahuPowerOn = false;
bool dhu1On = false;
bool dhu2On = false;

unsigned long lastSensorRead = 0;
unsigned long lastSerialPrint = 0;
const unsigned long SENSOR_INTERVAL_MS = 2000;
const unsigned long SERIAL_INTERVAL_MS = 5000;

// ---------- Helpers ----------
void setCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

void applyRelay(int pin, bool on) {
  digitalWrite(pin, on ? LOW : HIGH);
}

void setHotValve(int percent) {
  hotValvePercent = percent;
  hotValveAngle = (percent * 180) / 100;
  hotServo.write(hotValveAngle);
}

void setColdValve(int percent) {
  coldValvePercent = percent;
  coldValveAngle = (percent * 180) / 100;
  coldServo.write(coldValveAngle);
}

void runAutoAdjust() {
  if (!autoAdjustEnabled || isnan(tempReal)) return;

  if (tempReal > targetTempSetpoint + 0.5) {
    setColdValve(75);
    setHotValve(0);
  } else if (tempReal < targetTempSetpoint - 0.5) {
    setHotValve(75);
    setColdValve(0);
  } else {
    setHotValve(25);
    setColdValve(25);
  }
}

void handleTelemetry() {
  setCorsHeaders();
  StaticJsonDocument<512> doc;

  doc["ip"] = WiFi.localIP().toString();
  doc["mac"] = WiFi.macAddress();
  doc["firmwareVersion"] = "ESP32-HVAC-v2.5.0";
  doc["hostname"] = DEVICE_HOSTNAME;

  if (isnan(tempReal)) doc["tempReal"] = nullptr; else doc["tempReal"] = (double)tempReal;
  if (isnan(humidityReal)) doc["humidityReal"] = nullptr; else doc["humidityReal"] = (double)humidityReal;

  doc["hotValvePercent"] = hotValvePercent;
  doc["coldValvePercent"] = coldValvePercent;
  doc["hotValveAngle"] = hotValveAngle;
  doc["coldValveAngle"] = coldValveAngle;

  doc["autoAdjustEnabled"] = autoAdjustEnabled;
  doc["targetTempSetpoint"] = targetTempSetpoint;
  doc["targetHumSetpoint"] = targetHumSetpoint;

  doc["ahuPowerOn"] = ahuPowerOn;
  doc["dhu1On"] = dhu1On;
  doc["dhu2On"] = dhu2On;

  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

void handleServo() {
  setCorsHeaders();
  if (server.method() == HTTP_OPTIONS) { server.send(204); return; }

  StaticJsonDocument<200> doc;
  if (deserializeJson(doc, server.arg("plain"))) {
    server.send(400, "application/json", "{\"error\":\"bad json\"}");
    return;
  }

  String type = doc["type"] | "";
  int percent = doc["percent"] | 0;

  autoAdjustEnabled = false;

  if (type == "hot") setHotValve(percent);
  else if (type == "cold") setColdValve(percent);
  else { server.send(400, "application/json", "{\"error\":\"bad type\"}"); return; }

  server.send(200, "application/json", "{\"ok\":true}");
}

void handleMode() {
  setCorsHeaders();
  if (server.method() == HTTP_OPTIONS) { server.send(204); return; }

  StaticJsonDocument<100> doc;
  if (deserializeJson(doc, server.arg("plain"))) {
    server.send(400, "application/json", "{\"error\":\"bad json\"}");
    return;
  }
  autoAdjustEnabled = doc["autoAdjust"] | true;
  server.send(200, "application/json", "{\"ok\":true}");
}

void handleSetpoint() {
  setCorsHeaders();
  if (server.method() == HTTP_OPTIONS) { server.send(204); return; }

  StaticJsonDocument<200> doc;
  if (deserializeJson(doc, server.arg("plain"))) {
    server.send(400, "application/json", "{\"error\":\"bad json\"}");
    return;
  }
  if (!doc["targetTemp"].isNull()) targetTempSetpoint = doc["targetTemp"];
  if (!doc["targetHum"].isNull()) targetHumSetpoint = doc["targetHum"];
  server.send(200, "application/json", "{\"ok\":true}");
}

void handleRelay() {
  setCorsHeaders();
  if (server.method() == HTTP_OPTIONS) { server.send(204); return; }

  StaticJsonDocument<200> doc;
  if (deserializeJson(doc, server.arg("plain"))) {
    server.send(400, "application/json", "{\"error\":\"bad json\"}");
    return;
  }

  String relay = doc["relay"] | "";
  bool on = doc["on"] | false;

  if (relay == "AHU") { ahuPowerOn = on; applyRelay(RELAY_AHU_PIN, on); }
  else if (relay == "DHU1") { dhu1On = on; applyRelay(RELAY_DHU1_PIN, on); }
  else if (relay == "DHU2") { dhu2On = on; applyRelay(RELAY_DHU2_PIN, on); }
  else { server.send(400, "application/json", "{\"error\":\"bad relay\"}"); return; }

  server.send(200, "application/json", "{\"ok\":true}");
}

void handleOptions() {
  setCorsHeaders();
  server.send(204);
}

void setup() {
  Serial.begin(115200);
  
  dht.begin();
  Serial.println();
  Serial.println("=========================================");
  Serial.println("BECS HVAC - ESP32 Node");
  Serial.println("=========================================");
  Serial.print("Sensor: ");
  #ifdef DHT11
    Serial.println("DHT11");
  #elif defined(DHT22)
    Serial.println("DHT22");
  #endif
  Serial.print("Sensor Pin: GPIO ");
  Serial.println(DHT_PIN);
  Serial.println("=========================================");
  Serial.println();

  pinMode(RELAY_AHU_PIN, OUTPUT);
  pinMode(RELAY_DHU1_PIN, OUTPUT);
  pinMode(RELAY_DHU2_PIN, OUTPUT);
  applyRelay(RELAY_AHU_PIN, false);
  applyRelay(RELAY_DHU1_PIN, false);
  applyRelay(RELAY_DHU2_PIN, false);

  ESP32PWM::allocateTimer(0);
  ESP32PWM::allocateTimer(1);
  hotServo.setPeriodHertz(50);
  coldServo.setPeriodHertz(50);
  hotServo.attach(HOT_SERVO_PIN, 500, 2400);
  coldServo.attach(COLD_SERVO_PIN, 500, 2400);
  setHotValve(0);
  setColdValve(0);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  Serial.print(" Connected! IP: ");
  Serial.println(WiFi.localIP());

  if (MDNS.begin(DEVICE_HOSTNAME)) {
    MDNS.addService("http", "tcp", 80);
    Serial.print(" mDNS active: http://");
    Serial.print(DEVICE_HOSTNAME);
    Serial.println(".local");
  } else {
    Serial.println("  mDNS failed to start — falling back to IP-only.");
  }

  server.on("/api/telemetry", HTTP_GET, handleTelemetry);
  server.on("/api/telemetry", HTTP_OPTIONS, handleOptions);
  server.on("/api/servo", HTTP_POST, handleServo);
  server.on("/api/servo", HTTP_OPTIONS, handleOptions);
  server.on("/api/mode", HTTP_POST, handleMode);
  server.on("/api/mode", HTTP_OPTIONS, handleOptions);
  server.on("/api/setpoint", HTTP_POST, handleSetpoint);
  server.on("/api/setpoint", HTTP_OPTIONS, handleOptions);
  server.on("/api/relay", HTTP_POST, handleRelay);
  server.on("/api/relay", HTTP_OPTIONS, handleOptions);

  server.begin();
  
  Serial.println(" Web server started!");
  Serial.println("=========================================");
  Serial.println("System Ready!");
  Serial.println("=========================================");
  Serial.println();
}

void loop() {
  server.handleClient();

  unsigned long now = millis();
  
  if (now - lastSensorRead >= SENSOR_INTERVAL_MS) {
    lastSensorRead = now;
    
    int retryCount = 0;
    float h = NAN;
    float t = NAN;
    bool sensorReadSuccess = false;
    
    while (retryCount < 3 && !sensorReadSuccess) {
      h = dht.readHumidity();
      t = dht.readTemperature();
      
      if (!isnan(h) && !isnan(t)) {
        sensorReadSuccess = true;
        break;
      }
      retryCount++;
      delay(10);
    }
    
    if (sensorReadSuccess) {
      humidityReal = h;
      tempReal = t;
      runAutoAdjust();
    }
  }
  
  if (now - lastSerialPrint >= SERIAL_INTERVAL_MS) {
    lastSerialPrint = now;
    
    if (!isnan(tempReal) && !isnan(humidityReal)) {
      Serial.print(" ");
      Serial.print("Temp: ");
      Serial.print(tempReal, 1);
      Serial.print("°C | Hum: ");
      Serial.print(humidityReal, 1);
      Serial.print("% | Auto: ");
      Serial.print(autoAdjustEnabled ? "ON " : "OFF");
      Serial.print(" | Hot: ");
      Serial.print(hotValvePercent);
      Serial.print("% | Cold: ");
      Serial.print(coldValvePercent);
      Serial.print("% | Relays: AHU=");
      Serial.print(ahuPowerOn ? "ON" : "OFF");
      Serial.print(", DHU1=");
      Serial.print(dhu1On ? "ON" : "OFF");
      Serial.print(", DHU2=");
      Serial.print(dhu2On ? "ON" : "OFF");
      
      if (autoAdjustEnabled) {
        if (tempReal > targetTempSetpoint + 0.5) {
          Serial.print("  COOLING");
        } else if (tempReal < targetTempSetpoint - 0.5) {
          Serial.print("  HEATING");
        } else {
          Serial.print("  TEMP OK");
        }
      }
      Serial.println();
    } else {
      Serial.println("  Waiting for sensor data...");
    }
  }
}

`;

  const copyFirmwareCode = () => {
    navigator.clipboard.writeText(esp32FirmwareCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="w-full min-h-[calc(100vh-60px)] bg-[#181a22] p-4 md:p-8 text-white font-sans select-none">
      {/* View Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-gray-700 pb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-widest uppercase text-gray-200 font-sans flex items-center gap-3">
            <Wifi className="w-7 h-7 text-emerald-400" />
            <span>ESP32 HARDWARE & NETWORK CONFIGURATION</span>
          </h1>
          <p className="text-xs text-gray-400 font-mono mt-1">
            Configure ESP32 Wi-Fi IP addresses and access flashable C++ firmware code (Admin Only).
          </p>
        </div>

        {/* Sub Navigation */}
        <div className="flex flex-wrap bg-[#12131c] border border-gray-700 rounded p-1 font-mono text-xs gap-1">
          <button
            onClick={() => setActiveTabSub('IP_MANAGER')}
            className={`px-3 py-1.5 font-bold uppercase rounded cursor-pointer ${
              activeTabSub === 'IP_MANAGER' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            DEVICE NETWORK MATRIX
          </button>
          {userRole === 'ADMIN' && (
            <button
              onClick={() => setActiveTabSub('FIRMWARE_CODE')}
              className={`px-3 py-1.5 font-bold uppercase rounded cursor-pointer flex items-center gap-1.5 ${
                activeTabSub === 'FIRMWARE_CODE'
                  ? 'bg-amber-600 text-white shadow border border-amber-400'
                  : 'text-amber-400/80 hover:text-amber-300'
              }`}
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>ESP32 FIRMWARE C++ SOURCE CODE (ADMIN ONLY)</span>
            </button>
          )}

          {userRole === 'ADMIN' && (
            <button
              onClick={() => setActiveTabSub('USER_CREDENTIALS_FILE')}
              className={`px-3 py-1.5 font-bold uppercase rounded cursor-pointer flex items-center gap-1.5 ${
                activeTabSub === 'USER_CREDENTIALS_FILE'
                  ? 'bg-amber-600 text-white shadow border border-amber-400'
                  : 'text-amber-400/80 hover:text-amber-300'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
              <span>USER CREDENTIALS FILE </span>
            </button>
          )}
        </div>
      </div>

      {activeTabSub === 'IP_MANAGER' ? (
        <div>
          {/* Manual Discovery Only - No Auto-Scan */}
          {onScanNetwork && (
            <div className="mb-6 bg-[#12131d] border border-emerald-900/70 p-4 rounded-sm shadow-xl font-mono">
              <h2 className="text-sm font-black tracking-wider uppercase text-emerald-400 mb-3 flex items-center gap-2">
                <Wifi className="w-4 h-4" />
                <span>DISCOVER ESP32 DEVICES ON NETWORK</span>
              </h2>
              <p className="text-[11px] text-gray-400 mb-3">
                SCAN NOW - Devices stay connected to their assigned slots.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-gray-400">Subnet:</span>
                  <input
                    type="text"
                    value={subnetPrefix}
                    onChange={(e) => handleSubnetChange(e.target.value)}
                    placeholder="192.168.137"
                    className="bg-[#1c1d29] border border-gray-600 text-white px-2 py-1.5 rounded w-32 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                  <span className="text-gray-500">.1–.254</span>
                </div>
                <button
                  onClick={handleScanClick}
                  disabled={isManualScanning}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold uppercase rounded border border-emerald-500 cursor-pointer transition-all"
                  title="Scan for new ESP32 devices on the network"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isManualScanning ? 'animate-spin' : ''}`} />
                  <span>{isManualScanning ? 'SCANNING...' : 'SCAN NOW'}</span>
                </button>
                <span className="text-[10px] text-gray-500">
                  Press to connect with devices
                </span>
              </div>

              {lastScanResult && (
                <div className="mt-3 bg-[#0d0e15] border border-gray-700 rounded p-3 text-xs">
                  <div className="flex flex-wrap gap-4 mb-2 font-bold items-center">
                    <span className="text-gray-500 text-[10px] uppercase">
                      Last scan: {lastScanResult.timestamp}
                    </span>
                    <span className="text-white">Found: {lastScanResult.found}</span>
                    <span className="text-emerald-400">Newly connected: {lastScanResult.assigned}</span>
                    <span className="text-blue-400">IP refreshed: {lastScanResult.updated}</span>
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto text-gray-400">
                    {lastScanResult.messages.length === 0 ? (
                      <span className="italic">No ESP32 responded on this subnet.</span>
                    ) : (
                      lastScanResult.messages.map((m, i) => <div key={i}>• {m}</div>)
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Add Device — ADMIN only, scales the fleet up to maxDevices */}
          {onAddDevice && userRole === 'ADMIN' && (
            <div className="mb-6 bg-[#12131d] border border-blue-900/70 p-4 rounded-sm shadow-xl font-mono">
              <h2 className="text-sm font-black tracking-wider uppercase text-blue-400 mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  <span>ADD DEVICE</span>
                </span>
                <span className="text-[10px] text-gray-500 normal-case font-normal">
                  {devices.length} / {maxDevices} devices
                </span>
              </h2>

              {!showAddDevice ? (
                <button
                  onClick={() => setShowAddDevice(true)}
                  disabled={devices.length >= maxDevices}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-800 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold uppercase rounded border border-blue-500 cursor-pointer transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add New Device</span>
                </button>
              ) : (
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-[10px] text-gray-400 uppercase mb-1">Device Name</label>
                    <input
                      type="text"
                      value={newDeviceName}
                      onChange={(e) => setNewDeviceName(e.target.value)}
                      placeholder="e.g. AHU-12"
                      className="bg-[#1c1d29] border border-gray-600 text-white px-2 py-1.5 rounded w-40 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 uppercase mb-1">Room / Zone</label>
                    <input
                      type="text"
                      value={newDeviceRoom}
                      onChange={(e) => setNewDeviceRoom(e.target.value)}
                      placeholder="e.g. Warehouse B"
                      className="bg-[#1c1d29] border border-gray-600 text-white px-2 py-1.5 rounded w-40 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                  <button
                    onClick={() => {
                      onAddDevice(newDeviceName, newDeviceRoom);
                      setNewDeviceName('');
                      setNewDeviceRoom('');
                      setShowAddDevice(false);
                    }}
                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold uppercase rounded cursor-pointer"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setShowAddDevice(false)}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold uppercase rounded cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
              <p className="text-[10px] text-gray-500 mt-2">
                New devices work exactly like the rest of the fleet — connect their ESP32 via a matching mDNS
                hostname or the network scan above, and it picks up a real connection automatically.
              </p>
            </div>
          )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {selectedDevice && (
          <div className="bg-[#12131d] border border-gray-700 p-5 rounded-sm shadow-xl flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-black tracking-wider uppercase text-blue-400 mb-4 flex items-center justify-between border-b border-gray-700 pb-2 font-mono">
                <span className="flex items-center gap-2">
                  <Cpu className="w-4 h-4" />
                  <span>CONFIGURE ESP32 DEVICE</span>
                </span>
                <span className="text-[10px] text-amber-300 font-normal">
                  ROLE: {userRole}
                </span>
              </h2>

              <form onSubmit={(e) => e.preventDefault()} className="space-y-4 font-mono text-xs">
                <div>
                  <label className="block text-gray-300 uppercase mb-1 font-bold flex items-center justify-between">
                    <span>Select Target Device</span>
                    {onRemoveDevice && userRole === 'ADMIN' && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Remove ${selectedDevId} permanently? This cannot be undone.`)) {
                            onRemoveDevice(selectedDevId);
                            const remaining = devices.filter((d) => d.id !== selectedDevId);
                            if (remaining[0]) handleSelectDevice(remaining[0]);
                          }
                        }}
                        className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 normal-case font-bold cursor-pointer"
                        title="Remove this device from the fleet"
                      >
                        <Trash2 className="w-3 h-3" />
                        Remove Device
                      </button>
                    )}
                  </label>
                  <select
                    value={selectedDevId}
                    onChange={(e) => {
                      const dev = devices.find((d) => d.id === e.target.value);
                      if (dev) handleSelectDevice(dev);
                    }}
                    className="w-full bg-[#1c1d29] border border-gray-600 text-white p-2 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 font-bold"
                  >
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name || d.id} — {d.roomName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* DEVICE NAME */}
                <div>
                  <label className="block text-gray-300 uppercase mb-1 font-bold flex items-center justify-between">
                    <span>Device Custom Name</span>
                    {userRole !== 'ADMIN' && (
                      <span className="text-[10px] text-gray-500 flex items-center gap-1 font-normal">
                        <Lock className="w-3 h-3" /> Admin Required
                      </span>
                    )}
                  </label>
                  {isEditingName ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        autoFocus
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                        placeholder="e.g. AHU-1 Cleanroom Alpha"
                        className="w-full bg-[#1c1d29] border border-amber-500/80 text-amber-300 p-2 rounded focus:outline-none focus:ring-1 focus:ring-amber-400 font-mono font-bold"
                      />
                      <button
                        onClick={handleSaveName}
                        className="px-2 py-2 bg-emerald-600 text-white text-[10px] font-bold rounded cursor-pointer"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between bg-[#1c1d29] border border-gray-700 p-2 rounded">
                      <span className="text-white font-bold">{selectedDevice.name || selectedDevice.id}</span>
                      {userRole === 'ADMIN' && (
                        <button
                          onClick={() => {
                            setNameInput(selectedDevice.name || selectedDevice.id);
                            setIsEditingName(true);
                          }}
                          className="text-gray-400 hover:text-amber-300 cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* mDNS Hostname — auto-assigned based on device number */}
                <div>
                  <label className="block text-gray-300 uppercase mb-1 font-bold flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Wifi className="w-3.5 h-3.5 text-cyan-400" />
                      Connection Address (mDNS)
                    </span>
                    {userRole !== 'ADMIN' && (
                      <span className="text-[10px] text-gray-500 flex items-center gap-1 font-normal">
                        <Lock className="w-3 h-3" /> Admin Required to Edit
                      </span>
                    )}
                  </label>
                  {isEditingHostname && userRole === 'ADMIN' ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        autoFocus
                        value={hostnameInput}
                        onChange={(e) => setHostnameInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveHostname()}
                        placeholder="my-esp32-01"
                        className="w-full bg-[#1c1d29] border border-cyan-500/80 text-cyan-300 p-2 rounded focus:outline-none focus:ring-1 focus:ring-cyan-400 font-mono font-bold tracking-wider"
                      />
                      <span className="text-gray-500 text-[11px] whitespace-nowrap">.local</span>
                      <button
                        onClick={handleSaveHostname}
                        className="px-2 py-2 bg-emerald-600 text-white text-[10px] font-bold rounded cursor-pointer"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between bg-[#1c1d29] border border-cyan-800/60 p-2 rounded">
                      <span className="text-cyan-300 font-bold">
                        {selectedDevice.hostname
                          ? `${selectedDevice.hostname.replace(/\.local$/, '')}.local`
                          : (() => {
                              const deviceNum = parseInt(selectedDevice.id.replace(/\D/g, '')) || 0;
                              if (deviceNum > 0) {
                                return `my-esp32-${String(deviceNum).padStart(2, '0')}.local`;
                              }
                              return 'Not assigned — run a scan to discover';
                            })()}
                      </span>
                      {userRole === 'ADMIN' && (
                        <button
                          onClick={() => {
                            setHostnameInput(
                              selectedDevice.hostname || 
                              generateHostname(selectedDevice.id)
                            );
                            setIsEditingHostname(true);
                          }}
                          className="text-gray-400 hover:text-cyan-300 cursor-pointer"
                          title="Manually set hostname"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                  <span className="text-[10px] text-gray-400 mt-1 block">
                    Hostname is auto-assigned based on device number. Once assigned, it stays permanently.
                  </span>
                </div>

                <div className="bg-[#181925] p-3 rounded border border-gray-800 space-y-2">
                  <div className="flex justify-between text-gray-300 text-[11px]">
                    <span>MAC Address:</span>
                    <span className="text-gray-400 font-bold">{selectedDevice.macAddress || '—'}</span>
                  </div>
                  <div className="flex justify-between text-gray-300 text-[11px]">
                    <span>Current IP:</span>
                    <span className="text-gray-400 font-bold">{selectedDevice.ipAddress || '—'}</span>
                  </div>
                  <div className="flex justify-between text-gray-300 text-[11px]">
                    <span>Status:</span>
                    <span className={selectedDevice.isOnline ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                      {selectedDevice.isOnline ? 'CONNECTED' : 'NOT CONNECTED'}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-300 text-[11px]">
                    <span>Firmware:</span>
                    <span className="text-cyan-400 font-bold">{selectedDevice.firmwareVersion}</span>
                  </div>
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => handlePingDevice(selectedDevice)}
                    disabled={pingingId === selectedDevice.id}
                    className="flex-1 py-2.5 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold uppercase rounded text-xs border border-emerald-500 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${pingingId === selectedDevice.id ? 'animate-spin' : ''}`} />
                    <span>TEST PING</span>
                  </button>
                  {onRefreshDeviceIP && (
                    <button
                      type="button"
                      onClick={() => handleRefreshDeviceIP(selectedDevice.id)}
                      disabled={refreshingId === selectedDevice.id}
                      className="px-3 py-2.5 bg-blue-800 hover:bg-blue-700 disabled:opacity-50 text-white font-bold uppercase rounded text-xs border border-blue-500 cursor-pointer flex items-center justify-center gap-1.5"
                      title="Refresh IP address for this device"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${refreshingId === selectedDevice.id ? 'animate-spin' : ''}`} />
                      <span>REFRESH IP</span>
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Direct REST API Endpoints Cheat Sheet */}
            <div className="mt-6 pt-4 border-t border-gray-800 text-[11px] font-mono text-gray-400 space-y-1">
              <span className="text-gray-300 font-bold block mb-1 uppercase">ESP32 REST Endpoints:</span>
              <div className="bg-[#0b0c13] p-2 rounded border border-gray-800 text-[10px] text-cyan-300 space-y-1">
                <div>GET http://{selectedDevice.hostname ? `${selectedDevice.hostname.replace(/\.local$/, '')}.local` : selectedDevice.ipAddress}/api/telemetry</div>
                <div>POST http://{selectedDevice.hostname ? `${selectedDevice.hostname.replace(/\.local$/, '')}.local` : selectedDevice.ipAddress}/api/servo</div>
              </div>
            </div>
          </div>
          )}

          {/* All Devices Connection Status */}
          <div className="lg:col-span-2 bg-[#12131d] border border-gray-700 p-5 rounded-sm shadow-xl">
            <h2 className="text-sm font-black tracking-wider uppercase text-blue-400 mb-4 flex items-center justify-between border-b border-gray-700 pb-2 font-mono">
              <span>ESP32 CONNECTION STATUS</span>
              <span className="text-xs text-emerald-400 font-normal">{devices.length} Microcontrollers</span>
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono border-collapse text-xs">
                <thead>
                  <tr className="bg-[#1a1b28] text-gray-300 border-b border-gray-700 uppercase">
                    <th className="p-2.5">Device Name</th>
                    <th className="p-2.5">ID</th>
                    <th className="p-2.5 text-center">Connected</th>
                    <th className="p-2.5 text-center">MAC Bound</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-800">
                  {devices.map((dev) => {
                    const pingResult = pingResults[dev.id];
                    return (
                      <tr
                        key={dev.id}
                        onClick={() => handleSelectDevice(dev)}
                        className={`cursor-pointer transition-colors ${
                          selectedDevId === dev.id ? 'bg-blue-950/40 border-l-2 border-blue-400' : 'hover:bg-[#181926]'
                        }`}
                      >
                        <td className="p-2.5 font-bold text-white">
                          <span>{dev.name || dev.id}</span>
                          <span className="text-[10px] text-gray-400 font-normal block">{dev.roomName}</span>
                          {pingResult && (
                            <span className={`text-[9px] ${pingResult.ok ? 'text-emerald-400' : 'text-red-400'} block`}>
                              {pingResult.ok ? `✓ ${pingResult.latencyMs}ms` : '✗ Failed'}
                            </span>
                          )}
                        </td>

                        <td className="p-2.5 font-mono font-extrabold text-cyan-300">
                          {dev.hostname ? `${dev.hostname.replace(/\.local$/, '')}.local` : (() => {
                            const deviceNum = parseInt(dev.id.replace(/\D/g, '')) || 0;
                            return deviceNum > 0 ? `my-esp32-${String(deviceNum).padStart(2, '0')}.local` : dev.ipAddress || '—';
                          })()}
                        </td>

                        <td className="p-2.5 text-center">
                          <span
                            className={`px-2 py-1 text-[10px] font-black rounded border uppercase inline-block ${
                              dev.isOnline
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-600'
                                : 'bg-red-950 text-red-300 border-red-700'
                            }`}
                          >
                            {dev.isOnline ? 'CONNECTED' : 'NOT CONNECTED'}
                          </span>
                        </td>

                        <td className="p-2.5 text-center">
                          <span className={`text-[10px] ${dev.macAddress ? 'text-cyan-400' : 'text-gray-500'}`}>
                            {dev.macAddress ? '✓' : '—'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        </div>
      ) : activeTabSub === 'FIRMWARE_CODE' ? (
        userRole === 'ADMIN' ? (
          <div className="bg-[#12131d] border border-gray-700 p-6 rounded-sm shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-700 pb-3 mb-4">
              <div>
                <h2 className="text-base font-black tracking-wider uppercase text-emerald-400 font-mono flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-emerald-400" />
                  <span>ESP32 ARDUINO C++ FIRMWARE (FLASHABLE SOURCE CODE)</span>
                </h2>
                <p className="text-xs text-gray-400 font-mono mt-0.5">
                  Flash this code onto your hardware ESP32 microcontrollers.
                </p>
              </div>

              <button
                onClick={copyFirmwareCode}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs uppercase rounded border border-emerald-400 cursor-pointer shadow transition-all"
              >
                {copiedCode ? <Check className="w-4 h-4 text-emerald-200" /> : <Copy className="w-4 h-4" />}
                <span>{copiedCode ? 'COPIED TO CLIPBOARD!' : 'COPY C++ SOURCE CODE'}</span>
              </button>
            </div>

            <pre className="p-4 bg-[#08090f] border border-gray-800 rounded font-mono text-xs text-emerald-300/90 overflow-x-auto max-h-[500px] leading-relaxed select-text">
              {esp32FirmwareCode}
            </pre>
          </div>
        ) : (
          <div className="bg-[#12131d] border border-red-800/80 p-8 rounded text-center space-y-3">
            <Lock className="w-10 h-10 text-red-500 mx-auto" />
            <h3 className="text-lg font-black text-red-400 uppercase tracking-wider font-mono">
              ADMIN ACCESS REQUIRED
            </h3>
            <p className="text-xs text-gray-400 font-mono max-w-md mx-auto">
              C++ Firmware Flashable Source Code access is restricted to ADMIN users only. Please log in with an Administrator account.
            </p>
          </div>
        )
      ) : (
        <AdminCredentialsView />
      )}
    </div>
  );
};
