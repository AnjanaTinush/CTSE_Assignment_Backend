# Terraform AKS Deployment (Simple)

This folder provisions AKS and deploys all CTSE microservices.

## 1) Build and push images

From repository root:

```powershell
./infra/push-images.ps1 -DockerHubUser praveen1214
```

Copy the printed `IMAGE_TAG` value.

## 2) Create tfvars from template

```powershell
Copy-Item ./infra/terraform.tfvars.example ./infra/terraform.tfvars
```

Edit `infra/terraform.tfvars` and set:
- `image_tag` to the value printed by `push-images.ps1`
- `jwt_secret` (strong value)
- `internal_service_token` (strong value)
- all MongoDB URIs

## 3) Deploy with Terraform

```powershell
cd infra
terraform init
terraform fmt
terraform validate
terraform plan
terraform apply -auto-approve
```

## 4) Verify

```powershell
az aks get-credentials --resource-group ctse-group --name ctse-cluster --overwrite-existing
kubectl get pods -n ctse-app
kubectl get svc api-gateway -n ctse-app
```

When external IP appears:

```powershell
$ip = kubectl get svc api-gateway -n ctse-app -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
Invoke-RestMethod -Uri "http://$ip/health"
```

## 5) Destroy

```powershell
terraform destroy -auto-approve
```
