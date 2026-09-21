BECS HVAC Control System
A full-stack SCADA (Supervisory Control and Data Acquisition) dashboard for monitoring and controlling HVAC systems across a fleet of ESP32-based sensor nodes.

https://vercel.com/button
https://render.com/images/deploy-to-render-button.svg

Table of Contents
Overview

Architecture

Features

Tech Stack

Project Structure

Quick Start (Local Development)

Environment Variables

Deployment

Deploy Backend to Render

Deploy Frontend to Vercel

ESP32 Firmware

API Reference

User Roles

Alarm System

Data Persistence

Troubleshooting

License

Overview
BECS HVAC is a production-grade control and monitoring system designed for facilities operating multiple HVAC zones. It provides real-time telemetry, automated valve control, alarm management, and comprehensive historical reporting through a modern browser-based interface.

Split architecture:

Persistent data (users, devices, alarms, audit logs, automation rules) → PostgreSQL via Node.js backend

Live hardware telemetry → Browser directly to ESP32 microcontrollers over LAN

This separation exists because the backend typically runs on a cloud provider (Render) that cannot reach a private plant network. Live hardware communication must happen locally.

Architecture
text
┌─────────────────┐         HTTPS          ┌──────────────────┐
│                 │ ─────────────────────▶ │                  │
│   React App     │                        │   Express API    │
│   (Browser)     │ ◀───────────────────── │   (Node.js)      │
│                 │      JSON / Cookies    │                  │
└────────┬────────┘                        └────────┬─────────┘
         │                                          │
         │ HTTP (LAN only)                          │ SQL
         │                                          │
         ▼                                          ▼
┌─────────────────┐                        ┌──────────────────┐
│  ESP32 Nodes    │                        │   PostgreSQL     │
│  (HVAC Sensors) │                        │   (Persistent)   │
└─────────────────┘                        └──────────────────┘
Data type	Path	Reason
User accounts, alarms, audit logs, rules	Browser → API → PostgreSQL	Must be shared across operators and survive restarts
Live temperature, valve commands, relay control	Browser → ESP32 directly	Backend runs on cloud, cannot reach local plant network
Features
Real-Time Monitoring
Live temperature and humidity from every ESP32 node

Visual valve position indicators (Hot/Cold supply actuators)

Online/Offline status with automatic fallback and recovery

Configurable alarm thresholds per device

Automation
Rule-based control: IF temperature > 26°C THEN set cold valve to 75%

Temperature and Humidity triggers

Automatic valve adjustment on threshold crossing

Full automation history log

Alarm Management
Realtime alarms stay visible while the underlying condition is active

Automatic resolution — alarms move to PAST when readings return to normal

Acknowledgment tracks operator awareness without clearing the alarm

No duplicate alarms for the same persistent breach

1-year retention with auto-purge

Device Management
Auto-discovery via mDNS hostname matching (my-esp32-01, my-esp32-02, …)

MAC address binding for persistent identity

Support for up to 500 devices

Per-device configuration (name, room, thresholds, setpoints)

Reporting
Daily, weekly, and monthly reports

PDF export with professional formatting

Audit log of every user action

Historical telemetry graphs

Security
HTTP-only session cookies (immune to XSS token theft)

scrypt password hashing

Role-based access control (ADMIN / OPERATOR)

Rate-limited login endpoint

Generic error messages (prevents account enumeration)

Tech Stack
Frontend

React 19 + TypeScript

Vite (build tool)

Tailwind CSS 4

Recharts (graphs)

jsPDF + autoTable (PDF reports)

lucide-react (icons)

Backend

Node.js + Express

PostgreSQL

JWT in HTTP-only cookies

scrypt password hashing (Node crypto)

express-rate-limit

Hardware

ESP32 microcontroller

DHT11 / DHT22 sensor

2× servo motors (hot/cold supply valves)

3× relays (AHU, DHU1, DHU2)

ESPmDNS for hostname resolution

