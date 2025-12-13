const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { decrypt, encrypt } = require('./encryption');

class SourceStore {
    constructor(dbPath, secret) {
        this.dbPath = dbPath;
        this.secret = secret;
        this.ensureDirectory();
        this.db = new DatabaseSync(dbPath);
        this.createTables();
        this.ensurePageColumns();
        this.ensureNetworkTables();
        this.seedDefaultUser();
    }

    ensureDirectory() {
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    createTables() {
        this.db.exec('PRAGMA foreign_keys = ON;');
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                base_url TEXT NOT NULL,
                auth_type TEXT NOT NULL,
                encrypted_credentials TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `);

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS views (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                path TEXT DEFAULT '',
                method TEXT DEFAULT 'GET',
                payload_json TEXT,
                fields_json TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
            );
        `);

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                name TEXT,
                password_hash TEXT NOT NULL,
                avatar TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `);

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS pages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                slug TEXT NOT NULL UNIQUE,
                view_id INTEGER NOT NULL,
                table_fields_json TEXT,
                form_fields_json TEXT,
                submit_method TEXT DEFAULT 'PUT',
                submit_path TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (view_id) REFERENCES views(id) ON DELETE CASCADE
            );
        `);
    }

    ensurePageColumns() {
        const tableInfo = this.db.prepare('PRAGMA table_info(pages);').all();
        const columnNames = tableInfo.map((c) => c.name);
        const addColumn = (name, type, defaultValue = null) => {
            if (!columnNames.includes(name)) {
                this.db.exec(`ALTER TABLE pages ADD COLUMN ${name} ${type}${defaultValue ? ` DEFAULT ${defaultValue}` : ''};`);
            }
        };

        addColumn('list_view_id', 'INTEGER');
        addColumn('edit_view_id', 'INTEGER');
        addColumn('list_fields_json', 'TEXT');
        addColumn('edit_fields_json', 'TEXT');
        addColumn('edit_submit_method', "TEXT DEFAULT 'PUT'");
        addColumn('edit_submit_path', 'TEXT');
    }

    ensureNetworkTables() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS network_hosts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip TEXT NOT NULL UNIQUE,
                hostname TEXT,
                label TEXT,
                note TEXT,
                tags_json TEXT,
                source TEXT DEFAULT 'manual',
                last_seen TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `);

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS network_services (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                host_id INTEGER NOT NULL,
                port INTEGER NOT NULL,
                protocol TEXT DEFAULT 'tcp',
                service TEXT,
                note TEXT,
                url TEXT,
                last_seen TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (host_id) REFERENCES network_hosts(id) ON DELETE CASCADE
            );
        `);
    }

    seedDefaultUser() {
        const email = process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com';
        const password = process.env.DEFAULT_ADMIN_PASSWORD || 'changeMe123!';
        const existing = this.db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) {
            return;
        }

        const hash = this.hashPassword(password);
        this.db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)').run(email, 'Admin', hash);
    }

    listSources() {
        const rows = this.db
            .prepare('SELECT id, name, base_url, auth_type, encrypted_credentials FROM sources ORDER BY created_at DESC')
            .all();
        return rows.map((row) => ({
            id: row.id,
            name: row.name,
            baseUrl: row.base_url,
            authType: row.auth_type,
            hasCredentials: Boolean(row.encrypted_credentials),
        }));
    }

    getSource(id) {
        const row = this.db.prepare('SELECT id, name, base_url, auth_type, encrypted_credentials FROM sources WHERE id = ?').get(id);
        if (!row) {
            return null;
        }

        let credentials = null;
        if (row.encrypted_credentials) {
            const decrypted = decrypt(row.encrypted_credentials, this.secret);
            credentials = JSON.parse(decrypted);
        }

        return {
            id: row.id,
            name: row.name,
            baseUrl: row.base_url,
            authType: row.auth_type,
            credentials,
        };
    }

    addSource(input) {
        const payload = {
            name: input.name?.trim(),
            baseUrl: input.baseUrl?.trim(),
            authType: input.authType || 'none',
            credentials: input.credentials || {},
        };

        if (!payload.name || !payload.baseUrl) {
            throw new Error('Name and baseUrl are required');
        }

        const encrypted = encrypt(JSON.stringify(payload.credentials), this.secret);
        const stmt = this.db.prepare(
            'INSERT INTO sources (name, base_url, auth_type, encrypted_credentials) VALUES (?, ?, ?, ?)',
        );
        const result = stmt.run(payload.name, payload.baseUrl, payload.authType, encrypted);
        return this.getSource(result.lastInsertRowid);
    }

    listViews() {
        const rows = this.db
            .prepare(
                'SELECT id, source_id, name, path, method, payload_json, fields_json, created_at FROM views ORDER BY created_at DESC',
            )
            .all();

        return rows.map((row) => ({
            id: row.id,
            sourceId: row.source_id,
            name: row.name,
            path: row.path || '',
            method: row.method || 'GET',
            payload: this.parseJson(row.payload_json, null),
            fields: this.parseJson(row.fields_json, []),
            createdAt: row.created_at,
        }));
    }

    getView(id) {
        const row = this.db
            .prepare('SELECT id, source_id, name, path, method, payload_json, fields_json, created_at FROM views WHERE id = ?')
            .get(id);

        if (!row) {
            return null;
        }

        return {
            id: row.id,
            sourceId: row.source_id,
            name: row.name,
            path: row.path || '',
            method: row.method || 'GET',
            payload: this.parseJson(row.payload_json, null),
            fields: this.parseJson(row.fields_json, []),
            createdAt: row.created_at,
        };
    }

    addView(input) {
        const payload = {
            sourceId: Number(input.sourceId),
            name: input.name?.trim(),
            path: input.path?.trim() || '',
            method: (input.method || 'GET').toUpperCase(),
            payload: input.payload || null,
            fields: Array.isArray(input.fields) ? input.fields : [],
        };

        if (!payload.sourceId || !this.getSource(payload.sourceId)) {
            throw new Error('A valid sourceId is required');
        }

        if (!payload.name) {
            throw new Error('View name is required');
        }

        const stmt = this.db.prepare(
            'INSERT INTO views (source_id, name, path, method, payload_json, fields_json) VALUES (?, ?, ?, ?, ?, ?)',
        );

        const result = stmt.run(
            payload.sourceId,
            payload.name,
            payload.path,
            payload.method,
            payload.payload ? JSON.stringify(payload.payload) : null,
            JSON.stringify(payload.fields),
        );

        return this.getView(result.lastInsertRowid);
    }

    parseJson(value, fallback) {
        if (!value) {
            return fallback;
        }

        try {
            return JSON.parse(value);
        } catch (error) {
            return fallback;
        }
    }

    // Users
    hashPassword(password, salt = null) {
        const crypto = require('node:crypto');
        const userSalt = salt || crypto.randomBytes(16).toString('hex');
        const derived = crypto.scryptSync(password, `${userSalt}:${this.secret}`, 64).toString('hex');
        return `${userSalt}:${derived}`;
    }

    verifyPassword(password, passwordHash) {
        if (!password || !passwordHash) return false;
        const [salt] = passwordHash.split(':');
        const candidate = this.hashPassword(password, salt);
        return candidate === passwordHash;
    }

    findUserByEmail(email) {
        const row = this.db.prepare('SELECT id, email, name, avatar, password_hash FROM users WHERE email = ?').get(email);
        if (!row) return null;
        return { id: row.id, email: row.email, name: row.name, avatar: row.avatar, passwordHash: row.password_hash };
    }

    getUser(id) {
        const row = this.db.prepare('SELECT id, email, name, avatar FROM users WHERE id = ?').get(id);
        return row ? { id: row.id, email: row.email, name: row.name, avatar: row.avatar } : null;
    }

    createUser(input) {
        const email = input.email?.trim().toLowerCase();
        const password = input.password?.trim();
        if (!email || !password) {
            throw new Error('Email and password are required');
        }

        const existing = this.findUserByEmail(email);
        if (existing) {
            throw new Error('User already exists');
        }

        const hash = this.hashPassword(password);
        const name = input.name?.trim() || email.split('@')[0];
        const stmt = this.db.prepare('INSERT INTO users (email, name, password_hash, avatar) VALUES (?, ?, ?, ?)');
        const result = stmt.run(email, name, hash, input.avatar || null);
        return this.getUser(result.lastInsertRowid);
    }

    updateUser(id, updates) {
        const existing = this.getUser(id);
        if (!existing) {
            throw new Error('User not found');
        }

        const name = updates.name?.trim() || existing.name;
        const avatar = updates.avatar ?? existing.avatar;
        this.db.prepare('UPDATE users SET name = ?, avatar = ? WHERE id = ?').run(name, avatar, id);
        return this.getUser(id);
    }

    // Pages
    listPages() {
        const rows = this.db
            .prepare(
                `SELECT id, title, slug, view_id, table_fields_json, form_fields_json, submit_method, submit_path,
                        list_view_id, edit_view_id, list_fields_json, edit_fields_json, edit_submit_method, edit_submit_path, created_at
                 FROM pages ORDER BY created_at DESC`
            )
            .all();
        return rows.map((row) => this.mapPage(row));
    }

    getPageBySlug(slug) {
        const row = this.db
            .prepare(
                `SELECT id, title, slug, view_id, table_fields_json, form_fields_json, submit_method, submit_path,
                        list_view_id, edit_view_id, list_fields_json, edit_fields_json, edit_submit_method, edit_submit_path, created_at
                 FROM pages WHERE slug = ?`
            )
            .get(slug);
        return row ? this.mapPage(row) : null;
    }

    addPage(input) {
        const payload = {
            title: input.title?.trim(),
            slug: input.slug?.trim().toLowerCase(),
            listViewId: Number(input.listViewId || input.viewId),
            editViewId: Number(input.editViewId || input.viewId),
            tableFields: Array.isArray(input.tableFields || input.listFields) ? input.tableFields || input.listFields : [],
            formFields: Array.isArray(input.formFields || input.editFields) ? input.formFields || input.editFields : [],
            submitMethod: (input.submitMethod || input.editSubmitMethod || 'PUT').toUpperCase(),
            submitPath: input.submitPath?.trim() || input.editSubmitPath?.trim() || null,
            listFields: Array.isArray(input.listFields) ? input.listFields : null,
            editFields: Array.isArray(input.editFields) ? input.editFields : null,
            editSubmitMethod: (input.editSubmitMethod || input.submitMethod || 'PUT').toUpperCase(),
            editSubmitPath: input.editSubmitPath?.trim() || input.submitPath?.trim() || null,
        };

        if (!payload.title || !payload.slug) {
            throw new Error('Title and slug are required');
        }

        if (!payload.listViewId || !this.getView(payload.listViewId)) {
            throw new Error('A valid list view is required for the page');
        }

        if (payload.editViewId && !this.getView(payload.editViewId)) {
            throw new Error('The edit view is invalid');
        }

        const stmt = this.db.prepare(
            `INSERT INTO pages (
                title, slug, view_id, table_fields_json, form_fields_json, submit_method, submit_path,
                list_view_id, edit_view_id, list_fields_json, edit_fields_json, edit_submit_method, edit_submit_path
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        const result = stmt.run(
            payload.title,
            payload.slug,
            payload.listViewId,
            JSON.stringify(payload.tableFields),
            JSON.stringify(payload.formFields),
            payload.submitMethod,
            payload.submitPath,
            payload.listViewId,
            payload.editViewId || payload.listViewId,
            JSON.stringify(payload.listFields || payload.tableFields),
            JSON.stringify(payload.editFields || payload.formFields),
            payload.editSubmitMethod,
            payload.editSubmitPath
        );

        return this.getPage(result.lastInsertRowid);
    }

    getPage(id) {
        const row = this.db
            .prepare(
                `SELECT id, title, slug, view_id, table_fields_json, form_fields_json, submit_method, submit_path,
                        list_view_id, edit_view_id, list_fields_json, edit_fields_json, edit_submit_method, edit_submit_path, created_at
                 FROM pages WHERE id = ?`
            )
            .get(id);
        return row ? this.mapPage(row) : null;
    }

    mapPage(row) {
        const listFields = this.parseJson(row.list_fields_json, null);
        const editFields = this.parseJson(row.edit_fields_json, null);
        return {
            id: row.id,
            title: row.title,
            slug: row.slug,
            viewId: row.view_id,
            listViewId: row.list_view_id || row.view_id,
            editViewId: row.edit_view_id || row.view_id,
            tableFields: this.parseJson(row.table_fields_json, []),
            formFields: this.parseJson(row.form_fields_json, []),
            listFields: listFields || this.parseJson(row.table_fields_json, []),
            editFields: editFields || this.parseJson(row.form_fields_json, []),
            submitMethod: row.submit_method || 'PUT',
            submitPath: row.submit_path || '',
            editSubmitMethod: row.edit_submit_method || row.submit_method || 'PUT',
            editSubmitPath: row.edit_submit_path || row.submit_path || '',
            createdAt: row.created_at,
        };
    }

    // Network hosts
    listNetworkHosts() {
        const hosts = this.db
            .prepare(
                `SELECT id, ip, hostname, label, note, tags_json, source, last_seen, created_at, updated_at
                 FROM network_hosts ORDER BY ip`
            )
            .all();
        const services = this.db
            .prepare(
                `SELECT host_id, port, protocol, service, note, url, last_seen FROM network_services ORDER BY port`
            )
            .all();

        const serviceMap = new Map();
        for (const svc of services) {
            const list = serviceMap.get(svc.host_id) || [];
            list.push({
                port: svc.port,
                protocol: svc.protocol || 'tcp',
                service: svc.service || null,
                note: svc.note || null,
                url: svc.url || null,
                lastSeen: svc.last_seen || null,
            });
            serviceMap.set(svc.host_id, list);
        }

        return hosts.map((host) => ({
            id: host.id,
            ip: host.ip,
            hostname: host.hostname || null,
            label: host.label || null,
            note: host.note || null,
            tags: this.parseJson(host.tags_json, []),
            source: host.source || 'manual',
            lastSeen: host.last_seen || null,
            createdAt: host.created_at,
            updatedAt: host.updated_at,
            services: serviceMap.get(host.id) || [],
        }));
    }

    getNetworkHost(id) {
        const row = this.db
            .prepare(
                `SELECT id, ip, hostname, label, note, tags_json, source, last_seen, created_at, updated_at
                 FROM network_hosts WHERE id = ?`
            )
            .get(id);
        if (!row) return null;
        const services = this.db
            .prepare('SELECT port, protocol, service, note, url, last_seen FROM network_services WHERE host_id = ? ORDER BY port')
            .all(id)
            .map((svc) => ({
                port: svc.port,
                protocol: svc.protocol || 'tcp',
                service: svc.service || null,
                note: svc.note || null,
                url: svc.url || null,
                lastSeen: svc.last_seen || null,
            }));

        return {
            id: row.id,
            ip: row.ip,
            hostname: row.hostname || null,
            label: row.label || null,
            note: row.note || null,
            tags: this.parseJson(row.tags_json, []),
            source: row.source || 'manual',
            lastSeen: row.last_seen || null,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            services,
        };
    }

    upsertNetworkHost(input) {
        const ip = input.ip?.trim();
        if (!ip) {
            throw new Error('IP is required');
        }
        const source = input.source?.trim() || 'manual';
        const hostname = input.hostname?.trim() || null;
        const label = input.label?.trim() || null;
        const note = input.note?.trim() || null;
        const tags = Array.isArray(input.tags) ? input.tags : [];
        const lastSeen = input.lastSeen || null;

        const existing = this.db
            .prepare(
                `SELECT id, hostname, label, note, tags_json, source, last_seen FROM network_hosts WHERE ip = ?`
            )
            .get(ip);

        if (existing) {
            const mergedTags = Array.from(new Set([...(this.parseJson(existing.tags_json, []) || []), ...tags]));
            this.db.prepare(
                `UPDATE network_hosts
                 SET hostname = COALESCE(?, hostname),
                     label = COALESCE(?, label),
                     note = COALESCE(?, note),
                     tags_json = ?,
                     source = COALESCE(?, source),
                     last_seen = COALESCE(?, last_seen),
                     updated_at = CURRENT_TIMESTAMP
                 WHERE ip = ?`
            ).run(hostname, label, note, JSON.stringify(mergedTags), source, lastSeen, ip);
            return this.getNetworkHost(existing.id);
        }

        const stmt = this.db.prepare(
            `INSERT INTO network_hosts (ip, hostname, label, note, tags_json, source, last_seen)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        );
        const result = stmt.run(ip, hostname, label, note, JSON.stringify(tags), source, lastSeen);
        return this.getNetworkHost(result.lastInsertRowid);
    }

    addNetworkService(hostId, service) {
        const host = this.getNetworkHost(hostId);
        if (!host) {
            throw new Error('Host not found');
        }

        const payload = {
            port: Number(service.port),
            protocol: service.protocol?.trim().toLowerCase() || 'tcp',
            name: service.service?.trim() || null,
            note: service.note?.trim() || null,
            url: service.url?.trim() || null,
            lastSeen: service.lastSeen || null,
        };

        if (!payload.port) {
            throw new Error('Port is required');
        }

        this.db
            .prepare(
                `INSERT INTO network_services (host_id, port, protocol, service, note, url, last_seen)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            .run(hostId, payload.port, payload.protocol, payload.name, payload.note, payload.url, payload.lastSeen);

        return this.getNetworkHost(hostId);
    }

    replaceNetworkServices(hostId, services = []) {
        const host = this.getNetworkHost(hostId);
        if (!host) {
            throw new Error('Host not found');
        }

        const stmt = this.db.prepare(
            `INSERT INTO network_services (host_id, port, protocol, service, note, url, last_seen)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        );

        this.db.prepare('DELETE FROM network_services WHERE host_id = ?').run(hostId);
        for (const svc of services) {
            if (!svc || !svc.port) continue;
            stmt.run(
                hostId,
                Number(svc.port),
                (svc.protocol || 'tcp').toLowerCase(),
                svc.service || null,
                svc.note || null,
                svc.url || null,
                svc.lastSeen || null,
            );
        }

        return this.getNetworkHost(hostId);
    }
}

module.exports = {
    SourceStore,
};
