const fs = require('node:fs');
const path = require('node:path');

function withCors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
}

function sendJson(res, status, body) {
    withCors(res);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > 1024 * 1024) {
                reject(new Error('Request body too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });

        req.on('end', () => {
            try {
                const buffer = Buffer.concat(chunks);
                const text = buffer.toString('utf8') || '{}';
                const parsed = JSON.parse(text);
                resolve(parsed);
            } catch (error) {
                reject(error);
            }
        });

        req.on('error', reject);
    });
}

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.html':
            return 'text/html';
        case '.js':
            return 'text/javascript';
        case '.mjs':
            return 'text/javascript';
        case '.css':
            return 'text/css';
        case '.json':
            return 'application/json';
        case '.svg':
            return 'image/svg+xml';
        case '.png':
            return 'image/png';
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.gif':
            return 'image/gif';
        case '.woff':
            return 'font/woff';
        case '.woff2':
            return 'font/woff2';
        case '.ico':
            return 'image/x-icon';
        default:
            return 'application/octet-stream';
    }
}

function serveStaticFile(res, filePath) {
    const exists = fs.existsSync(filePath);
    if (!exists) {
        return false;
    }

    const stream = fs.createReadStream(filePath);
    stream.on('open', () => {
        res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
        stream.pipe(res);
    });

    stream.on('error', () => {
        res.writeHead(500);
        res.end('Unable to read file');
    });

    return true;
}

function resolveDistPath() {
    const distRoot = path.join(__dirname, '..', 'dist');
    const fuseDist = path.join(distRoot, 'fuse');

    if (fs.existsSync(fuseDist)) {
        return fuseDist;
    }

    if (!fs.existsSync(distRoot)) {
        return null;
    }

    const children = fs.readdirSync(distRoot);
    if (children.length === 1) {
        return path.join(distRoot, children[0]);
    }

    return distRoot;
}

module.exports = {
    readJsonBody,
    sendJson,
    serveStaticFile,
    withCors,
    resolveDistPath,
};