Project Structure
text
becs-hvac/
│
├── frontend/                       # React application (deploy to Vercel)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx
│   │   │   ├── LoginView.tsx
│   │   │   ├── RealTimeDataView.tsx
│   │   │   ├── AutomationView.tsx
│   │   │   ├── AlarmView.tsx
│   │   │   ├── GraphView.tsx
│   │   │   ├── Esp32ConfigView.tsx
│   │   │   ├── DhuControlView.tsx
│   │   │   ├── AuditLogView.tsx
│   │   │   ├── AlarmReportView.tsx
│   │   │   ├── AdminCredentialsView.tsx
│   │   │   └── ServoVisualizerModal.tsx
│   │   ├── services/
│   │   │   ├── api.ts              # Backend API client
│   │   │   └── esp32Api.ts         # Direct ESP32 communication
│   │   ├── data/
│   │   │   ├── initialData.ts
│   │   │   └── userCredentials.ts
│   │   ├── utils/
│   │   │   └── pdfGenerator.ts
│   │   ├── types.ts
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── .env.example
│
├── backend/                        # Express API server (deploy to Render)
│   ├── config/
│   │   └── db.js                   # PostgreSQL pool
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── devicesController.js
│   │   ├── alarmsController.js
│   │   ├── auditLogController.js
│   │   ├── rulesController.js
│   │   ├── automationLogController.js
│   │   └── usersController.js
│   ├── middleware/
│   │   └── auth.js                 # requireAuth / requireAdmin
│   ├── migrations/
│   │   ├── runMigrations.js
│   │   └── 001_users.sql ... 006_automation_log.sql
│   ├── routes/
│   │   ├── auth.js
│   │   ├── devices.js
│   │   ├── alarms.js
│   │   ├── auditLog.js
│   │   ├── rules.js
│   │   ├── automationLog.js
│   │   ├── users.js
│   │   ├── reports.js
│   │   └── settings.js
│   ├── utils/
│   │   └── password.js             # scrypt hashing
│   ├── app.js
│   ├── server.js
│   ├── seed.js
│   ├── package.json
│   └── .env.example
│
├── .gitignore
└── README.md
Quick Start (Local Development)
Prerequisites
Software	Version	Purpose
Node.js	18+	Runtime for backend and build tooling
PostgreSQL	14+	Persistent data storage
pgAdmin 4	Any	Database administration (optional)
Arduino IDE	2.x	For flashing ESP32 firmware
1. Clone the Repository
bash
git clone 
cd becs-hvac
2. Set Up the Database
Open pgAdmin 4 or the psql shell and run:

sql
CREATE DATABASE becs_hvac;
3. Backend Setup
bash
cd backend
npm install
Create .env in the backend/ directory:

env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/becs_hvac
JWT_SECRET=your_long_random_secret_here_change_this
ADMIN_EMAIL=admin@becs-hvac.com
ADMIN_PASSWORD=ChangeMe123!
ADMIN_NAME=System Administrator
PORT=4000
NODE_ENV=development
Password with special characters? URL-encode them. Aditya@123 → Aditya%40123.

Run migrations and seed initial data:

bash
npm run seed
Start the server:

bash
npm start
Expected output:

text
[server] Starting BECS backend...
[migrate] Schema created/updated successfully
[seed] Admin "admin@becs-hvac.com" already exists.
[seed] Devices created: 0. Total devices: 11
========================================
      BECS HVAC BACKEND RUNNING
========================================
API:    http://localhost:4000
Health: http://localhost:4000/api/health
========================================
4. Frontend Setup
Open a new terminal:

bash
cd frontend
npm install
Create .env in the frontend/ directory:

env
VITE_API_URL=http://localhost:4000
Start the development server:

bash
npm run dev
The app opens at http://localhost:3000.

5. Log In
Use the credentials from backend/.env:

Email: admin@becs-hvac.com

Password: ChangeMe123!

