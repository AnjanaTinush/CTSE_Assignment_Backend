# Milestone 7 — CI/CD Pipeline Configuration

This document outlines the step-by-step setup and explanation of the continuous integration and deployment (CI/CD) pipeline for our microservices, addressing the **Milestone 7 (30%)** requirements.

## Overview
The CI/CD pipeline is implemented using **GitHub Actions**. It automatically triggers on pushes or pull requests to the `main` branch. 

The pipeline handles:
1. **Dependency Installation**
2. **Automated Testing** (Unit Tests & Linting)
3. **Security Analysis (SAST)**
4. **Docker Image Build**
5. **Docker Image Push (Registry)**
6. **Deployment to Cloud Container Service (ECS/AKS)**

---

## The Workflow File Structure
The actual configuration is stored under `.github/workflows/ci-cd.yml`. We leverage a **matrix strategy** to run jobs in parallel for all 5 services simultaneously (`auth-service`, `product-service`, `order-service`, `delivery-service`, and `api-gateway`).

---

### Step 1: Install Dependencies (`npm ci`)
```yaml
    - name: Install Dependencies
      run: |
        cd ${{ matrix.service }}
        npm ci
```
* **Why**: Installs absolute lockfile exact versions of dependencies rapidly before testing or building the image. 

### Step 2: Automated Testing (`test`)
```yaml
    - name: Run Tests
      # If you had tests configured via Jest:
      run: |
        cd ${{ matrix.service }}
        npm test
```
* **Why**: Ensures code changes do not break existing functionality. This is a critical CI barrier. 

### Step 3: Security Scan (SAST)
```yaml
    - name: Security scan (Snyk)
      uses: snyk/actions/node@master
      env:
        SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
      with:
        command: monitor
        args: --file=${{ matrix.service }}/package.json
```
* **Why**: To fulfill DevSecOps requirements. We use the *Snyk* Action explicitly passing the package manager files to identify critical CVE vulnerabilities before they are packaged into the final Docker container.

### Step 4: Build & Push Docker Image
```yaml
    - name: Login to DockerHub
      uses: docker/login-action@v2
      with:
        username: ${{ secrets.DOCKERHUB_USERNAME }}
        password: ${{ secrets.DOCKERHUB_TOKEN }}
        
    - name: Build and push
      uses: docker/build-push-action@v4
      with:
        context: ./${{ matrix.service }}
        push: true
        tags: ${{ secrets.DOCKERHUB_USERNAME }}/${{ matrix.service }}:latest
```
* **Why**: Containerizes our microservice using the embedded `Dockerfile` specific to that service folder. Upon successful layered compilation, it pushes the `latest` tagged image up to an external registry (Docker Hub).

### Step 5: Deploy to Cloud (Example Azure / AWS)
This final step updates the serverless cloud orchestrator (Amazon ECS or Azure Container Apps) to pull the fresh container image we just uploaded.

* **Example AWS ECS Update**:
```yaml
    - name: Deploy to Amazon ECS
      run: |
        aws ecs update-service --cluster ctse-cluster --service ${{ matrix.service }} --force-new-deployment
      env:
        AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
        AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        AWS_DEFAULT_REGION: us-east-1
```

* **Example Azure Container Apps Update**:
```yaml
    - name: Deploy to Azure Container Apps
      uses: azure/container-apps-deploy-action@v1
      with:
        imageToDeploy: ${{ secrets.DOCKERHUB_USERNAME }}/${{ matrix.service }}:latest
        containerAppName: ${{ matrix.service }}-app
        resourceGroup: ctse-microservices-rg
      env:
        AZURE_CREDENTIALS: ${{ secrets.AZURE_CREDENTIALS }}
```
* **Why**: Acts as our Continuous Deployment (CD). Automatically triggers rolling updates directly onto public infrastructure with zero manual CLI intervention.

---

## How to Show it Working for the Viva
1. Have Github Actions open in your browser on the "Actions" tab.
2. Push a minor change to the `main` branch (e.g. changing an endpoint response string in `auth-service/controllers`).
3. Point out how the `Push` trigger immediately starts the workflow.
4. Show the pipeline passing through the phases (`build`, `test/scan`, `docker build`).
5. Open your cloud platform (Azure/AWS) and demonstrate that the service deployment just updated itself to the exact timestamp of your git push!
