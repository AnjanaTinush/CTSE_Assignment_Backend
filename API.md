# CTSE Backend API

This document describes the upgraded backend contract for:

- Phone-number based login (single login for USER, ADMIN, DELIVERY)
- Loyalty points and loyalty card behavior
- Product browsing and admin product management
- Order lifecycle with pending-only user edits/cancellations
- Delivery assignment and delivery-user status updates
- Inter-service communication via internal service discovery URLs

## 1. Base URL

- API Gateway (Docker): [http://localhost:3300](http://localhost:3300)
- API Gateway (Kubernetes NodePort from deploy-kind.sh): [http://localhost:30300](http://localhost:30300) (default)

All routes below are shown as gateway routes.

## 2. Authentication

Use bearer token for protected endpoints:

- Header: Authorization
- Value: Bearer TOKEN

Roles:

- USER
- ADMIN
- DELIVERY

## 3. Core Business Rules

- Email is not required.
- Registration requires name, contactNumber, password.
- Loyalty points start at 0 for USER accounts.
- Loyalty card is automatically created for USER accounts.
- Users can browse products without login.
- Only logged-in users/admin can place orders.
- Payment method is cash on delivery only.
- Delivery location (address + lat + lng) is required to place an order.
- USER can edit/cancel only pending own orders.
- ADMIN can manage users, products, orders, and delivery assignment.
- DELIVERY users can view their today assignments and set only COMPLETED or CANCELLED_BY_DELIVERY.

Order statuses:

- PENDING
- ASSIGNED
- OUT_FOR_DELIVERY
- COMPLETED
- CANCELLED_BY_USER
- CANCELLED_BY_ADMIN
- CANCELLED_BY_DELIVERY

Loyalty behavior:

- At order create: optional points redemption is deducted from user points.
- At successful order create: 1 point is awarded.
- On cancellation (user/admin/delivery): redeemed points are refunded and awarded point is removed.

## 4. Service Discovery and Inter-Service Calls

Services communicate using internal DNS URLs configured by environment variables:

- AUTH_SERVICE_URL (default in cluster: [http://auth-service:3301](http://auth-service:3301))
- PRODUCT_SERVICE_URL (default in cluster: [http://product-service:3302](http://product-service:3302))
- ORDER_SERVICE_URL (default in cluster: [http://order-service:3303](http://order-service:3303))
- DELIVERY_SERVICE_URL (default in cluster: [http://delivery-service:3304](http://delivery-service:3304))

Internal cross-service operations use x-service-token for protected internal routes.

## 5. Auth and User Management

### POST /auth/register

Public USER registration.

Body:

```json
{
  "name": "Nimal",
  "contactNumber": "+94771234567",
  "password": "pass1234"
}
```

Returns:

- User profile (including loyalty fields)
- JWT token

### POST /auth/login

Login with contact number and password.

Body:

```json
{
  "contactNumber": "+94771234567",
  "password": "pass1234"
}
```

### GET /auth/me

Protected (USER/ADMIN/DELIVERY). Returns current profile.

### GET /auth/me/orders

Protected. Returns current user order list via order-service inter-service call.

### GET /users/:id/public

Public profile endpoint used by product/order enrich flows.

### GET /users

ADMIN only. Query filters:

- role=USER|ADMIN|DELIVERY
- contactNumber=PHONE_NUMBER
- search=NAME_PART

### POST /users

ADMIN only. Create managed user (ADMIN/USER/DELIVERY).

Body:

```json
{
  "name": "Delivery One",
  "contactNumber": "+94770001122",
  "password": "pass1234",
  "role": "DELIVERY"
}
```

### GET /users/:id

Protected. ADMIN can fetch any profile; users can fetch own profile.

### GET /users/by-contact/:contactNumber

ADMIN only. Lookup customer/user by contact number.

### POST /users/customers/lookup-or-create

ADMIN only. Finds USER by contact, or creates one automatically if not present.

If created:

- role is USER
- password defaults to contactNumber
- loyalty card is created

Body:

```json
{
  "contactNumber": "+94775554433",
  "name": "Walk-in Customer"
}
```

### PATCH /users/:id/loyalty

ADMIN only. Manual loyalty adjustment.

Body:

```json
{
  "operation": "ADD",
  "points": 10,
  "reason": "Customer compensation"
}
```

operation values: ADD, DEDUCT

## 6. Product APIs

### GET /products

Public listing with seller profile enrichment.

Optional query:

- search=NAME
- category=CATEGORY
- inStock=true|false

### GET /products/:id

Public product details.

### POST /products

ADMIN only. Create product.

Body:

```json
{
  "name": "Rice 5kg",
  "description": "Premium white rice",
  "price": 540,
  "stock": 60,
  "category": "Grocery",
  "imageUrl": "https://example.com/rice.jpg"
}
```

### PATCH /products/:id

ADMIN only. Update any product fields.

### DELETE /products/:id

ADMIN only. Permanently delete product.

### PATCH /products/:id/reserve

Protected (USER/ADMIN/DELIVERY). Internal order stock reservation endpoint.

Body:

```json
{
  "quantity": 2
}
```

### PATCH /products/:id/release

Protected (USER/ADMIN/DELIVERY). Internal rollback/release endpoint.

## 7. Order APIs

### POST /orders

Protected (USER or ADMIN).

For USER flow:

- creates order for current logged user

For ADMIN flow:

- must provide customerContactNumber (system finds or auto-creates customer)

Body:

```json
{
  "items": [
    { "productId": "<product-id>", "quantity": 2 },
    { "productId": "<product-id>", "quantity": 1 }
  ],
  "deliveryLocation": {
    "address": "No.10, Main Street, Colombo",
    "latitude": 6.9271,
    "longitude": 79.8612
  },
  "loyaltyPointsToUse": 5,
  "customerContactNumber": "+94775554433"
}
```

Notes:

- customerContactNumber is required only when ADMIN places order.
- loyaltyPointsToUse is optional.

### GET /orders

ADMIN only. Query filters:

- status=STATUS
- deliveryUserId=DELIVERY_USER_ID
- contactNumber=PHONE_NUMBER

### GET /orders/my

Protected (USER/ADMIN). Returns orders for current token user.

### GET /orders/by-user/:userId

Protected. ADMIN or same user only.

### GET /orders/:id

Protected. ADMIN, owner USER, or assigned DELIVERY user.

### GET /orders/:id/tracking

Protected. Returns order status + assignment + delivery record snapshot.

### PATCH /orders/:id

USER only. Edit pending own order.

Allowed fields:

- items
- deliveryLocation

Rule: only when status is PENDING.

### PATCH /orders/:id/cancel

Protected (USER/ADMIN/DELIVERY).

Rules:

- USER: only own order and only PENDING
- ADMIN: can cancel non-terminal orders
- DELIVERY: only assigned orders

Body:

```json
{
  "reason": "Customer requested cancellation"
}
```

### PATCH /orders/:id/assign-delivery

ADMIN only. Assign delivery user to order and moves order to ASSIGNED.

Body:

```json
{
  "deliveryUserId": "<delivery-user-id>",
  "deliveryUserName": "Rider A",
  "deliveryId": "<optional-existing-delivery-id>"
}
```

### PATCH /orders/:id/status

ADMIN or DELIVERY.

Allowed statuses:

- ASSIGNED
- OUT_FOR_DELIVERY
- COMPLETED
- CANCELLED_BY_ADMIN
- CANCELLED_BY_DELIVERY

Rule for DELIVERY role:

- can only set COMPLETED or CANCELLED_BY_DELIVERY

### DELETE /orders/:id

ADMIN only. Permanently deletes order.

## 8. Delivery APIs

### POST /deliveries/assign

ADMIN only. Assigns delivery user to an order.

Body:

```json
{
  "orderId": "<order-id>",
  "deliveryUserId": "<delivery-user-id>",
  "deliveryUserName": "Rider A",
  "notes": "Handle carefully"
}
```

Alias: POST /deliveries (same behavior)

### GET /deliveries

ADMIN only. Query:

- status=STATUS
- deliveryUserId=DELIVERY_USER_ID

### GET /deliveries/my/today

DELIVERY only. Returns current day assigned deliveries for logged delivery user.

### GET /deliveries/:id

ADMIN or assigned DELIVERY user.

### GET /deliveries/order/:orderId

Protected (USER/ADMIN/DELIVERY).

- USER can access only if they can access the related order.

### PATCH /deliveries/:id/status

ADMIN or DELIVERY.

Body:

```json
{
  "status": "COMPLETED",
  "notes": "Handed over to customer"
}
```

Allowed values:

- OUT_FOR_DELIVERY
- COMPLETED
- CANCELLED_BY_DELIVERY

Rule for DELIVERY role:

- can only set COMPLETED or CANCELLED_BY_DELIVERY

## 9. Typical End-to-End Flows

### Customer Flow

1. Browse products: GET /products
2. Register/Login: POST /auth/register or POST /auth/login
3. Place order with map location: POST /orders
4. View order history: GET /orders/my
5. Edit pending order: PATCH /orders/:id
6. Cancel pending order: PATCH /orders/:id/cancel
7. Track assigned delivery: GET /orders/:id/tracking

### Admin Flow

1. Login as ADMIN: POST /auth/login
2. Manage users by role: GET /users?role=...
3. Search or auto-create customer by phone: POST /users/customers/lookup-or-create
4. Manage products: POST/PATCH/DELETE /products
5. View/manage all orders: GET /orders, PATCH /orders/:id/status
6. Assign delivery: POST /deliveries/assign
7. Permanently delete order if needed: DELETE /orders/:id

### Delivery Flow

1. Login as DELIVERY: POST /auth/login
2. View today assignments: GET /deliveries/my/today
3. Complete or cancel assigned delivery: PATCH /deliveries/:id/status

## 10. Common Error Responses

- 400 Bad Request: validation failures, insufficient stock, invalid status transitions
- 401 Unauthorized: missing or invalid token
- 403 Forbidden: role/ownership violation
- 404 Not Found: user/product/order/delivery not found
- 502 Bad Gateway: downstream service call failure
