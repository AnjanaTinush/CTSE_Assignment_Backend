# Viva Demonstration Guide: Milestone 4 (Service-to-Service Communication)

This is a simple, step-by-step guide on how you and your group members can demonstrate the **10% Milestone 4** requirement during your 10-minute Viva presentation. 

You need to prove that every microservice successfully talks to at least one other microservice. Here is exactly what you should do live.

---

## Preparation (Before you start screen sharing)
1. Make sure Docker is running.
2. Open your terminal in the project folder and run: `docker-compose up -d`
3. Open **Postman** (or Thunder Client/Insomnia).
4. You will be making all requests to the **API Gateway** running on `http://localhost:3000`.

---

## Step 1: Prove Auth/User talks to Order

**Goal:** Show that a user can fetch their personal orders by asking the Auth Service, which secretly asks the Order Service behind the scenes.

1. **Create an Order first** directly in the Order database (or use an existing one belonging to the admin/user). Let's assume you have a user logged in.
2. **Login the User:** 
   - `POST http://localhost:3000/auth/login`
   - Body: `{"email": "your_test_email", "password": "your_password"}`
   - *Copy the `token` from the response.*
3. **The Demo Action:**
   - Make a `GET` request to `http://localhost:3000/users/me/orders`
   - Go to the **Headers** tab in Postman and add: `Authorization: Bearer <your_token>`
4. **What to say to the lecturer:**
   > *"I just hit the Auth Service. But the Auth Service doesn't store orders. It used Axios to internally call the Order Service (`GET /orders/by-user/:userId`) and returned the exact order history for my specific user ID."*

---

## Step 2: Prove Product talks to Auth/User

**Goal:** Show that when you list products, the product database enriches the data by asking the Auth service for the seller's name/email.

1. **The Demo Action:**
   - Make a `GET` request to `http://localhost:3000/products`
2. **What to point out:**
   - Look at the JSON response. Point to the `eller` object inside one of the products.
3. **What to say to the lecturer:**
   > *"Notice the seller's full name and details are in this product response. Our Product database only saves a 'sellerId' string. During this request, the Product Service internally called the Auth Service (`GET /users/:id/public`) to look up the seller's profile, combined the data, and sent it back to the client."*

---

## Step 3: Prove Order talks to Product

**Goal:** Show that creating an order actually reserves (deducts) stock from the Product database.

1. **The Demo Action (Part A):**
   - Make a `GET` request to `http://localhost:3000/products`. 
   - Note down the `id` of a product and its current `stock` (e.g., Stock: 50).
2. **The Demo Action (Part B):**
   - Make a `POST` request to `http://localhost:3000/orders`.
   - Headers: `Authorization: Bearer <your_token>`
   - Body: 
     ```json
     {
       "items": [
         { "productId": "<the_id_you_copied>", "quantity": 1 }
       ]
     }
     ```
3. **The Demo Action (Part C):**
   - Make the `GET` request to `http://localhost:3000/products` again.
   - Show that the `stock` is now **49**.
4. **What to say to the lecturer:**
   > *"When I created this order, the Order service first called the Product service to check if the stock was available. Then, it made an internal PATCH request (`PATCH /products/:id/reserve`) to deduct 1 from the inventory before finalizing the order."*

---

## Step 4: Prove Delivery talks to Order

**Goal:** Show that when a delivery log is created, it automatically changes the status of the related Order.

1. **The Demo Action (Part A):**
   - Make a `GET` request to `http://localhost:3000/orders/<your_recent_order_id>`.
   - Headers: `Authorization: Bearer <your_token>`
   - *Point out that the order status says `"PENDING"`.*
2. **The Demo Action (Part B):**
   - Make a `POST` request to `http://localhost:3000/deliveries`.
   - Headers: `Authorization: Bearer <your_token_with_admin_or_delivery_role>`
   - Body:
     ```json
     {
       "orderId": "<your_recent_order_id>",
       "address": "123 Main Street"
     }
     ```
3. **The Demo Action (Part C):**
   - Make the `GET` request to `http://localhost:3000/orders/<your_recent_order_id>` again.
   - *Point out that the status now says `"SHIPPED"`.*
4. **What to say to the lecturer:**
   > *"By simply creating a delivery ticket, the Delivery service reached out over the internal network to the Order service using Axios, and patched the order status to SHIPPED (`PATCH /orders/:id/status`) seamlessly."*
