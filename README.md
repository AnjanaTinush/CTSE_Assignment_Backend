# CTSE Microservices Backend

**SE4010 – Current Trends in Software Engineering (2026 S1)**  
Cloud Computing Assignment – Group Microservices Application

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Microservices & Ports](#2-microservices--ports)
3. [Inter-Service Communication](#3-inter-service-communication)
4. [Technology Stack](#4-technology-stack)
5. [Security Measures](#5-security-measures)
6. [Prerequisites](#6-prerequisites)
7. [Local Development (Docker Compose)](#7-local-development-docker-compose)
8. [Running Tests](#8-running-tests)
9. [CI/CD Pipeline](#9-cicd-pipeline)
10. [Cloud Deployment – Kubernetes (EKS / GKE / AKS)](#10-cloud-deployment--kubernetes)
11. [Cloud Deployment – AWS ECS](#11-cloud-deployment--aws-ecs)
12. [API Reference](#12-api-reference)
13. [Environment Variables](#13-environment-variables)
14. [Repository Secrets & Variables Required](#14-repository-secrets--variables-required)
15. [DevSecOps – SonarCloud & Snyk](#15-devsecops--sonarcloud--snyk)

---

## 1. Architecture Overview

```
                        ┌─────────────────────────────────────┐
                        │          Internet / Client           │
                        └──────────────────┬──────────────────┘
                                           │  HTTP :80 / :3300
                        ┌──────────────────▼──────────────────┐
                        │              API Gateway             │
                        │           (port 3300)                │
                        │   • Rate limiting (300 req/15 min)   │
                        │   • Helmet security headers          │
                        │   • Reverse proxy to all services    │
                        └─────┬────────┬──────────┬───────────┘
                              │        │          │           │
                    ┌─────────▼─┐  ┌───▼────┐  ┌─▼──────┐  ┌▼──────────┐
                    │  Auth     │  │Product │  │ Order  │  │ Delivery  │
                    │ Service   │  │Service │  │Service │  │  Service  │
                    │ :3301     │  │ :3302  │  │ :3303  │  │  :3304    │
                    └─────┬─────┘  └───┬────┘  └─┬──────┘  └──────┬───┘
                          │            │ calls    │  calls          │  calls
                          │◄───────────┘          │                 │
                          │  (seller info)    ┌───▼──────┐         │
                          │                   │ Product  │         │
                          │◄──────────────────│ Service  │         │
                          │  (user orders)    │ reserve/ │         │
                                              │ release  │         │
                          ┌────────────────────────────────────────┘
                          │  (order status sync)
                    ┌─────▼──────────┐
                    │  Order Service │
                    └────────────────┘

    Each service has its own MongoDB Atlas database (separate connection URI).
    Internal traffic stays within the cluster / Docker network (never public).
```

**Communication paths:**

| Caller           | Callee          | Purpose                                                                             |
| ---------------- | --------------- | ----------------------------------------------------------------------------------- |
| Auth Service     | Order Service   | `GET /users/me/orders` – fetch a user's order history                               |
| Product Service  | Auth Service    | `GET /users/:id/public` – enrich product listings with seller name                  |
| Order Service    | Product Service | `PATCH /products/:id/reserve` / `release` – stock reservation on order create       |
| Delivery Service | Order Service   | `GET /orders/:id` – validate order exists; `PATCH /orders/:id/status` – sync status |

---

## 2. Microservices & Ports

| Service          | Port | Responsibility                                              |
| ---------------- | ---- | ----------------------------------------------------------- |
| api-gateway      | 3300 | Single public entry point; reverse-proxies all routes       |
| auth-service     | 3301 | User registration / login, JWT issuance, user profile       |
| product-service  | 3302 | Product catalogue, stock management, seller enrichment      |
| order-service    | 3303 | Order lifecycle (PENDING → CONFIRMED → SHIPPED → DELIVERED) |
| delivery-service | 3304 | Delivery assignment and status tracking                     |

---

## 3. Inter-Service Communication

All inter-service calls are made over **HTTP using `axios`** within the private Docker / Kubernetes network. JWT tokens are forwarded in the `Authorization` header where needed.

### Example 1 – Place an Order (Order Service → Product Service)

```
POST /orders
Authorization: Bearer <jwt>
{
  "items": [{ "productId": "...", "quantity": 2 }]
}
```

1. Order Service calls `GET /products/:id` on Product Service to fetch price and check stock.
2. If sufficient stock, calls `PATCH /products/:id/reserve` to atomically decrement stock.
3. If any step fails, a compensating `PATCH /products/:id/release` rolls back previously reserved items.

### Example 2 – Get My Orders (Auth Service → Order Service)

```
GET /users/me/orders
Authorization: Bearer <jwt>
```

Auth Service calls `GET /orders/by-user/:userId` on Order Service and returns the response.

### Example 3 – Create Delivery (Delivery Service → Order Service)

```
POST /deliveries
Authorization: Bearer <jwt>
{ "orderId": "...", "address": "..." }
```

1. Delivery Service validates the order exists via `GET /orders/:id`.
2. After creating the delivery record, calls `PATCH /orders/:id/status` to mark the order as `SHIPPED`.
3. When delivery is marked `DELIVERED`, calls the same endpoint to mark the order `DELIVERED`.

### Example 4 – List Products with Seller Info (Product Service → Auth Service)

```
GET /products
```

For each product, Product Service calls `GET /users/:sellerId/public` on Auth Service to attach the seller's name.

---

## 4. Technology Stack

| Layer              | Technology                              |
| ------------------ | --------------------------------------- |
| Runtime            | Node.js 20 LTS                          |
| Framework          | Express 5                               |
| Database           | MongoDB Atlas (Mongoose ODM)            |
| Authentication     | JWT (jsonwebtoken)                      |
| Input validation   | Joi                                     |
| Security headers   | Helmet                                  |
| Rate limiting      | express-rate-limit                      |
| API documentation  | Swagger UI + OpenAPI 3.0 (YAML)         |
| Containerisation   | Docker (multi-stage, non-root user)     |
| Orchestration      | Kubernetes (EKS / GKE / AKS) or AWS ECS |
| CI/CD              | GitHub Actions                          |
| Container registry | Docker Hub                              |
| SAST               | SonarCloud                              |
| SCA / CVE scanning | Snyk                                    |

---

## 5. Security Measures

| Measure             | Implementation                                                              |
| ------------------- | --------------------------------------------------------------------------- |
| Authentication      | JWT Bearer tokens, 30-day expiry, verified on every protected route         |
| Authorisation       | Role-based (USER / ADMIN / DELIVERY) enforced in `authorize()` middleware   |
| Password storage    | bcrypt (cost factor 10) – passwords never stored in plain text              |
| Input validation    | Joi schemas on every mutating endpoint; rejects malformed requests with 400 |
| Security headers    | Helmet adds Content-Security-Policy, X-Frame-Options, HSTS, etc.            |
| Rate limiting       | 15 req/15 min on auth endpoints; 100-300 req/15 min globally per IP         |
| CORS                | Configurable via `CORS_ORIGIN` env variable (defaults to `*` in dev)        |
| Secrets management  | Kubernetes Secrets / ECS task environment variables – never hard-coded      |
| Non-root containers | `USER node` in every Dockerfile; `runAsNonRoot: true` in k8s PodSpec        |
| SAST scanning       | SonarCloud (GitHub Actions Step 3)                                          |
| Dependency CVE scan | Snyk (GitHub Actions Step 2)                                                |
| Least privilege     | Each service only receives the env variables it actually needs              |

---

## 6. Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop) ≥ 24
- Node.js 20 LTS (for local dev without Docker)
- A [MongoDB Atlas](https://cloud.mongodb.com) free-tier cluster (M0)
- (Cloud) `kubectl` CLI + access to EKS / GKE / AKS, OR AWS CLI for ECS

Copy and fill in environment variables:

```bash
cp .env.example .env
# Edit .env and fill in your MongoDB connection strings and JWT secret
```

---

## 7. Local Development (Docker Compose)

```bash
# 1. Clone the repository
git clone https://github.com/AnjanaTinush/CTSE_Assignment_Backend.git
cd CTSE_Assignment_Backend

# 2. Create your local .env from the template
cp .env.example .env
# Edit .env – set JWT_SECRET and all MONGO_URI values

# 3. Build and start all services
docker compose up --build

# 4. Services are available at:
#   API Gateway : http://localhost:3300
#   Auth        : http://localhost:3301/docs
#   Products    : http://localhost:3302/docs
#   Orders      : http://localhost:3303/docs
#   Delivery    : http://localhost:3304/docs
```

To stop:

```bash
docker compose down
```

---

## 8. Running Tests

```bash
# Run tests for a single service
cd auth-service && npm test

# Run tests for all services from the root
foreach ($svc in @("auth-service","product-service","order-service","delivery-service","api-gateway")) {
  Write-Host "=== $svc ==="; cd $svc; npm test; cd ..
}
```

Tests use Node's built-in test runner (`node:test`). Each service has a health-endpoint integration test under `test/health.test.js`.

---

## 9. CI/CD Pipeline

The pipeline lives in [.github/workflows/ci-cd.yml](.github/workflows/ci-cd.yml) and runs automatically on every push to `main` or `develop` and on pull requests targeting `main`.

### Pipeline Stages

```
Push / PR
    │
    ▼
┌─────────────────────────────┐
│  Stage 1 – Unit Tests       │  Runs for all 5 services in parallel
│  npm ci && npm test         │  Fails fast on test failures
└─────────────┬───────────────┘
              │ (on success)
    ┌─────────▼────────┐    ┌──────────────────────┐
    │ Stage 2 –        │    │ Stage 3 –            │
    │ Snyk SCA Scan    │    │ SonarCloud SAST      │  (runs in parallel)
    │ (if SNYK_TOKEN   │    │ (if SONAR_TOKEN      │
    │  secret set)     │    │  secret set)         │
    └─────────┬────────┘    └──────────┬───────────┘
              └──────────┬─────────────┘
                         │ (main branch only)
              ┌──────────▼──────────────┐
              │  Stage 4 –              │
              │  Docker Build & Push    │  Builds images for all 5 services
              │  → Docker Hub           │  Tags: :latest  :sha-<git-sha>
              └──────────┬──────────────┘
                         │
            ┌────────────┴────────────────┐
            │                             │
  ┌─────────▼────────┐         ┌──────────▼──────────┐
  │ Stage 5a –       │         │ Stage 5b –           │
  │ Deploy to ECS    │         │ Deploy to Kubernetes │
  │ (DEPLOY_TARGET   │         │ (DEPLOY_TARGET=k8s)  │
  │  = ecs)          │         │                      │
  └──────────────────┘         └──────────────────────┘
```

### Required GitHub Secrets & Variables

See [Section 14](#14-repository-secrets--variables-required) for the full list.

### How to Trigger a Deployment

```bash
# Push any commit to main – the full pipeline runs automatically
git add .
git commit -m "feat: your change"
git push origin main
```

---

## 10. Cloud Deployment – Kubernetes

These manifests create a dedicated namespace `ctse-app` and deploy all services with 2 replicas each. The API Gateway is exposed publicly via a `LoadBalancer` Service; all other services use `ClusterIP` (internal only).

### Step 1 – Authenticate to your cluster

```bash
# AWS EKS
aws eks update-kubeconfig --name <cluster-name> --region <region>

# Google GKE
gcloud container clusters get-credentials <cluster-name> --zone <zone>

# Azure AKS
az aks get-credentials --resource-group <rg> --name <cluster-name>
```

### Step 2 – Create the namespace and config

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
```

### Step 3 – Create the secrets

```bash
# Copy the template and fill in real values
cp k8s/secrets.template.yaml k8s/secrets.yaml
# Edit k8s/secrets.yaml – never commit this file!

kubectl apply -f k8s/secrets.yaml
```

### Step 4 – Set your Docker Hub username in the manifests

```bash
# Replace DOCKERHUB_USERNAME placeholder in all deployment files
$DOCKERHUB_USER = "your-dockerhub-username"
Get-ChildItem -Path k8s -Recurse -Filter deployment.yaml | ForEach-Object {
  (Get-Content $_.FullName) -replace 'DOCKERHUB_USERNAME', $DOCKERHUB_USER | Set-Content $_.FullName
}
```

### Step 5 – Apply all service manifests

```bash
kubectl apply -f k8s/auth-service/
kubectl apply -f k8s/product-service/
kubectl apply -f k8s/order-service/
kubectl apply -f k8s/delivery-service/
kubectl apply -f k8s/api-gateway/
```

### Step 6 – Verify the deployment

```bash
# Check all pods are Running
kubectl get pods -n ctse-app

# Get the public IP of the API Gateway
kubectl get svc api-gateway -n ctse-app

# Example output:
# NAME          TYPE           CLUSTER-IP     EXTERNAL-IP      PORT(S)
# api-gateway   LoadBalancer   10.100.0.10    <PUBLIC-IP>      80:3300/TCP
```

### Step 7 – Test the deployment

```bash
PUBLIC_IP=$(kubectl get svc api-gateway -n ctse-app -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# Health check
curl http://$PUBLIC_IP/health

# Register a user
curl -X POST http://$PUBLIC_IP/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'
```

### Rolling Update (no downtime)

```bash
# Update a service image and apply
kubectl set image deployment/auth-service auth-service=<dockerhub-user>/auth-service:sha-<new-sha> -n ctse-app
kubectl rollout status deployment/auth-service -n ctse-app
```

### Teardown

```bash
kubectl delete namespace ctse-app
```

---

## 11. Cloud Deployment – AWS ECS

> Use this if you prefer AWS ECS (Elastic Container Service) instead of Kubernetes.

### Step 1 – Push images to Docker Hub

Handled automatically by the CI/CD pipeline on merge to `main`.

### Step 2 – Create ECS Task Definitions

For each service (`auth-service`, `product-service`, `order-service`, `delivery-service`, `api-gateway`):

1. Open ECS → Task Definitions → Create new revision.
2. Container image: `<dockerhub-user>/<service-name>:latest`.
3. Port mapping: container port as shown in [Section 2](#2-microservices--ports).
4. Environment variables: set from AWS Systems Manager Parameter Store or Secrets Manager.
5. Log configuration: AWS CloudWatch Logs.

### Step 3 – Create an ECS Cluster

```bash
aws ecs create-cluster --cluster-name ctse-app
```

### Step 4 – Create Services (one per microservice)

```bash
aws ecs create-service \
  --cluster ctse-app \
  --service-name auth-service \
  --task-definition auth-service \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<subnet-id>],securityGroups=[<sg-id>],assignPublicIp=ENABLED}"
```

Repeat for each service. Attach an Application Load Balancer to `api-gateway`.

### Step 5 – Configure CI/CD auto-deployment

Set the following in your GitHub repository (Settings → Secrets and Variables):

| Key                          | Value                                                         |
| ---------------------------- | ------------------------------------------------------------- |
| `AWS_ACCESS_KEY_ID`          | IAM user access key (least-privilege: ecs:UpdateService only) |
| `AWS_SECRET_ACCESS_KEY`      | IAM secret key                                                |
| `DEPLOY_TARGET` (variable)   | `ecs`                                                         |
| `AWS_ECS_CLUSTER` (variable) | `ctse-app`                                                    |
| `AWS_REGION` (variable)      | e.g. `us-east-1`                                              |

Every push to `main` will now trigger Stage 5a in the pipeline and call `aws ecs update-service --force-new-deployment` for all five services.

---

## 12. API Reference

Each service hosts Swagger UI at `/docs`.

| Service  | Swagger UI URL (local)     | OpenAPI spec                                                           |
| -------- | -------------------------- | ---------------------------------------------------------------------- |
| Auth     | http://localhost:3301/docs | [auth-service/src/openapi.yaml](auth-service/src/openapi.yaml)         |
| Products | http://localhost:3302/docs | [product-service/src/openapi.yaml](product-service/src/openapi.yaml)   |
| Orders   | http://localhost:3303/docs | [order-service/src/openapi.yaml](order-service/src/openapi.yaml)       |
| Delivery | http://localhost:3304/docs | [delivery-service/src/openapi.yaml](delivery-service/src/openapi.yaml) |

### Quick API Examples

```bash
BASE=http://localhost:3300  # via API Gateway

# 1. Register
curl -X POST $BASE/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com","password":"secure1234"}'

# 2. Login (returns JWT token)
TOKEN=$(curl -s -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"secure1234"}' | jq -r '.token')

# 3. Create a product (ADMIN role required)
curl -X POST $BASE/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Laptop","description":"A great laptop","price":999.99,"stock":10,"category":"Electronics"}'

# 4. Place an order (USER role)
curl -X POST $BASE/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"productId":"<product-id>","quantity":1}]}'

# 5. Create a delivery (ADMIN/DELIVERY role)
curl -X POST $BASE/deliveries \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"orderId":"<order-id>","address":"123 Main St, Colombo 01"}'
```

---

## 13. Environment Variables

### Root `.env` (used by Docker Compose)

| Variable             | Description                                                          |
| -------------------- | -------------------------------------------------------------------- |
| `JWT_SECRET`         | Shared secret for JWT signing (min 32 chars, random)                 |
| `AUTH_MONGO_URI`     | MongoDB connection string for auth-service                           |
| `PRODUCT_MONGO_URI`  | MongoDB connection string for product-service                        |
| `ORDER_MONGO_URI`    | MongoDB connection string for order-service                          |
| `DELIVERY_MONGO_URI` | MongoDB connection string for delivery-service                       |
| `CORS_ORIGIN`        | Allowed CORS origins (comma-separated, e.g. `http://localhost:3000`) |

### Per-Service Environment Variables

| Service          | Variable                                                                               | Purpose                                         |
| ---------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------- |
| auth-service     | `MONGO_URI`, `JWT_SECRET`, `ORDER_SERVICE_URL`                                         | Database, token signing, inter-service calls    |
| product-service  | `MONGO_URI`, `JWT_SECRET`, `AUTH_SERVICE_URL`                                          | Database, token verification, seller enrichment |
| order-service    | `MONGO_URI`, `JWT_SECRET`, `PRODUCT_SERVICE_URL`                                       | Database, token verification, stock reservation |
| delivery-service | `MONGO_URI`, `JWT_SECRET`, `ORDER_SERVICE_URL`                                         | Database, token verification, order status sync |
| api-gateway      | `AUTH_SERVICE_URL`, `PRODUCT_SERVICE_URL`, `ORDER_SERVICE_URL`, `DELIVERY_SERVICE_URL` | Proxy targets                                   |

---

## 14. Repository Secrets & Variables Required

Go to **Settings → Secrets and variables → Actions** in your GitHub repository.

### Secrets (sensitive – always encrypted)

| Secret Name             | Required  | Description                                                |
| ----------------------- | --------- | ---------------------------------------------------------- |
| `DOCKERHUB_USERNAME`    | ✅ for CD | Your Docker Hub username                                   |
| `DOCKERHUB_TOKEN`       | ✅ for CD | Docker Hub access token (not your password)                |
| `SNYK_TOKEN`            | Optional  | Snyk API token – enables SCA scanning                      |
| `SONAR_TOKEN`           | Optional  | SonarCloud token – enables SAST scanning                   |
| `AWS_ACCESS_KEY_ID`     | ECS only  | IAM access key for ECS deployments                         |
| `AWS_SECRET_ACCESS_KEY` | ECS only  | IAM secret key for ECS deployments                         |
| `KUBECONFIG_DATA`       | k8s only  | Base64-encoded kubeconfig (`cat ~/.kube/config \| base64`) |

### Variables (non-sensitive – visible in logs)

| Variable Name     | Required | Description                                      |
| ----------------- | -------- | ------------------------------------------------ |
| `DEPLOY_TARGET`   | Optional | Set to `ecs` or `k8s` to enable cloud deployment |
| `AWS_ECS_CLUSTER` | ECS only | ECS cluster name (e.g. `ctse-app`)               |
| `AWS_REGION`      | ECS only | AWS region (default: `us-east-1`)                |

### How to add a secret

```
GitHub Repository → Settings → Secrets and variables → Actions → New repository secret
```

---

## 15. DevSecOps – SonarCloud & Snyk

### SonarCloud Setup (Free)

1. Go to [sonarcloud.io](https://sonarcloud.io) → Sign up with GitHub.
2. Click **+** → Analyze new project → Select your repository.
3. Note the **Organization key** and **Project key**.
4. Update `sonar-project.properties` with your keys.
5. Copy the **SONAR_TOKEN** from SonarCloud → Add as a GitHub secret.
6. Push to `main` – the pipeline will automatically run SAST.

### Snyk Setup (Free)

1. Go to [snyk.io](https://snyk.io) → Sign up with GitHub.
2. Profile → Account settings → Auth Token → Copy token.
3. Add as `SNYK_TOKEN` GitHub secret.
4. Push to `main` – Snyk will scan all five `package.json` files for known CVEs.

---

## Project Structure

```
CTSE_Assignment_Backend/
├── .github/
│   └── workflows/
│       └── ci-cd.yml          # CI/CD pipeline
├── k8s/                       # Kubernetes manifests
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secrets.template.yaml
│   ├── api-gateway/
│   ├── auth-service/
│   ├── product-service/
│   ├── order-service/
│   └── delivery-service/
├── api-gateway/               # Reverse proxy
├── auth-service/              # JWT auth, user management
├── product-service/           # Product catalogue
├── order-service/             # Order lifecycle
├── delivery-service/          # Delivery tracking
├── docker-compose.yml         # Local development
├── sonar-project.properties   # SonarCloud config
└── .env.example               # Environment variable template
```

---

## Group Members

| Student                  | Service                   |
| ------------------------ | ------------------------- |
| Peiris A.L. (IT22566270) | _(your assigned service)_ |
| _(Member 2)_             | _(service)_               |
| _(Member 3)_             | _(service)_               |
| _(Member 4)_             | _(service)_               |
