require("dotenv").config();
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3300;
const DEFAULT_SERVICE_PROTOCOL = process.env.DEFAULT_SERVICE_PROTOCOL || 'https';

const buildServiceUrl = (host, port) => `${DEFAULT_SERVICE_PROTOCOL}://${host}:${port}`;

const defaultCorsOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://ctse-assignment-frontend.vercel.app",
];

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean)
  : defaultCorsOrigins;

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow if no origin (e.g. server-to-server), if wildcard is present, or if origin matches exactly
      if (!origin || corsOrigins.includes("*") || corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
  })
);

app.use(helmet());
app.use(morgan("dev"));
app.use(globalLimiter);

app.use((req, _res, next) => {
  if (req.headers["x-service-token"]) {
    delete req.headers["x-service-token"];
  }
  next();
});

app.use((req, res, next) => {
  if (req.path.startsWith("/users/internal")) {
    return res.status(404).json({ message: "Not Found" });
  }
  return next();
});

app.get("/health", (_req, res) =>
  res.status(200).json({ status: "OK", service: "api-gateway" })
);

app.use(
  "/auth",
  createProxyMiddleware({
    target: `${process.env.AUTH_SERVICE_URL || buildServiceUrl('auth-service', 3301)}/auth`,
    changeOrigin: true,
  })
);

app.use(
  "/users",
  createProxyMiddleware({
    target: `${process.env.AUTH_SERVICE_URL || buildServiceUrl('auth-service', 3301)}/users`,
    changeOrigin: true,
  })
);

app.use(
  "/products",
  createProxyMiddleware({
    target: `${process.env.PRODUCT_SERVICE_URL || buildServiceUrl('product-service', 3302)}/products`,
    changeOrigin: true,
  })
);

app.use(
  "/orders",
  createProxyMiddleware({
    target: `${process.env.ORDER_SERVICE_URL || buildServiceUrl('order-service', 3303)}/orders`,
    changeOrigin: true,
  })
);

app.use(
  "/deliveries",
  createProxyMiddleware({
    target: `${process.env.DELIVERY_SERVICE_URL || buildServiceUrl('delivery-service', 3304)}/deliveries`,
    changeOrigin: true,
  })
);

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal Server Error" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`API Gateway is running on port ${PORT}`);
  });
}

module.exports = app;