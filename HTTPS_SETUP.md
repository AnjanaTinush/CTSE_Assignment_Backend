# HTTPS Setup Guide for CTSE Backend

## Overview

This guide sets up HTTPS on your AKS cluster using:

- **NGINX Ingress Controller** - handles incoming traffic and TLS termination
- **cert-manager** - automatically manages SSL/TLS certificates with Let's Encrypt
- **Let's Encrypt** - provides free SSL certificates

## Prerequisites

- AKS cluster running
- `kubectl` configured
- `helm` installed

## Step 1: Install NGINX Ingress Controller

```bash
# Add the nginx ingress controller repository
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

# Install nginx ingress controller
helm install nginx-ingress ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.service.type=LoadBalancer
```

Wait for the LoadBalancer to get a public IP:

```bash
kubectl get svc -n ingress-nginx
# Look for EXTERNAL-IP
```

## Step 2: Install cert-manager

```bash
# Add cert-manager repository
helm repo add jetstack https://charts.jetstack.io
helm repo update

# Install cert-manager
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --set installCRDs=true
```

Verify installation:

```bash
kubectl get pods -n cert-manager
```

## Step 3: Update Your DNS Records

1. Get the LoadBalancer public IP:

```bash
kubectl get svc -n ingress-nginx nginx-ingress-ingress-nginx-controller
```

2. Update your DNS provider (Azure DNS, Route 53, Cloudflare, etc.):
   - Create A record pointing `api.ctse-assignment.com` → LoadBalancer IP
   - Or use your existing domain

## Step 4: Update the Ingress Configuration

Edit `k8s/ingress.yaml` and replace:

- `api.ctse-assignment.com` → your actual domain
- Update your email in `k8s/cert-manager-setup.yaml`

## Step 5: Apply the Configurations

```bash
# Apply cert-manager issuers
kubectl apply -f k8s/cert-manager-setup.yaml

# Apply ingress
kubectl apply -f k8s/ingress.yaml

# Update API Gateway service (already done in service.yaml)
kubectl apply -f k8s/api-gateway/service.yaml
```

## Step 6: Verify HTTPS Certificate

Monitor certificate issuance:

```bash
kubectl get certificate -n ctse-app
kubectl describe certificate api-gateway-tls -n ctse-app
```

Check certificate status:

```bash
kubectl get secret api-gateway-tls -n ctse-app -o yaml
```

## Step 7: Update Frontend Configuration

Update your frontend environment variables to use HTTPS:

```
VITE_API_URL=https://api.ctse-assignment.com
```

## Troubleshooting

### Certificate not issuing

```bash
# Check cert-manager logs
kubectl logs -n cert-manager -l app=cert-manager

# Check ingress logs
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx
```

### Check challenge status

```bash
kubectl get challenges -n ctse-app
kubectl describe challenge api-gateway-tls-1 -n ctse-app
```

### Force certificate renewal

```bash
kubectl delete secret api-gateway-tls -n ctse-app
kubectl annotate certificate api-gateway-tls -n ctse-app cert-manager.io/issue-temporary-certificate=true --overwrite
```

## SSL/TLS Test

Once deployed, test your HTTPS endpoint:

```bash
curl -I https://api.ctse-assignment.com/health
# Should return 200 with proper certificate
```

## Production Considerations

1. **Email Address**: Update cert-manager-setup.yaml with your email for Let's Encrypt notifications
2. **Domain**: Replace `api.ctse-assignment.com` with your actual domain
3. **Staging vs Production**: Start with `letsencrypt-staging` for testing, then switch to `letsencrypt-prod`
4. **CORS Settings**: Update `CORS_ORIGIN` in your API Gateway to accept the HTTPS origin
5. **Rate Limits**: Let's Encrypt has rate limits - use staging first!

## References

- [NGINX Ingress Controller](https://kubernetes.github.io/ingress-nginx/)
- [cert-manager Documentation](https://cert-manager.io/)
- [Let's Encrypt](https://letsencrypt.org/)
