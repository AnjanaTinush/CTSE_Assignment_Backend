# CTSE API Postman Checklist

This file lists all API endpoints exposed through the API Gateway and a practical order to verify them in Postman.

## 1. Base URL

Use one of these:

- `http://localhost:3300` (if using `kubectl port-forward ... 3300:80`)
- `http://localhost:<API_GATEWAY_NODE_PORT>` (printed by `deploy-kind.sh`)

Set Postman environment variable:

- `base_url`

Example:

- `base_url = http://localhost:3300`

## 2. Postman Environment Variables

Create these variables:

- `base_url`
- `user_token`
- `admin_token`
- `delivery_token`
- `user_id`
- `product_id`
- `order_id`
- `delivery_id`

Notes:

- `/auth/register` creates users with role `USER` by default.
- For ADMIN and DELIVERY tests, use existing seeded users (or update role in DB).

## 3. Quick Test Order (Recommended)

1. `GET /health`
2. `POST /auth/register` (create USER)
3. `POST /auth/login` (save `user_token`)
4. `GET /auth/me`
5. Product flow with ADMIN token: `POST /products`, `GET /products`, `GET /products/{id}`
6. User order flow: `POST /orders`, `GET /orders/{id}`, `GET /orders/by-user/{userId}`
7. Delivery flow (ADMIN or DELIVERY): `POST /deliveries`, `PATCH /deliveries/{id}/status`

## 4. Authentication Header

For protected routes:

- Header key: `Authorization`
- Header value: `Bearer {{user_token}}` (or `{{admin_token}}`, `{{delivery_token}}`)

## 5. Endpoints

## Gateway

### Health

- Method: `GET`
- URL: `{{base_url}}/health`
- Auth: No
- Expected: `200 OK`

## Auth Service (via Gateway)

### Register User

- Method: `POST`
- URL: `{{base_url}}/auth/register`
- Auth: No
- Body:

```json
{
  "name": "Alice",
  "email": "alice@example.com",
  "password": "password123"
}
```

- Expected: `201 Created`
- Save: response `_id` as `user_id`

### Login User

- Method: `POST`
- URL: `{{base_url}}/auth/login`
- Auth: No
- Body:

```json
{
  "email": "alice@example.com",
  "password": "password123"
}
```

- Expected: `200 OK`
- Save: response `token` as `user_token`

### Get Current User

- Method: `GET`
- URL: `{{base_url}}/auth/me`
- Auth: Yes (`Bearer {{user_token}}`)
- Expected: `200 OK`

### Get Public User Profile

- Method: `GET`
- URL: `{{base_url}}/users/{{user_id}}/public`
- Auth: No
- Expected: `200 OK`

### Get Current User Orders

- Method: `GET`
- URL: `{{base_url}}/users/me/orders`
- Auth: Yes (`Bearer {{user_token}}`)
- Expected: `200 OK`

## Product Service (via Gateway)

### Create Product (ADMIN)

- Method: `POST`
- URL: `{{base_url}}/products`
- Auth: Yes (`Bearer {{admin_token}}`)
- Body:

```json
{
  "name": "Laptop",
  "description": "Business laptop",
  "price": 1200,
  "stock": 8,
  "category": "Electronics"
}
```

- Expected: `201 Created`
- Save: response `_id` as `product_id`

### List Products

- Method: `GET`
- URL: `{{base_url}}/products`
- Auth: No
- Expected: `200 OK`

### Get Product By ID

- Method: `GET`
- URL: `{{base_url}}/products/{{product_id}}`
- Auth: No
- Expected: `200 OK`

### Reserve Product Quantity

- Method: `PATCH`
- URL: `{{base_url}}/products/{{product_id}}/reserve`
- Auth: Yes (`Bearer {{user_token}}` or `{{admin_token}}` or `{{delivery_token}}`)
- Body:

```json
{
  "quantity": 1
}
```

- Expected: `200 OK`

### Release Product Quantity

- Method: `PATCH`
- URL: `{{base_url}}/products/{{product_id}}/release`
- Auth: Yes (`Bearer {{user_token}}` or `{{admin_token}}` or `{{delivery_token}}`)
- Body:

