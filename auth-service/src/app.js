const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const authRoutes = require('./routes/authRoutes');

const app = express();

const corsOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()) : '*';

// General API rate limit: 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again later.' }
});

// Strict limit for auth endpoints: 15 attempts per 15 minutes per IP
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many authentication attempts, please try again later.' }
});

app.use(express.json());
app.use(cors({ origin: corsOrigins }));
app.use(helmet());
app.use(morgan('dev'));
app.use(globalLimiter);

const swaggerDocument = YAML.load(path.join(__dirname, 'openapi.yaml'));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use('/auth/login', authLimiter);
app.use('/auth/register', authLimiter);
app.use('/auth', authRoutes);
app.use('/users', authRoutes);

app.get('/health', (req, res) => res.status(200).json({ status: 'OK', service: 'auth-service' }));

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Internal Server Error', error: err.message });
});

module.exports = app;
