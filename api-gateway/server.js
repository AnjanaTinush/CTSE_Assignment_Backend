require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3300;
const corsOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()) : '*';

// Global rate limit at the gateway: 300 requests / 15 min per IP
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again later.' }
});

app.use(cors({ origin: corsOrigins }));
app.use(helmet());
app.use(morgan('dev'));
app.use(globalLimiter);

app.get('/health', (req, res) => res.status(200).json({ status: 'OK', service: 'api-gateway' }));

const routes = {
    '/auth': process.env.AUTH_SERVICE_URL || 'http://localhost:3301',
    '/users': process.env.AUTH_SERVICE_URL || 'http://localhost:3301',
    '/products': process.env.PRODUCT_SERVICE_URL || 'http://localhost:3302',
    '/orders': process.env.ORDER_SERVICE_URL || 'http://localhost:3303',
    '/deliveries': process.env.DELIVERY_SERVICE_URL || 'http://localhost:3304'
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
