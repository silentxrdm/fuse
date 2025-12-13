const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { collectFields } = require('./schema');
const { SourceStore } = require('./storage');
const { readJsonBody, sendJson, serveStaticFile, withCors, resolveDistPath } = require('./http-helpers');
const { sign, verify } = require('./jwt');
const { buildRequestInit, buildTargetUrl } = require('./request-builder');
const network = require('./network');

loadEnvFile();

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const SECRET = process.env.APP_SECRET || 'change-this-secret-in-production';
const DB_PATH = path.join(__dirname, '..', 'data', 'sources.sqlite');

const store = new SourceStore(DB_PATH, SECRET);
const distRoot = resolveDistPath();

function requireUser(req, res) {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;
    const payload = verify(token, SECRET);
    if (!payload?.sub) {
        sendJson(res, 401, { message: 'Unauthorized' });
        return null;
    }

    const user = store.getUser(payload.sub);
    if (!user) {
        sendJson(res, 401, { message: 'Unauthorized' });
        return null;
    }

    return user;
}

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

    if (url.pathname === '/api/auth/sign-in' && req.method === 'POST') {
        try {
            const body = await readJsonBody(req);
            const email = body.email?.trim().toLowerCase();
            const password = body.password;
            const user = store.findUserByEmail(email);
            if (!user || !store.verifyPassword(password, user.passwordHash)) {
                sendJson(res, 401, { message: 'Invalid credentials' });
                return;
            }

            const token = sign({ sub: user.id, email: user.email }, SECRET, 60 * 60 * 4);
            sendJson(res, 200, { accessToken: token, user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar } });
        } catch (error) {
            sendJson(res, 400, { message: error.message });
        }
        return;
    }

    if (url.pathname === '/api/auth/sign-in-with-token' && req.method === 'POST') {
        try {
            const body = await readJsonBody(req);
            const payload = verify(body.accessToken, SECRET);
            if (!payload?.sub) {
                sendJson(res, 401, { message: 'Invalid token' });
                return;
            }
            const user = store.getUser(payload.sub);
            if (!user) {
                sendJson(res, 401, { message: 'User not found' });
                return;
            }
            const token = sign({ sub: user.id, email: user.email }, SECRET, 60 * 60 * 4);
            sendJson(res, 200, { accessToken: token, user });
        } catch (error) {
            sendJson(res, 400, { message: error.message });
        }
        return;
    }

    if (url.pathname === '/api/auth/sign-up' && req.method === 'POST') {
        try {
            const body = await readJsonBody(req);
            const user = store.createUser(body);
            const token = sign({ sub: user.id, email: user.email }, SECRET, 60 * 60 * 4);
            sendJson(res, 201, { accessToken: token, user });
        } catch (error) {
            sendJson(res, 400, { message: error.message });
        }
        return;
    }

    if (url.pathname === '/api/common/user' && req.method === 'GET') {
        const user = requireUser(req, res);
        if (!user) return;
        sendJson(res, 200, user);
        return;
    }

    if (url.pathname === '/api/common/user' && req.method === 'PATCH') {
        const user = requireUser(req, res);
        if (!user) return;
        try {
            const body = await readJsonBody(req);
            const updated = store.updateUser(user.id, body.user || {});
            sendJson(res, 200, updated);
        } catch (error) {
            sendJson(res, 400, { message: error.message });
        }
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

    if (url.pathname === '/api/pages' && req.method === 'GET') {
        const pages = store.listPages();
        sendJson(res, 200, { pages });
        return;
    }

    if (url.pathname === '/api/pages' && req.method === 'POST') {
        try {
            const body = await readJsonBody(req);
            const page = store.addPage(body);
            sendJson(res, 201, { page });
        } catch (error) {
            sendJson(res, 400, { message: error.message });
        }
        return;
    }

    const pageSlugMatch = url.pathname.match(/^\/api\/pages\/([^/]+)$/);
    if (pageSlugMatch && req.method === 'GET') {
        const page = store.getPageBySlug(pageSlugMatch[1]);
        if (!page) {
            notFound(res);
            return;
        }
        sendJson(res, 200, { page });
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

    if (url.pathname === '/api/common/navigation' && req.method === 'GET') {
        const pages = store.listPages();
        const dynamicItems = pages.flatMap((page) => {
            const listItem = {
                id: `page-${page.slug}`,
                title: page.title,
                type: 'basic',
                icon: 'heroicons_outline:rectangle-group',
                link: `/pages/${page.slug}`,
            };
            if (page.editViewId) {
                return [
                    listItem,
                    {
                        id: `page-${page.slug}-edit`,
                        title: `${page.title} (Edit)`,
                        type: 'basic',
                        icon: 'heroicons_outline:pencil-square',
                        link: `/pages/${page.slug}/edit`,
                    },
                ];
            }
            return [listItem];
        });

        const baseItem = {
            id: 'example',
            title: 'Data sources',
            type: 'basic',
            icon: 'heroicons_outline:table-cells',
            link: '/example',
        };

        const networkItem = {
            id: 'network',
            title: 'Network scan',
            type: 'basic',
            icon: 'heroicons_outline:signal',
            link: '/network',
        };

        const navigation = {
            default: [baseItem, networkItem, ...dynamicItems],
            compact: [baseItem, networkItem, ...dynamicItems],
            futuristic: [baseItem, networkItem, ...dynamicItems],
            horizontal: [baseItem, networkItem, ...dynamicItems],
        };

        sendJson(res, 200, navigation);
        return;
    }

    if (url.pathname === '/api/network/scan' && req.method === 'GET') {
        const subnet = url.searchParams.get('subnet') || undefined;
        try {
            const result = await network.scan(subnet);
            sendJson(res, 200, result);
        } catch (error) {
            sendJson(res, 500, { message: 'Network scan failed', error: error.message });
        }
        return;
    }

    if (url.pathname === '/api/network/servers' && req.method === 'GET') {
        sendJson(res, 200, { hosts: store.listNetworkHosts() });
        return;
    }

    if (url.pathname === '/api/network/servers' && req.method === 'POST') {
        try {
            const body = await readJsonBody(req);
            const host = store.upsertNetworkHost({ ...body, lastSeen: body?.lastSeen || new Date().toISOString() });
            sendJson(res, 201, host);
        } catch (error) {
            sendJson(res, 400, { message: error.message });
        }
        return;
    }

    if (url.pathname === '/api/network/servers/import' && req.method === 'POST') {
        try {
            const body = await readJsonBody(req);
            const hosts = Array.isArray(body?.hosts) ? body.hosts : [];
            const saved = hosts
                .map((h) => {
                    try {
                        return store.upsertNetworkHost({ ...h, source: h?.source || 'scan', lastSeen: new Date().toISOString() });
                    } catch (error) {
                        return null;
                    }
                })
                .filter(Boolean);
            sendJson(res, 200, { hosts: saved });
        } catch (error) {
            sendJson(res, 400, { message: error.message });
        }
        return;
    }

    const networkServiceMatch = url.pathname.match(/^\/api\/network\/servers\/(\d+)\/services$/);
    if (networkServiceMatch && req.method === 'POST') {
        const host = store.getNetworkHost(Number(networkServiceMatch[1]));
        if (!host) {
            notFound(res);
            return;
        }
        try {
            const body = await readJsonBody(req);
            const updated = store.addNetworkService(host.id, body || {});
            sendJson(res, 200, updated);
        } catch (error) {
            sendJson(res, 400, { message: error.message });
        }
        return;
    }

    const networkPortScanMatch = url.pathname.match(/^\/api\/network\/servers\/(\d+)\/scan-ports$/);
    if (networkPortScanMatch && req.method === 'POST') {
        const host = store.getNetworkHost(Number(networkPortScanMatch[1]));
        if (!host) {
            notFound(res);
            return;
        }
        try {
            const body = await readJsonBody(req);
            const openPorts = await network.scanPorts(host.ip, body?.ports);
            const merged = [
                ...(host.services || []).filter((svc) => !openPorts.find((o) => o.port === svc.port)),
                ...openPorts,
            ];
            const updated = store.replaceNetworkServices(host.id, merged);
            sendJson(res, 200, { host: updated, openPorts });
        } catch (error) {
            sendJson(res, 500, { message: error.message });
        }
        return;
    }

    const viewSubmitMatch = url.pathname.match(/^\/api\/views\/(\d+)\/submit$/);
    if (viewSubmitMatch && req.method === 'POST') {
        const view = store.getView(Number(viewSubmitMatch[1]));
        if (!view) {
            notFound(res);
            return;
        }
        const source = store.getSource(view.sourceId);
        if (!source) {
            notFound(res);
            return;
        }
        try {
            const body = await readJsonBody(req);
            const targetUrl = buildTargetUrl(source, body?.path || view.path || '');
            if (!targetUrl) {
                sendJson(res, 400, { message: 'Invalid target path' });
                return;
            }
            const method = (body.method || view.method || 'POST').toUpperCase();
            const init = buildRequestInit(source, body.payload || view.payload, method);
            const response = await fetch(targetUrl, init);
            const text = await response.text();
            if (!response.ok) {
                sendJson(res, response.status, { message: 'Request failed', payload: text });
                return;
            }
            sendJson(res, 200, { message: 'Submitted', status: response.status, payload: text });
        } catch (error) {
            sendJson(res, 500, { message: error.message });
        }
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
    } else {
        console.log(`Serving static assets from ${distRoot}`);
    }
});
