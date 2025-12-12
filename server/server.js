const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { collectFields } = require('./schema');
const { SourceStore } = require('./storage');
const { readJsonBody, sendJson, serveStaticFile, withCors, resolveDistPath } = require('./http-helpers');
const { buildRequestInit, buildTargetUrl } = require('./request-builder');

loadEnvFile();

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const SECRET = process.env.APP_SECRET || 'change-this-secret-in-production';
const DB_PATH = path.join(__dirname, '..', 'data', 'sources.sqlite');

const store = new SourceStore(DB_PATH, SECRET);
const distRoot = resolveDistPath();

function notFound(res) {
    sendJson(res, 404, { message: 'Not found' });
}

async function handlePreview(source, body, res) {
    const targetUrl = buildTargetUrl(source, body?.path || '');
    if (!targetUrl) {
        sendJson(res, 400, { message: 'Invalid target path' });
        return;
    }

    const init = buildRequestInit(source, body.payload, body.method || 'GET');

    try {
        const response = await fetch(targetUrl, init);
        const contentType = response.headers.get('content-type') || '';
        let payload;

        if (contentType.includes('application/json')) {
            payload = await response.json();
        } else {
            payload = await response.text();
        }

        if (!response.ok) {
            sendJson(res, response.status, { message: 'Request failed', payload });
            return;
        }

        const sample = Array.isArray(payload) ? payload.slice(0, 5) : payload;
        const fields = collectFields(payload);
        sendJson(res, 200, { url: targetUrl, preview: sample, fields });
    } catch (error) {
        sendJson(res, 500, { message: 'Unable to reach the target API', error: error.message });
    }
}

async function handleViewData(source, view, res) {
    const targetUrl = buildTargetUrl(source, view.path || '');
    if (!targetUrl) {
        sendJson(res, 400, { message: 'Invalid target path' });
        return;
    }

    const init = buildRequestInit(source, view.payload, view.method || 'GET');

    try {
        const response = await fetch(targetUrl, init);
        const contentType = response.headers.get('content-type') || '';
        let payload;

        if (contentType.includes('application/json')) {
            payload = await response.json();
        } else {
            payload = await response.text();
        }

        if (!response.ok) {
            sendJson(res, response.status, { message: 'Request failed', payload });
            return;
        }

        const filtered = applyFieldSelection(payload, view.fields);
        const fields = collectFields(filtered);
        sendJson(res, 200, { url: targetUrl, data: filtered, fields });
    } catch (error) {
        sendJson(res, 500, { message: 'Unable to reach the target API', error: error.message });
    }
}

function applyFieldSelection(payload, fields) {
    if (!fields || fields.length === 0) {
        return payload;
    }

    const pickFields = (item) => {
        if (!item || typeof item !== 'object') {
            return item;
        }

        return fields.reduce((acc, field) => {
            if (field in item) {
                acc[field] = item[field];
            }
            return acc;
        }, {});
    };

    if (Array.isArray(payload)) {
        return payload.map((entry) => pickFields(entry));
    }

    return pickFields(payload);
}

function loadEnvFile() {
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) {
        return;
    }

    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
        if (!line || line.trim().startsWith('#')) {
            continue;
        }
        const [key, ...rest] = line.split('=');
        const value = rest.join('=').trim();
        if (key && !(key in process.env)) {
            process.env[key.trim()] = value;
        }
    }
}

async function requestListener(req, res) {
    withCors(res);

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/api/sources' && req.method === 'GET') {
        const sources = store.listSources();
        sendJson(res, 200, { sources });
        return;
    }

    if (url.pathname === '/api/views' && req.method === 'GET') {
        const views = store.listViews();
        sendJson(res, 200, { views });
        return;
    }

    if (url.pathname === '/api/views' && req.method === 'POST') {
        try {
            const body = await readJsonBody(req);
            const created = store.addView(body);
            sendJson(res, 201, { view: created });
        } catch (error) {
            sendJson(res, 400, { message: error.message });
        }
        return;
    }

    if (url.pathname === '/api/sources' && req.method === 'POST') {
        try {
            const body = await readJsonBody(req);
            const created = store.addSource(body);
            sendJson(res, 201, { source: { ...created, credentials: undefined } });
        } catch (error) {
            sendJson(res, 400, { message: error.message });
        }
        return;
    }

    const sourceMatch = url.pathname.match(/^\/api\/sources\/(\d+)$/);
    if (sourceMatch && req.method === 'GET') {
        const source = store.getSource(Number(sourceMatch[1]));
        if (!source) {
            notFound(res);
            return;
        }
        sendJson(res, 200, { source: { ...source, credentials: undefined } });
        return;
    }

    const previewMatch = url.pathname.match(/^\/api\/sources\/(\d+)\/preview$/);
    if (previewMatch && req.method === 'POST') {
        const source = store.getSource(Number(previewMatch[1]));
        if (!source) {
            notFound(res);
            return;
        }
        try {
            const body = await readJsonBody(req);
            await handlePreview(source, body, res);
        } catch (error) {
            sendJson(res, 400, { message: error.message });
        }
        return;
    }

    const viewMatch = url.pathname.match(/^\/api\/views\/(\d+)$/);
    if (viewMatch && req.method === 'GET') {
        const view = store.getView(Number(viewMatch[1]));
        if (!view) {
            notFound(res);
            return;
        }
        sendJson(res, 200, { view });
        return;
    }

    const viewDataMatch = url.pathname.match(/^\/api\/views\/(\d+)\/data$/);
    if (viewDataMatch && req.method === 'GET') {
        const view = store.getView(Number(viewDataMatch[1]));
        if (!view) {
            notFound(res);
            return;
        }

        const source = store.getSource(view.sourceId);
        if (!source) {
            notFound(res);
            return;
        }

        await handleViewData(source, view, res);
        return;
    }

    if (distRoot) {
        const filePath = path.join(distRoot, url.pathname === '/' ? 'index.html' : url.pathname);
        const served = serveStaticFile(res, filePath);
        if (!served && url.pathname === '/') {
            res.writeHead(404);
            res.end('Build the Angular app to serve assets.');
        } else if (!served && distRoot) {
            const fallback = path.join(distRoot, 'index.html');
            if (!serveStaticFile(res, fallback)) {
                res.writeHead(404);
                res.end('File not found');
            }
        }
        return;
    }

    notFound(res);
}

const server = http.createServer((req, res) => {
    requestListener(req, res);
});

server.listen(PORT, () => {
    console.log(`API bridge server listening on http://localhost:${PORT}`);
    if (!distRoot) {
        console.log('Angular dist folder not found. Build the app to enable static hosting.');
    }
});
