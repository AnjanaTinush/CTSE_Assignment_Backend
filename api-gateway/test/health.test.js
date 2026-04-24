const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const gatewayModulePath = require.resolve('../server');

const loadGatewayApp = () => {
    delete require.cache[gatewayModulePath];
    return require('../server');
};

test('api-gateway health endpoint returns OK', { concurrency: false }, async () => {
    const app = loadGatewayApp();
    const server = app.listen(0);

    try {
        const { port } = server.address();
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        assert.equal(res.status, 200);

        const body = await res.json();
        assert.equal(body.status, 'OK');
        assert.equal(body.service, 'api-gateway');
    } finally {
        server.close();
    }
});

test('api-gateway blocks internal user routes for /api prefix', { concurrency: false }, async () => {
    const app = loadGatewayApp();
    const server = app.listen(0);

    try {
        const { port } = server.address();
        const res = await fetch(`http://127.0.0.1:${port}/api/users/internal/123`);
        assert.equal(res.status, 404);

        const body = await res.json();
        assert.equal(body.message, 'Not Found');
    } finally {
        server.close();
    }
});

test('api-gateway proxies /api/products to product-service', { concurrency: false }, async () => {
    const productService = http.createServer((req, res) => {
        if (req.url === '/products' || req.url === '/products/') {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify([{ id: 'p1', name: 'Sample Product' }]));
            return;
        }

        res.statusCode = 404;
        res.end('Not Found');
    });

    await new Promise((resolve) => productService.listen(0, resolve));
    const { port: productPort } = productService.address();

    const previousProductServiceUrl = process.env.PRODUCT_SERVICE_URL;
    process.env.PRODUCT_SERVICE_URL = `http://127.0.0.1:${productPort}`;

    const app = loadGatewayApp();
    const gatewayServer = app.listen(0);

    try {
        const { port } = gatewayServer.address();
        const res = await fetch(`http://127.0.0.1:${port}/api/products`);
        assert.equal(res.status, 200);

        const body = await res.json();
        assert.equal(Array.isArray(body), true);
        assert.equal(body[0].id, 'p1');
    } finally {
        gatewayServer.close();
        await new Promise((resolve) => productService.close(resolve));

        if (previousProductServiceUrl === undefined) {
            delete process.env.PRODUCT_SERVICE_URL;
        } else {
            process.env.PRODUCT_SERVICE_URL = previousProductServiceUrl;
        }
    }
});
