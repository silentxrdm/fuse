# Codex Build Instruction: Modular Central Management System with Network Scan

These are step-by-step requirements for Codex to scaffold a modular, centrally managed platform with a LAN scan feature. The target environment is Ubuntu with a Node.js/Express backend, PostgreSQL, and a React/Vue SPA frontend.

## 1. Platform and Project Layout
- Update Ubuntu packages and install Node.js, npm, PostgreSQL, and PM2.
- Structure the project as:
  ```
  project/
  ├─ server/
  │  ├─ config/
  │  ├─ models/
  │  ├─ routes/
  │  ├─ services/
  │  ├─ generators/
  │  └─ app.js
  └─ client/
     ├─ src/
     │  ├─ components/
     │  ├─ pages/
     │  └─ services/
     └─ vite.config.js
  ```
- Backend: Node.js + Express, PostgreSQL via Sequelize or Prisma, JWT for auth.
- Frontend: React or Vue SPA with Material UI or Vuetify.

## 2. Authentication and User Management
- Database table `users`: `id`, `username`, `password_hash`, `role`.
- Registration/Login routes use bcrypt for password hashing and issue JWTs on success.
- Middleware verifies JWTs and attaches the user role on `req.user` for role checks.

## 3. Dynamic Entities Module
- Meta tables:
  - `entities`: `id`, `name`, `displayName`, `created_at`.
  - `entity_fields`: `id`, `entity_id`, `name`, `type`, `options`.
- Entity generator service should:
  - Store metadata in `entities` and `entity_fields`.
  - Create the physical table (SQL or dynamic Sequelize/Prisma model).
  - Generate CRUD routes (e.g., `GET /api/{entity}`, `POST /api/{entity}`) and frontend pages.
- UI: dashboard page "Entiteiten" with a form to design entities (name, fields, type) and tables to manage data.

## 4. Contacts and Cases Modules
- Use the entity module to provision tables for contacts (name, phone, email) and cases (title, status, description, relationship to contact).
- Provide frontend pages for lists, detail views, and forms.

## 5. Network Scan Module (Local LAN)
- Goal: list LAN devices (IP, hostname, MAC) and track online/offline via `last_seen`.
- Tools:
  - Preferred: `nmap -sn 192.168.0.0/24` for host discovery without port scan (ARP-based on LAN).
  - Alternative: `lan-discovery` library (ICMP/ARP via Node ping, no Nmap dependency). Example:
    ```js
    const LanDiscovery = require('lan-discovery');
    const CidrRange = require('cidr-range');
    let discovery = new LanDiscovery({ verbose: false, timeout: 60 });
    discovery.on(LanDiscovery.EVENT_DEVICE_INFOS, (device) => {
      console.log(device); // ip, mac, hostname
    });
    let iface = await discovery.getDefaultInterface();
    let targets = CidrRange(iface.cidr);
    discovery.startScan({ ipArrayToScan: targets });
    ```
- Backend: cron-like service that scans and persists to `network_devices` (`ip`, `hostname`, `mac`, `vendor`, `last_seen`). Provide routes `GET /api/network` and `POST /api/network/scan`.
- Frontend: dashboard page "Netwerk" with device list (IP, hostname, MAC, online/offline via `last_seen`), manual scan button, and device detail view (e.g., ports/vendor).

## 6. Remote Servers and Services
- Table `remote_servers`: `id`, `name`, `ip`, `ssh_port`, `web_admin_url`, `services` (JSON), `notes`.
- UI: form to add servers plus direct links for SSH (`ssh://user@ip:port`) and web admin (`https://ip:port`).
- Integration: allow extra fields via the entity module (e.g., Grafana/Jupyter URLs) and use gRPC or SSH client modules to run commands (restart/status) against remote servers.

## 7. Additional Features
- Role-based access (admin/user) enforced per route.
- Process manager: run the Node server with PM2 (`pm2 start app.js`).
- Reverse proxy: configure Nginx with HTTPS to forward to Node.
- Notifications: send alerts when a new device appears or a server goes offline.

## 8. Tasks for Codex
- Initialize server/client folders and install dependencies (Express, Sequelize/Prisma, JWT, bcrypt, Nmap or lan-discovery, gRPC, React/Vue).
- Build models for `users`, `entities`, `entity_fields`, `contacts`, `cases`, `network_devices`, `remote_servers`.
- Implement services and generators for entities, scanning, and gRPC remote control.
- Implement REST routes for auth, dynamic entities, network devices, and remote servers.
- Frontend: pages for login, dashboard, entity management, contacts, cases, network, and remote servers. Use server metadata to render dynamic forms.

## 9. Notes on Network Scanning
- Nmap is open source and uses raw IP packets for host/service discovery; ARP scanning is the LAN default.
- `lan-discovery` is cross-platform, uses Node ping, and avoids the Nmap dependency.
- Use async/await and events for scanning and present results cleanly in the UI.
