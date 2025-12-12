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

function serveStaticFile(res, filePath) {
    const exists = fs.existsSync(filePath);
    if (!exists) {
        return false;
    }

    const stream = fs.createReadStream(filePath);
    stream.on('open', () => {
        res.writeHead(200);
        stream.pipe(res);
    });

    stream.on('error', () => {
        res.writeHead(500);
        res.end('Unable to read file');
    });

    return true;
}

function resolveDistPath() {
    const candidate = path.join(__dirname, '..', 'dist');
    if (!fs.existsSync(candidate)) {
        return null;
    }

    const children = fs.readdirSync(candidate);
    if (children.length === 1) {
        return path.join(candidate, children[0]);
    }

    return candidate;
}

module.exports = {
    readJsonBody,
    sendJson,
    serveStaticFile,
    withCors,
    resolveDistPath,
};