Environment Variables
Backend (backend/.env)
Variable	Required	Default	Description
DATABASE_URL	Yes	—	PostgreSQL connection string
JWT_SECRET	Yes	—	Random string for signing session tokens
ADMIN_EMAIL	No	admin@becs-hvac.com	Initial admin email
ADMIN_PASSWORD	No	ChangeMe123!	Initial admin password
ADMIN_NAME	No	System Administrator	Initial admin display name
PORT	No	4000	Server port
NODE_ENV	No	development	development or production
FRONTEND_URL	No	http://localhost:3000	Allowed CORS origin
Example .env.example:

env
DATABASE_URL=postgresql://user:password@localhost:5432/becs_hvac
JWT_SECRET=generate_a_long_random_string_here
ADMIN_EMAIL=admin@becs-hvac.com
ADMIN_PASSWORD=ChangeMe123!
ADMIN_NAME=System Administrator
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
Frontend (frontend/.env)
Variable	Required	Default	Description
VITE_API_URL	No	(blank)	Backend URL. Leave blank for same-origin deployment.
Example .env.example:

env
# Local development
VITE_API_URL=http://localhost:4000

# Production (Render backend URL)
# VITE_API_URL=https://becs-hvac-backend.onrender.com
Deployment
Deploy Backend to Render
Step 1 — Push to GitHub

bash
cd backend
git init
git add .
git commit -m "Initial backend commit"
git remote add origin https://github.com/YOUR_USERNAME/becs-hvac-backend.git
git push -u origin main
Step 2 — Create Render Web Service

Go to render.com → New → Web Service

Connect your GitHub repository

Configure:

Setting	Value
Name	becs-hvac-backend
Environment	Node
Build Command	npm install
Start Command	npm start
Instance Type	Free (or Starter for production)
Step 3 — Add PostgreSQL Database

In Render Dashboard → New → PostgreSQL

Name it becs-hvac-db, choose your region

Once created, copy the Internal Database URL

Go back to your Web Service → Environment → add:

Key: DATABASE_URL → Value: (the internal database URL)

Step 4 — Set Environment Variables

In the Web Service's Environment tab, add:

Key	Value
JWT_SECRET	(generate a long random string)
ADMIN_EMAIL	admin@becs-hvac.com
ADMIN_PASSWORD	(your secure password)
ADMIN_NAME	System Administrator
NODE_ENV	production
FRONTEND_URL	https://your-app.vercel.app
Step 5 — Seed the Database (one-time)

After the first successful deploy, open the Render Shell for your Web Service and run:

bash
npm run seed
Step 6 — Note your backend URL

It will look like: https://becs-hvac-backend.onrender.com

Deploy Frontend to Vercel
Step 1 — Push to GitHub

bash
cd frontend
git init
git add .
git commit -m "Initial frontend commit"
git remote add origin https://github.com/YOUR_USERNAME/becs-hvac-frontend.git
git push -u origin main
Step 2 — Import to Vercel

Go to vercel.com → Add New → Project

Import your GitHub repository

Vercel auto-detects Vite. Confirm the settings:

Setting	Value
Framework Preset	Vite
Build Command	npm run build
Output Directory	dist
Install Command	npm install
Step 3 — Add Environment Variable

In the Environment Variables section, add:

Key	Value
VITE_API_URL	https://becs-hvac-backend.onrender.com
Step 4 — Deploy

Click Deploy. Vercel will build and publish your frontend.

Your app will be live at https://your-app.vercel.app.

Step 5 — Update Backend CORS

Go back to Render → your Web Service → Environment → update:

text
FRONTEND_URL = https://your-app.vercel.app
Redeploy the backend so the CORS setting takes effect.

Monorepo Deployment (Both in One Repo)
If you keep both frontend and backend in a single repository:

For Render (backend):

Root Directory: backend

Build Command: npm install

Start Command: npm start

For Vercel (frontend):

Root Directory: frontend

Framework Preset: Vite

Build Command: npm run build

