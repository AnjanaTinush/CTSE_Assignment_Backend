# Postman API Collection Guide

This guide provides exactly what to put into Postman (URL, Method, Headers, and Body) to test every single endpoint across all 4 microservices.

**Base URL**: `http://localhost:3000` (All traffic goes through the API Gateway)

---

## 1. Auth / User Service

### 1.1 Register a New User
- **Method**: `POST`
- **URL**: `http://localhost:3000/auth/register`
- **Headers**: `Content-Type: application/json`
- **Body (raw JSON)**:
  ```json
  {
    "name": "John Doe",
    "email": "johndoe@example.com",
    "password": "Password123!",
    "role": "USER"
  }
  ```
  *(Note: You can change the role to "ADMIN" or "DELIVERY" to test different permissions later).*

### 1.2 Login User
- **Method**: `POST`
- **URL**: `http://localhost:3000/auth/login`
- **Headers**: `Content-Type: application/json`
- **Body (raw JSON)**:
  ```json
  {
    "email": "johndoe@example.com",
    "password": "Password123!"
  }
  ```
> **IMPORTANT:** Copy the `"token"` value provided in the response. You will need to put this token in the **Headers** of almost all subsequent requests below.

### 1.3 Get My Profile
- **Method**: `GET`
- **URL**: `http://localhost:3000/users/me`
- **Headers**: 
  - `Authorization`: `Bearer <paste_your_token_here>`

### 1.4 Get My Orders (Inter-service call to Order Service)
- **Method**: `GET`
- **URL**: `http://localhost:3000/users/me/orders`
- **Headers**: 
  - `Authorization`: `Bearer <paste_your_token_here>`

### 1.5 Get Public User Profile (Usually used internally, but you can test it)
- **Method**: `GET`
- **URL**: `http://localhost:3000/users/<paste_a_user_id_here>/public`

---

## 2. Product Service

### 2.1 Create a Product (Requires ADMIN role token)
- **Method**: `POST`
- **URL**: `http://localhost:3000/products`
- **Headers**: 
  - `Content-Type: application/json`
  - `Authorization`: `Bearer <paste_your_ADMIN_token_here>`
- **Body (raw JSON)**:
  ```json
  {
    "name": "Wireless Headphones",
    "description": "Noise cancelling over-ear headphones.",
    "price": 199.99,
    "stock": 50,
    "category": "Electronics"
  }
  ```
> **IMPORTANT:** Copy the `"_id"` of the product from the response. You need it to place orders.

### 2.2 List All Products (Inter-service call to Auth Service for seller details)
- **Method**: `GET`
- **URL**: `http://localhost:3000/products`
- **Headers**: None required (Public endpoint)

### 2.3 Get a Single Product
- **Method**: `GET`
- **URL**: `http://localhost:3000/products/<paste_product_id_here>`

---

## 3. Order Service

### 3.1 Create an Order (Inter-service call to Product Service for stock check & reservation)
- **Method**: `POST`
- **URL**: `http://localhost:3000/orders`
- **Headers**: 
  - `Content-Type: application/json`
  - `Authorization`: `Bearer <paste_your_USER_token_here>`
- **Body (raw JSON)**:
  ```json
  {
    "items": [
      {
        "productId": "<paste_product_id_here>",
        "quantity": 2
      }
    ]
  }
  ```
> **IMPORTANT:** Copy the `"_id"` of the newly created order. You will need it to create a delivery.

### 3.2 List All Orders (Requires ADMIN role token)
- **Method**: `GET`
- **URL**: `http://localhost:3000/orders`
- **Headers**: 
  - `Authorization`: `Bearer <paste_your_ADMIN_token_here>`

### 3.3 Get a Specific Order
- **Method**: `GET`
- **URL**: `http://localhost:3000/orders/<paste_order_id_here>`
- **Headers**: 
  - `Authorization`: `Bearer <paste_your_token_here>`

---

## 4. Delivery Service

### 4.1 Create a Delivery (Inter-service call to Order Service to mark status as 'SHIPPED')
- **Method**: `POST`
- **URL**: `http://localhost:3000/deliveries`
- **Headers**: 
  - `Content-Type: application/json`
  - `Authorization`: `Bearer <paste_your_ADMIN_or_DELIVERY_token_here>`
- **Body (raw JSON)**:
  ```json
  {
    "orderId": "<paste_order_id_here>",
    "address": "123 Test Avenue, Colombo",
    "estimatedDelivery": "2026-03-10T10:00:00.000Z"
  }
  ```
> *After doing this, check your Order again using GET `/orders/<id>`. You will see the order status is now "SHIPPED".*

### 4.2 List All Deliveries (Requires ADMIN role)
- **Method**: `GET`
- **URL**: `http://localhost:3000/deliveries`
- **Headers**: 
  - `Authorization`: `Bearer <paste_your_ADMIN_token_here>`

### 4.3 Update Delivery Status (Marks delivery as 'DELIVERED', updates Order correspondingly)
- **Method**: `PATCH`
- **URL**: `http://localhost:3000/deliveries/<paste_delivery_id_here>/status`
- **Headers**: 
  - `Content-Type: application/json`
  - `Authorization`: `Bearer <paste_your_ADMIN_or_DELIVERY_token_here>`
- **Body (raw JSON)**:
  ```json
  {
    "status": "DELIVERED"
  }
  ```
> *After doing this, check your Order again using GET `/orders/<id>`. You will see the order status is now "DELIVERED".*
