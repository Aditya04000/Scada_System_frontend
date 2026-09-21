BECS HVAC Control System
A full-stack SCADA dashboard for monitoring and controlling HVAC systems across ESP32-based sensor nodes. Persistent data lives in PostgreSQL; live hardware telemetry flows directly from the browser to ESP32 boards over the local network.

Architecture
text
Browser ──HTTPS──▶ Express API ──▶ PostgreSQL
Browser ──LAN────▶ ESP32 (telemetry + commands)
Two data paths by design: the backend runs on the cloud and cannot reach a private plant network, so live hardware traffic stays local.



Stack
Frontend: React 19, TypeScript, Vite, Tailwind CSS 4, Recharts, jsPDF

Backend: Node.js, Express, PostgreSQL, JWT (HTTP-only cookies), scrypt

Hardware: ESP32 + DHT11/22, 2× servo valves, 3× relays, mDNS





Project Structure
text
becs-hvac/
├── frontend/                 # Deploy to Vercel
│   ├── src/
│   │   ├── components/
│   │   ├── services/
│   │   │   ├── api.ts
│   │   │   └── esp32Api.ts
│   │   ├── data/
│   │   ├── utils/
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── .env.example
│
└── backend/                  # Deploy to Render
    ├── config/db.js
    ├── controllers/
    ├── middleware/auth.js
    ├── migrations/
    ├── routes/
    ├── utils/password.js
    ├── app.js
    ├── server.js
    ├── seed.js
    └── .env.example


    
Local Development
Prerequisites
Node.js 18+

PostgreSQL 14+ (pgAdmin 4 recommended)

Arduino IDE 2.x (for ESP32 firmware)

1. Create the database
In pgAdmin or psql:

sql
CREATE DATABASE becs_hvac;
2. Backend
bash
cd backend
npm install
Create backend/.env:



env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/becs_hvac
JWT_SECRET=your_long_random_secret_here
ADMIN_EMAIL=admin@becs-hvac.com
ADMIN_PASSWORD=ChangeMe123!
ADMIN_NAME=System Administrator
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
Special characters in the DB password must be URL-encoded: Aditya@123 → Aditya%40123



Seed and run:

bash
npm run seed
npm start
3. Frontend
bash
cd frontend
npm install
Create frontend/.env:



env
VITE_API_URL=http://localhost:4000
Run:



bash
npm run dev
App runs at http://localhost:3000 — log in with the admin credentials from backend/.env.



Environment Variables
Backend
Variable	        Required	Default
DATABASE_URL	Yes	—
JWT_SECRET	Yes	—
ADMIN_EMAIL	No	admin@becs-hvac.com
ADMIN_PASSWORD	No	ChangeMe123!
ADMIN_NAME	No	System Administrator
PORT	No	4000
NODE_ENV	No	development
FRONTEND_URL	No	http://localhost:3000
Frontend
Variable	Required	Notes
VITE_API_URL	No	Backend URL. Blank = same origin.
Deployment
Backend → Render
Push backend/ to GitHub


Render → New → Web Service → connect repo


Settings:

Build: npm install

Start: npm start



Add a PostgreSQL instance → link it (sets DATABASE_URL automatically)



Environment variables:

text
JWT_SECRET=<long random string>
ADMIN_EMAIL=admin@becs-hvac.com
ADMIN_PASSWORD=<secure password>
NODE_ENV=production
FRONTEND_URL=https://your-app.vercel.app
After first deploy, run npm run seed from the Render Shell

Frontend → Vercel
Push frontend/ to GitHub

Vercel → Add New → Project → import repo



Settings:
Framework: Vite
Build: npm run build
Output: dist
Environment variable:

text
VITE_API_URL=https://your-backend.onrender.com
Deploy, then update FRONTEND_URL on Render to your Vercel URL

Monorepo
Both in one repo — set Root Directory to backend on Render and frontend on Vercel.

.gitignore
gitignore
node_modules/
*/node_modules/
dist/
*/dist/
.env
.env.local
*.log
.DS_Store
.vscode/
.idea/