Output Directory: dist

Add a .gitignore at the root:

gitignore
# Dependencies
node_modules/
*/node_modules/

# Environment files
.env
.env.local
.env.*.local

# Build outputs
dist/
build/
*/dist/

# Logs
*.log
npm-debug.log*

# OS files
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/

# Database
*.db
*.sqlite
ESP32 Firmware
Each ESP32 runs a small web server exposing:

Method	Endpoint	Payload
GET	/api/telemetry	—
POST	/api/servo	{ type: "hot"|"cold", percent: 0|25|50|75|100 }
POST	/api/mode	{ autoAdjust: boolean }
POST	/api/setpoint	{ targetTemp?: number, targetHum?: number }
POST	/api/relay	{ relay: "AHU"|"DHU1"|"DHU2", on: boolean }
Wiring reference:

GPIO	Connected to
2	DHT11 data pin
18	Hot supply servo
19	Cold supply servo
26	Relay 1 — AHU power
27	Relay 2 — DHU 1
14	Relay 3 — DHU 2
Required Arduino libraries:

ESP32Servo

DHT sensor library (Adafruit) + Adafruit Unified Sensor

ArduinoJson (v6)

ESPmDNS (bundled with ESP32 board package)

Hostname convention:

Each board must have a unique DEVICE_HOSTNAME matching a device record in the dashboard:

cpp
const char* DEVICE_HOSTNAME = "my-esp32-01";
Dashboard auto-assigns hostnames by device serial:

Device ID	Auto-assigned hostname
Device 1	my-esp32-01
Device 2	my-esp32-02
Device 12	my-esp32-12
Full firmware source code is available in the dashboard under ESP32 CONFIG → ESP32 Firmware C++ Source Code (Admin only).

