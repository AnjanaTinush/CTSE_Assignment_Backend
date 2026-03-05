require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3000;
const corsOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()) : '*';

app.use(cors({ origin: corsOrigins }));
app.use(helmet());
app.use(morgan('dev'));

app.get('/health', (req, res) => res.status(200).json({ status: 'OK', service: 'api-gateway' }));

const routes = {
    '/auth': process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    '/users': process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    '/products': process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002',
    '/orders': process.env.ORDER_SERVICE_URL || 'http://localhost:3003',
    '/deliveries': process.env.DELIVERY_SERVICE_URL || 'http://localhost:3004'
};

Object.entries(routes).forEach(([path, target]) => {
    app.use(path, createProxyMiddleware({
        target,
        changeOrigin: true,
        pathRewrite: (pathStr) => pathStr,
        onError: (err, req, res) => {
            console.error(`Proxy Error processing ${req.url}:`, err.message);
            res.status(502).json({ message: 'Bad Gateway', details: 'Service unavailable' });
        }
    }));
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Internal Server Error' });
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`API Gateway is running on port ${PORT}`);
    });
}

module.exports = app;
