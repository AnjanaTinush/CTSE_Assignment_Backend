const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../src/app');

test('product-service health endpoint returns OK', async () => {
    const server = app.listen(0);

    try {
        const { port } = server.address();
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        assert.equal(res.status, 200);

        const body = await res.json();
        assert.equal(body.status, 'OK');
        assert.equal(body.service, 'product-service');
    } finally {
        server.close();
    }
});