API Reference
All routes except /api/auth/* and /api/health require a valid session cookie.

Authentication
Method	Endpoint	Access	Description
POST	/api/auth/login	Public	Sign in, sets session cookie
POST	/api/auth/logout	Public	Revoke session
GET	/api/auth/me	Auth	Get current user
Devices
Method	Endpoint	Access	Description
GET	/api/devices	Auth	List all devices
POST	/api/devices	Admin	Create a device
PATCH	/api/devices/:id	Admin	Update a device
DELETE	/api/devices/:id	Admin	Remove a device
POST	/api/devices/bind	Auth	Bind a discovered ESP32
GET	/api/devices/history	Auth	Get telemetry history
POST	/api/devices/history	Auth	Record telemetry samples
Alarms
Method	Endpoint	Access	Description
GET	/api/alarms	Auth	List alarms
POST	/api/alarms	Auth	Raise an alarm (idempotent)
PATCH	/api/alarms/:id/ack	Auth	Acknowledge an alarm
PATCH	/api/alarms/ack-all	Auth	Acknowledge all alarms
POST	/api/alarms/resolve	Auth	Resolve alarms for a device
DELETE	/api/alarms/:id	Admin	Delete an alarm
Automation Rules
Method	Endpoint	Access	Description
GET	/api/rules	Auth	List rules
POST	/api/rules	Admin	Create a rule
PATCH	/api/rules/:id/toggle	Admin	Enable/disable a rule
DELETE	/api/rules/:id	Admin	Delete a rule
Users
Method	Endpoint	Access	Description
GET	/api/users	Admin	List users
POST	/api/users	Admin	Create a user
PATCH	/api/users/:id/role	Admin	Change role
PATCH	/api/users/:id/password	Admin	Reset password
DELETE	/api/users/:id	Admin	Remove a user
Other
Method	Endpoint	Access	Description
GET	/api/audit-log	Admin	View audit trail
POST	/api/audit-log	Auth	Record an action
GET	/api/automation-log	Auth	View automation history
POST	/api/automation-log	Auth	Record an automation event
GET	/api/reports/:period	Auth	Daily / weekly / monthly report
GET	/api/settings	Auth	Installation settings
PATCH	/api/settings	Auth	Update settings
GET	/api/health	Public	Health check
User Roles
Capability	Operator	Admin
View real-time telemetry	✅	✅
Control valves and relays	✅	✅
Acknowledge alarms	✅	✅
Toggle Auto-PID mode	✅	✅
Edit room names	❌	✅
Edit device names	❌	✅
Edit mDNS hostnames	❌	✅
Configure alarm thresholds	❌	✅
Add / remove devices	❌	✅
Create / delete automation rules	❌	✅
Manage user accounts	❌	✅
View audit log	❌	✅
Delete alarms	❌	✅
View ESP32 firmware source	❌	✅
Role enforcement happens server-side — hiding UI elements is a UX convenience, not a security measure.

Alarm System
The alarm engine follows a strict lifecycle designed to avoid operator fatigue while maintaining accurate records:

text
    ┌──────────────┐
    │   NORMAL     │
    └──────┬───────┘
           │ Reading exceeds threshold
           ▼
    ┌──────────────┐
    │   REALTIME   │◀──── Operator ACK
    │   (Active)   │      (stays here)
    └──────┬───────┘
           │ Reading returns to normal
           ▼
    ┌──────────────┐
    │     PAST     │
    │  (Resolved)  │
    └──────────────┘
Key behaviors:

One alarm per breach — while a threshold is exceeded, only one alarm record exists. The backend enforces idempotency.

ACK does not resolve — acknowledging tells the system an operator has seen the alarm; the alarm remains REALTIME as long as the condition persists.

Auto-resolution — the moment a reading returns to range, the alarm moves to PAST and its cleared_at timestamp is set.

New alarm after resolution — if the threshold is breached again after being resolved, a fresh alarm is created.

1-year retention — alarms older than 365 days are auto-purged.

Data Persistence
All persistent data lives in PostgreSQL. The backend is stateless — restarts do not lose data.

Table	Contents
users	Accounts, roles, password hashes
devices	Device configuration, thresholds, IP / hostname
alarms	Alarm events with full lifecycle
audit_log	Every user action with attribution
automation_rules	Rule definitions
automation_log	Automation trigger history
Not persisted (by design):

Live sensor readings (tempReal, humidityReal) — always fresh from hardware

Online/offline status — recomputed on each poll

Session state — stored in HTTP-only cookies

Troubleshooting
Cannot reach the BECS server

Confirm backend is running: curl http://localhost:4000/api/health

Verify VITE_API_URL in frontend/.env

Check browser console for CORS errors

Login fails with "Invalid email or password"

Verify admin account exists: SELECT email, role FROM users;

If missing, re-run cd backend && npm run seed

Database connection error — password authentication failed

URL-encode special characters in password (@ → %40)

Verify PostgreSQL is running (Windows: services.msc → postgresql-x64-*)

Devices show "NOT CONNECTED"

Ensure ESP32 is powered and on the same LAN

Ping from the browser machine: ping my-esp32-01.local

Verify firmware DEVICE_HOSTNAME matches dashboard record

Alarms keep appearing repeatedly

Backend logs [ALARM] Active alarm already exists when dedup works

Clear legacy records: DELETE FROM alarms WHERE id LIKE 'ALM-%';

Scan button crashes the app

Set SIMULATION_MODE = false in src/services/esp32Api.ts if using real hardware

Check browser console for network errors

CORS errors on Vercel deployment

Set FRONTEND_URL on Render to match your exact Vercel URL

Ensure cookies are SameSite=None; Secure (automatic when NODE_ENV=production)

Contributing
Fork the repository

Create a feature branch: git checkout -b feature/my-feature

Commit changes: git commit -m "Add my feature"

Push the branch: git push origin feature/my-feature

Open a Pull Request

License
This project is proprietary software. All rights reserved.

Support
For issues, feature requests, or deployment assistance, open a GitHub issue or contact the development team.

BECS HVAC Control System — Real-time environmental control for critical facilities
