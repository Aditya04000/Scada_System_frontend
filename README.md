# BECS HVAC Control System

A production-grade, full-stack SCADA (Supervisory Control and Data Acquisition) dashboard designed to monitor and control HVAC infrastructure across a distributed fleet of ESP32 microcontrollers.

This system replaces traditional, localized SCADA software with a modern web-based hybrid architecture: live hardware control happens directly over the local network for zero-latency response, while configuration, users, alarms, and audit logs are securely persisted to a cloud PostgreSQL database.

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Core Features](#core-features)
3. [Tech Stack](#tech-stack)
4. [Database Schema](#database-schema)
5. [API Reference](#api-reference)
6. [Alarm Lifecycle Logic](#alarm-lifecycle-logic)
7. [ESP32 Hardware & Firmware](#esp32-hardware--firmware)
8. [Local Development Setup](#local-development-setup)
9. [Cloud Deployment Guide](#cloud-deployment-guide)
10. [Known Limitations](#known-limitations)

---

## System Architecture

The application is deliberately split into two distinct data paths:

1. **Local Control Path (Browser ↔ ESP32):** The React frontend communicates directly with the ESP32 boards over local Wi-Fi via HTTP. This handles 3-second telemetry polling, servo motor commands, and relay switching. Because cloud servers cannot reach private plant networks, this real-time communication must happen locally.
2. **Cloud Data Path (Browser ↔ Backend ↔ Database):** The frontend communicates with a Node.js/Express backend hosted on Render via HTTPS. This handles authentication, saving device configurations, writing alarms to history, and storing audit logs in a PostgreSQL database (hosted on Aiven).

---

## Core Features

- **Real-Time Monitoring:** Live temperature and humidity readings, valve positions, and relay statuses updated every 3 seconds.
- **Automated Control:** Rule-based automation that runs locally to adjust physical hardware.
- **Smart Alarming:** A 60-second debounce prevents sensor-spike spam. Acknowledging an alarm silences the notification but keeps it active until resolved.
- **mDNS Device Discovery:** ESP32s automatically bind to the dashboard using unique hostnames (`my-esp32-01.local`), eliminating manual IP configuration.
- **Role-Based Access Control (RBAC):** Strict separation between `ADMIN` and `OPERATOR` permissions.
- **Comprehensive Audit Logging:** Every critical action is tracked with a timestamp, user attribution, and IP address.

---

## Tech Stack

| Domain | Technologies |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS 4, Recharts, jsPDF |
| **Backend** | Node.js, Express, JSON Web Tokens (HTTP-only cookies), scrypt (hashing) |
| **Database** | PostgreSQL (Aiven) |
| **Hardware** | ESP32, DHT11/22, Servo Motors, Relays, ESPmDNS |

---

## Database Schema

The PostgreSQL database consists of six primary tables:

- **`users`**: Stores accounts, roles (`ADMIN`/`OPERATOR`), and scrypt password hashes.
- **`devices`**: Stores device configurations, IP addresses, mDNS hostnames, MAC addresses, and threshold limits.
- **`alarms`**: Stores the full lifecycle of threshold breaches (Realtime vs. Past).
- **`audit_log`**: Tracks who did what, and when.
- **`automation_rules`**: Stores conditional logic rules created by operators.
- **`automation_log`**: Records the history of automated valve movements and relay switches.

---

## API Reference

All routes except `/api/auth/*` and `/api/health` require a valid HTTP-only session cookie.

### Authentication (`/api/auth`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/login` | Public | Authenticates user, sets HTTP-only cookie. |
| `POST` | `/logout` | Public | Revokes session. |
| `GET` | `/me` | Auth | Returns current user profile. |

### Devices (`/api/devices`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Auth | List all devices. |
| `POST` | `/` | Admin | Create a new device slot. |
| `PATCH` | `/:id` | Admin | Update device config. |
| `DELETE` | `/:id` | Admin | Remove a device. |
| `POST` | `/bind` | Auth | Bind a discovered ESP32 via MAC/Hostname. |

### Alarms (`/api/alarms`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Auth | List all alarms (Realtime & Past). |
| `POST` | `/` | Auth | Raise a new alarm. |
| `PATCH` | `/:id/ack` | Auth | Acknowledge an alarm. |
| `POST` | `/resolve` | Auth | Mark alarms as resolved. |

---

## Alarm Lifecycle Logic

The system uses a specific lifecycle to prevent operator fatigue and database spam:

1. **Breach Detected:** The temperature crosses the configured threshold.
2. **Debounce Timer:** A 60-second timer starts. If the temperature drops back to normal within this window, the alarm is cancelled and never saved.
3. **Persistence:** If the breach lasts 60 seconds, it is written to the database as `REALTIME`, and a beep sounds in the browser.
4. **Acknowledgment (ACK):** The operator clicks "ACK". The beep stops, and the alarm is marked as acknowledged, but **it stays in the REALTIME tab**.
5. **Resolution:** When the physical temperature drops back below the threshold, the alarm automatically moves to the `PAST` tab with a `cleared_at` timestamp.

---

## ESP32 Hardware & Firmware

The ESP32 runs a lightweight web server. The firmware exposes the following endpoints:

- `GET /api/telemetry` - Returns JSON with temp, humidity, and valve states.
- `POST /api/servo` - Moves the physical servo `{"type": "hot", "percent": 50}`.
- `POST /api/relay` - Toggles relays `{"relay": "AHU", "on": true}`.
- `POST /api/mode` - Toggles the local Auto-PID loop.

### Wiring Reference
| GPIO | Connected To |
| :--- | :--- |
| 2 | DHT11 Data Pin |
| 18 | Hot Supply Servo |
| 19 | Cold Supply Servo |
| 26 | Relay 1 (AHU Power) |
| 27 | Relay 2 (DHU 1) |
| 14 | Relay 3 (DHU 2) |

### mDNS Configuration
To ensure the dashboard finds the device without hardcoding IPs, the firmware must broadcast a unique hostname matching the device number:
```cpp
const char* DEVICE_HOSTNAME = "my-esp32-01"; // For "Device 1"



Local Development Setup
Prerequisites
Node.js (v18+)

PostgreSQL (v14+)

Arduino IDE (for ESP32)

1. Database Setup
Create a local database:

sql
CREATE DATABASE becs_hvac;
2. Backend Setup
bash
cd backend
npm install
Create a .env file in the backend/ directory:

env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/becs_hvac
JWT_SECRET=generate_a_long_random_string_here
ADMIN_EMAIL=admin@becs-hvac.com
ADMIN_PASSWORD=admin123
PORT=4000
NODE_ENV=development
Initialize the database and start the server:

bash
npm run seed  # Creates tables, admin user, and 11 default devices
npm start     # Starts server on http://localhost:4000
3. Frontend Setup
bash
cd frontend
npm install
Create a .env file in the frontend/ directory:

env
VITE_API_URL=http://localhost:4000
Start the development server:

bash
npm run dev   # Opens http://localhost:3000
Cloud Deployment Guide
To run this in production, use the following hosting setup:

1. Database (Aiven)
Create a free PostgreSQL instance on Aiven.

Copy the "Service URI".

Important: Remove ?sslmode=require from the end of the URI. The backend db.js handles SSL internally to avoid connection errors.

2. Backend (Render)
Create a Web Service pointing to your GitHub backend repo.

Add an Environment Group containing DATABASE_URL (your Aiven URI).

Link the Environment Group to your Render service. (Do not add a service-level DATABASE_URL variable, or it will override the group).

Add JWT_SECRET, ADMIN_EMAIL, and ADMIN_PASSWORD to the environment variables.

Build command: npm install | Start command: npm start.

3. Frontend (Vercel)
Create a Project on Vercel pointing to your frontend repo.

Set the environment variable VITE_API_URL to your Render URL (e.g., https://your-backend.onrender.com).

Deploy.

Known Limitations
Mixed Content Blocking (HTTPS/HTTP): Browsers block secure HTTPS pages (Vercel) from making requests to insecure HTTP hardware (ESP32). For live hardware control, the frontend must be run locally on the plant network. To bypass this for remote control, a Cloudflare Tunnel or local VPN is required.

Polling Overhead: The app currently uses 3-second HTTP polling to fetch telemetry. While this is fine for 11 devices, implementing WebSockets is recommended for fleets larger than 50 devices to reduce network overhead.
