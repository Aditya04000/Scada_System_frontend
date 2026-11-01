# BECS HVAC Control System

A full-stack SCADA dashboard for monitoring and controlling HVAC infrastructure across a fleet of ESP32 microcontrollers.

## Architecture

The system uses a split-data architecture to ensure cloud persistence and local hardware responsiveness.

| Path | Protocol | Purpose |
| :--- | :--- | :--- |
| **Browser → ESP32** | HTTP (LAN) | Live telemetry, valve commands, relay control. |
| **Browser → Backend** | HTTPS | Authentication, saving alarms, storing audit logs. |
| **Backend → Database** | PostgreSQL | Persistent storage for users, devices, and history. |

## Features

- **Real-Time Monitoring:** 3-second polling for live temperature and humidity.
- **Automation:** Rule-based logic to control valves automatically.
- **Smart Alarms:** 60-second debounce on threshold breaches to prevent sensor-spike spam.
- **mDNS Discovery:** Automatic device matching via hostnames (e.g., `my-esp32-01.local`).
- **Role-Based Access:** Separate Admin and Operator permissions.

## Tech Stack

| Category | Technologies |
| :--- | :--- |
| **Frontend** | React, TypeScript, Vite, Tailwind CSS, Recharts |
| **Backend** | Node.js, Express, JSON Web Tokens (JWT) |
| **Database** | PostgreSQL |
| **Hardware** | ESP32, DHT11, Servo Motors, Relays |

## Local Development Setup

### Prerequisites
- Node.js (v18+)
- PostgreSQL (v14+)
- Arduino IDE

### 1. Database
Create a local PostgreSQL database:
```sql
CREATE DATABASE becs_hvac;

2. Backend
bash
cd backend
npm install
Create a .env file in the backend/ directory:

env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/becs_hvac
JWT_SECRET=generate_a_random_string
ADMIN_EMAIL=admin@becs-hvac.com
ADMIN_PASSWORD=admin123
PORT=4000
NODE_ENV=development
Initialize the database and start the server:

bash
npm run seed
npm start
(Backend runs on http://localhost:4000)

3. Frontend
bash
cd frontend
npm install
Create a .env file in the frontend/ directory:

env
VITE_API_URL=http://localhost:4000
Start the development server:

bash
npm run dev
(Frontend runs on http://localhost:3000)

Cloud Deployment
To run this in production, use the following hosting setup:

Component	Provider	Notes
Database	Aiven	Use the free PostgreSQL tier. Remove ?sslmode=require from the URI.
Backend	Render	Link your GitHub repo. Set DATABASE_URL, JWT_SECRET, and admin credentials.
Frontend	Vercel	Link your GitHub repo. Set VITE_API_URL to the Render backend URL.
ESP32 Firmware
The ESP32 boards run a lightweight web server.

Required Endpoints:

GET /api/telemetry

POST /api/servo

POST /api/relay

mDNS Configuration:
Each board must broadcast a unique hostname that matches the dashboard:

cpp
const char* DEVICE_HOSTNAME = "my-esp32-01"; 
Known Limitations
HTTPS/HTTP Restrictions: Browsers block HTTPS pages (Vercel) from talking to HTTP hardware (ESP32). For live control, the frontend must be run locally on the plant network.

Polling Overhead: 3-second HTTP polling is fine for 11 devices, but WebSockets should be implemented for fleets larger than 50 devices.
