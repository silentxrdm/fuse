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
}

module.exports = {
    SourceStore,
};
