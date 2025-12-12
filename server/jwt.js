const crypto = require('node:crypto');

function base64url(input) {
    return Buffer.from(input).toString('base64url');
}

function sign(payload, secret, expiresInSeconds = 3600) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const fullPayload = { ...payload, iat: now, exp: now + expiresInSeconds };
    const headerPart = base64url(JSON.stringify(header));
    const payloadPart = base64url(JSON.stringify(fullPayload));
    const data = `${headerPart}.${payloadPart}`;
    const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    return `${data}.${signature}`;
}

function verify(token, secret) {
    if (!token) return null;
    const [headerPart, payloadPart, signature] = token.split('.');
    if (!headerPart || !payloadPart || !signature) return null;
    const data = `${headerPart}.${payloadPart}`;
    const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    if (expected !== signature) return null;
    try {
        const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            return null;
        }
        return payload;
    } catch (error) {
        return null;
    }
}

module.exports = { sign, verify };
