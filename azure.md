# Azure Deployment Guide (Azure Container Apps)

This guide outlines a simple, free-tier friendly approach to deploying your microservice using **Azure Container Apps** (Serverless containers).

## Prerequisites
1. **Azure Account**: Active subscription with Free Tier credits.
2. **Azure CLI installed** locally.
3. **DockerHub Account** (or Azure Container Registry).

---

## Step 1: Push Your Docker Image
Ensure your locally built microservice container is pushed to a public repository like DockerHub.
```bash
docker build -t yourdockerhub/auth-service:latest ./auth-service
docker push yourdockerhub/auth-service:latest
```

---

## Step 2: Create a Resource Group
Azure organizes services into Resource Groups.
1. Log in to the **Azure Portal**.
2. Search for **Resource groups** and click **Create**.
3. **Subscription**: Free Trial / Pay-As-You-Go.
4. **Resource group**: `ctse-microservices-rg`.
5. **Region**: e.g., `East US`.
6. Click **Review + Create**.

---

## Step 3: Deploy the Container App
Azure Container Apps abstraction makes launching Docker containers simple.
1. Search for **Container Apps** in the top search bar.
2. Click **Create container app**.
3. **Basics Tab**:
   - **Subscription**: Your active sub.
   - **Resource group**: `ctse-microservices-rg`.
   - **Container App name**: `auth-service-app`.
   - **Region**: Same as your Resource Group (e.g., East US).
   - **Container Apps Environment**: Create a new environment, name it `ctse-env`.
4. **Container Tab**:
   - **Use quickstart image**: Uncheck this box.
   - **Name**: `auth-container`.
   - **Image source**: Docker Hub or other registry.
   - **Image type**: Public.
   - **Registry login server**: Leave blank if public DockerHub.
   - **Image and tag**: `yourdockerhub/auth-service:latest`.
   - **Environment Variables**: Add your `MONGO_URI` and `JWT_SECRET` here. They must match exactly what the code expects. Keep `PORT=3001` or your specific internal port.
5. **Ingress Tab**:
   - **Ingress**: Enabled.
   - **Ingress traffic**: Accepting traffic from anywhere (for internet exposure).
   - **Target port**: Set this to match your app's exposure (`3000`, `3001`, `3002` etc).
6. Click **Review + Create** and wait for deployment.

---

## Step 4: Verify Your Deployment
1. Once the deployment says "Your deployment is complete", click **Go to resource**.
2. Find the **Application Url** on the overview page (it will look somewhat like `https://auth-service-app.something.eastus.azurecontainerapps.io`).
3. Open this URL in your browser or Postman and hit the `/health` endpoint:
   `https://<YOUR_AZURE_URL>/health`

*Repeat Step 3 for any additional microservice you wish to deploy.*
