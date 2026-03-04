# AWS Deployment Guide (Amazon ECS via Fargate)

This guide provides a stepwise, free-tier friendly approach to deploying your microservice to AWS using Amazon ECS (Elastic Container Service) with Fargate.

## Prerequisites
1. **AWS Account**: Ensure you have an AWS account with Free Tier availability.
2. **AWS CLI installed** on your machine.
3. **DockerHub Account** (or you can use Amazon ECR).

---

## Step 1: Push Your Docker Image (if using DockerHub)
First, make sure your image is built and pushed to a public registry (DockerHub is easiest for this assignment).
```bash
# Example for auth-service
docker build -t yourdockerhub/auth-service:latest ./auth-service
docker push yourdockerhub/auth-service:latest
```

---

## Step 2: Create an ECS Cluster
1. Log in to the **AWS Management Console**.
2. Search for **ECS** (Elastic Container Service).
3. Click **Create Cluster**.
4. Name your cluster (e.g., `ctse-cluster`).
5. Under Infrastructure, choose **AWS Fargate** (Serverless, easier, and covered under free tier limits).
6. Click **Create**.

---

## Step 3: Create a Task Definition
A Task Definition tells ECS *how* to run your Docker container.
1. In the ECS sidebar, click **Task Definitions** -> **Create new task definition**.
2. **Task definition family**: Name it (e.g., `auth-service-task`).
3. **Infrastructure requirements**: Choose AWS Fargate. Assign the minimum memory and CPU (e.g., .25 vCPU, 0.5 GB memory) to stay well within the free tier.
4. **Container details**:
   - **Name**: `auth-container`
   - **Image URI**: `docker.io/yourdockerhub/auth-service:latest`
   - **Container port**: `3001` (or whatever port your service uses).
5. **Environment variables**: Add your DB credentials and JWT secrets here:
   - `MONGO_URI` = `mongodb+srv://...`
   - `JWT_SECRET` = `supersecretjwtkey_ctse`
6. Click **Create**.

---

## Step 4: Run the Service
1. Go back to your `ctse-cluster` in ECS.
2. Under the **Services** tab, click **Create**.
3. **Compute options**: Launch type -> **Fargate**.
4. **Deployment configuration**:
   - **Family**: Select your `auth-service-task`.
   - **Service name**: `auth-service`.
   - **Desired tasks**: 1.
5. **Networking**: 
   - Select the default VPC and subnets.
   - **Security Group**: Create a new security group. **IMPORTANT:** Ensure you add an inbound rule allowing Custom TCP traffic on your port (e.g., `3001`) from anywhere (`0.0.0.0/0`).
6. Click **Create**.

---

## Step 5: Test the Deployment
1. Click on your newly created service in the cluster.
2. Go to the **Tasks** tab and click on the running task ID.
3. Under the **Configuration** section, find the **Public IP**.
4. Test it via your browser or Postman: `http://<PUBLIC_IP>:3001/health`

*Repeat Steps 3, 4, and 5 for any other services you need to deploy.*
