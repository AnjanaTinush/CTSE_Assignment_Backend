# Running the Microservices Locally (Without Docker)

This guide provides step-by-step instructions on how to start each microservice manually using Node.js instead of `docker-compose`. This is typically used for debugging an individual microservice while coding.

## Prerequisites
- **Node.js**: Ensure Node.js (v18+) is installed on your Mac (`node -v`).
- **NPM**: Ensure npm is installed (`npm -v`).
- The `.env` files are automatically configured with your live MongoDB Atlas URIs.

---

## Warning about the API Gateway
Because each microservice points its `axios` HTTP calls to URLs defined in `.env` (like `AUTH_SERVICE_URL=http://auth-service:3001`), **if you run services locally without Docker**, the default `http://auth-service:3001` hostname **will not work**. Docker creates these hostnames.

If you are running the backend services on your Mac directly, you must change the `.env` files to use `localhost`.

### Step 1: Fix `.env` URLs for Localhost
In *every* microservice folder (`auth-service/`, `product-service/`, `order-service/`, `delivery-service/`, and `api-gateway/`), open the `.env` file and replace the Docker URLs with `localhost`.

For example, your `.env` files should look exactly like this:
```env
PORT=300x
# --- CHANGE THESE LINES FOR NATIVE LOCAL RUN ---
AUTH_SERVICE_URL=http://localhost:3001
PRODUCT_SERVICE_URL=http://localhost:3002
ORDER_SERVICE_URL=http://localhost:3003
DELIVERY_SERVICE_URL=http://localhost:3004
# -----------------------------------------------
MONGO_URI=mongodb+srv://anjana2:anjana@cluster0.rg6ebmf.mongodb.net/...
JWT_SECRET=supersecretjwtkey_ctse
```

---

## Step 2: Install Dependencies
You must install the `node_modules` for every service manually since Docker typically handles this for you.

Open a terminal and run these commands sequentially:
```bash
cd auth-service && npm install
cd ../product-service && npm install
cd ../order-service && npm install
cd ../delivery-service && npm install
cd ../api-gateway && npm install
cd ..
```

---

## Step 3: Start the Services
To run the full stack locally without docker, you need to open **5 separate terminal tabs** and start each service individually so they all run at the same time.

**Terminal Tab 1:**
```bash
cd auth-service
npm run start
# OR simply run: node server.js
```

**Terminal Tab 2:**
```bash
cd product-service
node server.js
```

**Terminal Tab 3:**
```bash
cd order-service
node server.js
```

**Terminal Tab 4:**
```bash
cd delivery-service
node server.js
```

**Terminal Tab 5 (API Gateway):**
```bash
cd api-gateway
node server.js
```

---

## Step 4: Verify Success
If everything is working, you should see console logs in each terminal matching:
- `Auth Service running on port 3001`
- `Auth MongoDB Connected: cluster0.rg6ebmf.mongodb.net`
- `API Gateway is running on port 3000`

You can now use Postman to send requests exactly as defined in `postman.md` pointing to `http://localhost:3000`.