ESP32 Endpoints
Method	Path	               Body
GET	/api/telemetry	—
POST	/api/servo	{ type: "hot"|"cold", percent: 0|25|50|75|100 }
POST	/api/mode	{ autoAdjust: boolean }
POST	/api/setpoint	{ targetTemp?: number, targetHum?: number }
POST	/api/relay	{ relay: "AHU"|"DHU1"|"DHU2", on: boolean }
Pins: GPIO 2 = DHT · 18/19 = hot/cold servos · 26/27/14 = AHU/DHU1/DHU2 relays
Libraries: ESP32Servo, DHT sensor library + Adafruit Unified Sensor, ArduinoJson, ESPmDNS
Hostname convention — each board sets:


cpp
const char* DEVICE_HOSTNAME = "my-esp32-01";
Auto-assigned per device serial: Device 1 → my-esp32-01, Device 12 → my-esp32-12. Full firmware is embedded in the dashboard under ESP32 CONFIG → Firmware Source (Admin only).

API Reference
All routes except /api/auth/* and /api/health require a session cookie.

Auth
Method	Endpoint	Access
POST	/api/auth/login	                  Public
POST	/api/auth/logout	                  Public
GET	/api/auth/me	                  Auth
Devices
Method	Endpoint	Access
GET	/api/devices	                  Auth
POST	/api/devices	                  Admin
PATCH	/api/devices/:id	                  Admin
DELETE	/api/devices/:id	                  Admin
POST	/api/devices/bind	                  Auth
GET / POST	/api/devices/history	Auth
Alarms
Method	Endpoint	Access
GET	/api/alarms	                  Auth
POST	/api/alarms	                  Auth
PATCH	/api/alarms/:id/ack	         Auth
PATCH	/api/alarms/ack-all	         Auth
POST	/api/alarms/resolve	         Auth
DELETE	/api/alarms/:id	                  Admin
Rules
Method	Endpoint	Access
GET	/api/rules	                  Auth
POST	/api/rules	                  Admin
PATCH	/api/rules/:id/toggle	         Admin
DELETE	/api/rules/:id	                  Admin
Users
Method	Endpoint	Access
GET	/api/users	                 Admin
POST	/api/users	                 Admin
PATCH	/api/users/:id/role	        Admin
PATCH	/api/users/:id/password	        Admin
DELETE	/api/users/:id	Admin
Other
Method	Endpoint	Access
GET / POST	/api/audit-log	         Admin / Auth
GET / POST	/api/automation-log	Auth
GET	/api/reports/:period	         Auth
GET / PATCH	/api/settings	         Auth
GET	/api/health	                  Public


Roles
Capability	                        Operator   Admin
View telemetry, control valves & relays	✅	✅
Acknowledge alarms, toggle Auto-PID	         ✅	✅
Edit names, rooms, hostnames, thresholds	❌	✅
Add / remove devices	                  ❌	✅
Manage rules and users	                  ❌	✅
View audit log, delete alarms	         ❌	✅
Enforcement is server-side — hiding UI is a UX convenience, not security.



Alarm Lifecycle
text
NORMAL ──breach──▶ REALTIME ──return to range──▶ PAST
                      │
                      └── ACK keeps it here until resolved
One alarm per breach — idempotent backend, no duplicates

ACK ≠ resolve — acknowledges awareness only

Auto-resolve — moves to PAST the moment the reading returns to range

New alarm after resolution — a fresh record is created if breached again

1-year retention — older alarms auto-purge



Data Persistence
Table	Contents
users	Accounts, roles, password hashes
devices	Config, thresholds, IP / hostname
alarms	Full lifecycle events
audit_log	Every user action
automation_rules	Rule definitions
automation_log	Trigger history
Not persisted: live sensor readings, online status, session state.



Troubleshooting
Symptom	Fix
Cannot reach server	Check backend at /api/health; verify VITE_API_URL; check CORS
Invalid email or password	SELECT email FROM users; — re-run npm run seed if empty
DB password authentication failed	URL-encode password (@ → %40); confirm Postgres service running
Device NOT CONNECTED	Verify LAN + ping my-esp32-01.local; match firmware hostname to dashboard
Duplicate alarms	Check backend logs for [ALARM] Active alarm already exists; purge old rows: DELETE FROM alarms WHERE id LIKE 'ALM-%';
CORS error on Vercel	Set FRONTEND_URL on Render to exact Vercel URL; redeploy


License
Proprietary. All rights reserved.
BECS HVAC Control System — Real-time environmental control for critical facilities.
