const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const productRoutes = require('./routes/productRoutes');

const app = express();

const corsOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim()) : '*';

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests, please try again later.' }
});

app.use(express.json());
app.use(cors({ origin: corsOrigins }));
app.use(helmet());
app.use(morgan('dev'));
app.use(globalLimiter);

const swaggerDocument = YAML.load(path.join(__dirname, 'openapi.yaml'));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// 🚀 ROUTE CONFIGURATION
app.use('/products', productRoutes);



app.get('/health', (req, res) => res.status(200).json({ status: 'OK', service: 'product-service' }));

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Internal Server Error', error: err.message });
});

module.exports = app;
