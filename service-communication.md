# Service-To-Service Communication Details

This document provides a highly technical explanation of exactly how our microservices communicate with one another, addressing **Milestone 4 (10%)** of the CTSE Assignment.

## Overview of the Architecture
Unlike monolithic applications where functions can be called directly from memory, a **microservices architecture requires inter-process communication** since each service is an independently running program with its own isolated database.

We achieve this via **Synchronous RESTful HTTP Calls** utilizing Node.js's `axios` library over the internal Docker network created by our `docker-compose.yml`. We pass the original `Authorization: Bearer <TOKEN>` header between all internal requests to maintain security context.

---

## 1. Auth/User Service → Order Service
*(Role: Let a user view their own past orders without needing to expose the generic `/orders` list to the public).*

- **Trigger Endpoint**: `GET /users/me/orders` on the `auth-service`
- **Internal Call Method**:
  ```javascript
  const { data } = await axios.get(`${process.env.ORDER_SERVICE_URL}/orders/by-user/${userId}`);
  res.json(data);
  ```
- **Technical Explanation**: When a user logs in, they request their order history from the Auth service. The Auth service holds their User ID but doesn't have an Orders database. So, the Auth service fires an internal HTTP GET request to the restricted `order-service` asking exclusively for orders matching that `userId`, formats the JSON response, and returns it to the client.

---

## 2. Product Service → Auth/User Service
*(Role: Let a user see the name/details of the seller when browsing products).*

- **Trigger Endpoint**: `GET /products` on the `product-service`
- **Internal Call Method**:
  ```javascript
  // Inside a Promise.all() loop fetching each product:
  const { data } = await axios.get(`${process.env.AUTH_SERVICE_URL}/users/${product.sellerId}/public`);
  return { ...product.toObject(), seller: data };
  ```
- **Technical Explanation**: The Product database only stores a `sellerId` string. When a customer fetches the `products` list, the Product service needs more human-readable data (e.g., the Seller's name and contact email). It loops through the products and fires a `GET` request to the `auth-service`'s public user endpoint, seamlessly "enriching" the JSON payload with a `{ seller: { name: "John Doe", email: "..." }}` object before returning it to the frontend.

---

## 3. Order Service → Product Service
*(Role: Ensure an item is in stock before charging the customer, and deduct that stock when the order finalizes).*

- **Trigger Endpoint**: `POST /orders` on the `order-service`
- **Internal Call Method**:
  ```javascript
  // 1. Validate Product stock exists
  const productRes = await axios.get(`${process.env.PRODUCT_SERVICE_URL}/products/${item.productId}`);
  if (productRes.data.stock < item.quantity) { throw Error('Insufficient stock'); }

  // 2. Reserve the stock
  await axios.patch(`${process.env.PRODUCT_SERVICE_URL}/products/${item.productId}/reserve`, {}, {
    headers: { Authorization: req.headers.authorization }
  });
  ```
- **Technical Explanation**: This is our most critical interaction. A customer tries to buy 5 laptops. The Order service cannot check `product_db` directly (database isolation). It makes an HTTP request to the Product Service asking for Laptop details. If the `stock` is >= 5, it proceeds. It then shoots a synchronous `PATCH` request to the `product-service` to immediately deduct 5 from the stock (preventing race conditions) before it physically creates the Order record in `order_db`.

---

## 4. Delivery Service → Order Service
*(Role: Allow warehouse/delivery drivers to log shipments and have the customer automatically see their order updated to 'SHIPPED/DELIVERED').*

- **Trigger Endpoint**: `POST /deliveries` and `PATCH /deliveries/:id/status` on the `delivery-service`
- **Internal Call Method**:
  ```javascript
  // When a delivery is created:
  await axios.patch(`${process.env.ORDER_SERVICE_URL}/orders/${orderId}/status`, 
    { status: 'SHIPPED', deliveryId: delivery._id },
    { headers: { Authorization: req.headers.authorization } }
  );
  ```
- **Technical Explanation**: Deliveries are heavily dependent on Orders. You cannot deliver an invalid order. First, the Delivery service uses `axios` to ensure the `orderId` exists. If valid, the Delivery is created. Then, it fires a `PATCH` request *back* to the Order service, telling it to update the Order's status from `PENDING` to `SHIPPED` (or `DELIVERED`). This way, when the customer checks their Auth Service `GET /users/me/orders` profile later, the status reflects exactly what the Delivery system updated it to. 

---

## Technical Edge Cases Handled:
- **Authorization Propagation**: When `order-service` calls `product-service` to reserve stock, it inherits and forwards the specific `Authorization` header (`req.headers.authorization`) down the chain. This guarantees the Product Service can still run Role Checks (`USER / ADMIN`) seamlessly as if the browser clicked it directly.
- **Service Discovery**: Instead of hardcoding IPs (which break when cloud deployment scales out containers), we use Docker internal DNS. `http://product-service:3002` automatically routes over the `ctse-network` bridge directly to the container named `product-service`, regardless of whether this is running on your Mac or Amazon Fargate.
