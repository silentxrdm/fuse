function buildRequestInit(source, body, method = 'GET') {
    const headers = new Headers();
    headers.set('Accept', 'application/json');
    const credentials = source.credentials || {};

    switch (source.authType) {
        case 'apiKeyHeader':
            if (credentials.header && credentials.value) {
                headers.set(credentials.header, credentials.value);
            }
            break;
        case 'bearer':
            if (credentials.token) {
                headers.set('Authorization', `Bearer ${credentials.token}`);
            }
            break;
        case 'basic':
            if (credentials.username && credentials.password) {
                const token = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
                headers.set('Authorization', `Basic ${token}`);
            }
            break;
        default:
            break;
    }

    const init = { method, headers };

    if (body && method !== 'GET') {
        headers.set('Content-Type', 'application/json');
        init.body = JSON.stringify(body);
    }

    return init;
}

function buildTargetUrl(source, pathFragment) {
    try {
        return new URL(pathFragment || '', source.baseUrl).toString();
    } catch (error) {
        return null;
    }
}

module.exports = {
    buildRequestInit,
    buildTargetUrl,
};
