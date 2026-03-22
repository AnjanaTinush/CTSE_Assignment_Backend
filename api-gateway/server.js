require("dotenv").config();
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3300;
const defaultCorsOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://ctse-assignment-frontend.vercel.app",
];
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : defaultCorsOrigins;

// Global rate limit at the gateway: 300 requests / 15 min per IP
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
      if (!origin || corsOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
  }),
);
app.use(helmet());
app.use(morgan("dev"));
app.use(globalLimiter);

// Never allow client traffic to forward privileged internal service headers.
app.use((req, _res, next) => {
  if (req.headers["x-service-token"]) {
    delete req.headers["x-service-token"];
  }

  next();
});

// Block internal-only auth endpoints from public access at the gateway.
app.use((req, res, next) => {
  if (req.path.startsWith("/users/internal")) {
    return res.status(404).json({ message: "Not Found" });
  }

  return next();
});

app.get("/health", (req, res) =>
  res.status(200).json({ status: "OK", service: "api-gateway" }),
);

const routes = {
  "/auth": process.env.AUTH_SERVICE_URL || "http://localhost:3301",
  "/users": process.env.AUTH_SERVICE_URL || "http://localhost:3301",
  "/products": process.env.PRODUCT_SERVICE_URL || "http://localhost:3302",
  "/orders": process.env.ORDER_SERVICE_URL || "http://localhost:3303",
  "/deliveries": process.env.DELIVERY_SERVICE_URL || "http://localhost:3304",
};

Object.entries(routes).forEach(([path, target]) => {
  app.use(
    path,
    createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: (pathStr) =>
        pathStr.startsWith(path) ? pathStr : `${path}${pathStr}`,
      onError: (err, req, res) => {
        console.error(`Proxy Error processing ${req.url}:`, err.message);
        res
          .status(502)
          .json({ message: "Bad Gateway", details: "Service unavailable" });
      },
    }),
  );
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal Server Error" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`API Gateway is running on port ${PORT}`);
  });
}

module.exports = app;