```json
{
  "quantity": 1
}
```

- Expected: `200 OK`

## Order Service (via Gateway)

### Create Order (USER)

- Method: `POST`
- URL: `{{base_url}}/orders`
- Auth: Yes (`Bearer {{user_token}}`)
- Body:

```json
{
  "items": [
    {
      "productId": "{{product_id}}",
      "quantity": 1
    }
  ]
}
```

- Expected: `201 Created`
- Save: response `_id` as `order_id`

### List All Orders (ADMIN)

- Method: `GET`
- URL: `{{base_url}}/orders`
- Auth: Yes (`Bearer {{admin_token}}`)
- Expected: `200 OK`

### Get Orders By User

- Method: `GET`
- URL: `{{base_url}}/orders/by-user/{{user_id}}`
- Auth: Yes (`Bearer {{user_token}}` for own ID, or `{{admin_token}}`)
- Expected: `200 OK`

### Get Order By ID

- Method: `GET`
- URL: `{{base_url}}/orders/{{order_id}}`
- Auth: Yes (`Bearer {{user_token}}` for owner, or `{{admin_token}}` / `{{delivery_token}}`)
- Expected: `200 OK`

### Update Order Status (ADMIN or DELIVERY)

- Method: `PATCH`
- URL: `{{base_url}}/orders/{{order_id}}/status`
- Auth: Yes (`Bearer {{admin_token}}` or `{{delivery_token}}`)
- Body:

```json
{
  "status": "SHIPPED"
}
```

Optional field:

```json
{
  "status": "SHIPPED",
  "deliveryId": "{{delivery_id}}"
}
```

- Expected: `200 OK`

Allowed `status` values:

- `PENDING`
- `CONFIRMED`
- `SHIPPED`
- `DELIVERED`
- `CANCELLED`

## Delivery Service (via Gateway)

### Create Delivery (ADMIN or DELIVERY)

- Method: `POST`
- URL: `{{base_url}}/deliveries`
- Auth: Yes (`Bearer {{admin_token}}` or `{{delivery_token}}`)
- Body:

```json
{
  "orderId": "{{order_id}}",
  "address": "123 Main Street, Colombo"
}
```

Optional field:

```json
{
  "orderId": "{{order_id}}",
  "address": "123 Main Street, Colombo",
  "estimatedDelivery": "2026-03-20T10:00:00.000Z"
}
```

- Expected: `201 Created`
- Save: response `_id` as `delivery_id`

### List Deliveries (ADMIN)

- Method: `GET`
- URL: `{{base_url}}/deliveries`
- Auth: Yes (`Bearer {{admin_token}}`)
- Expected: `200 OK`

### Get Delivery By ID (ADMIN or DELIVERY)

- Method: `GET`
- URL: `{{base_url}}/deliveries/{{delivery_id}}`
- Auth: Yes (`Bearer {{admin_token}}` or `{{delivery_token}}`)
- Expected: `200 OK`

### Update Delivery Status (ADMIN or DELIVERY)

- Method: `PATCH`
- URL: `{{base_url}}/deliveries/{{delivery_id}}/status`
- Auth: Yes (`Bearer {{admin_token}}` or `{{delivery_token}}`)
- Body:

```json
{
  "status": "IN_TRANSIT"
}
```

- Expected: `200 OK`

Allowed `status` values:

- `ASSIGNED`
- `PICKED_UP`
- `IN_TRANSIT`
- `DELIVERED`

## 6. Common Error Checks in Postman

- `401 Unauthorized`: Missing/invalid token.
- `403 Forbidden`: Token role is not allowed for the endpoint.
- `404 Not Found`: Invalid resource ID or dependent service data missing.
- `400 Bad Request`: Validation issue (missing fields, invalid enums, invalid quantity).

## 7. Optional: Service Swagger UIs

When running services directly (or with extra port-forwards), service docs are:

- Auth: `http://localhost:3301/docs`
- Product: `http://localhost:3302/docs`
- Order: `http://localhost:3303/docs`
- Delivery: `http://localhost:3304/docs`
