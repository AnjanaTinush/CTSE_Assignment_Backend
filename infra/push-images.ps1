param(
  [Parameter(Mandatory = $false)]
  [string]$DockerHubUser = "praveen1214"
)

$ErrorActionPreference = "Stop"

# Use immutable tags tied to source revision.
$ImageTag = (git rev-parse --short HEAD).Trim()
if (-not $ImageTag) {
  throw "Could not determine git short SHA for image tag."
}

$services = @("auth-service", "product-service", "order-service", "delivery-service", "api-gateway")

foreach ($svc in $services) {
  $image = "$DockerHubUser/$svc`:$ImageTag"
  Write-Host "Building $image"
  docker build -t $image "./$svc"
  if ($LASTEXITCODE -ne 0) { throw "docker build failed for $svc" }

  Write-Host "Pushing $image"
  docker push $image
  if ($LASTEXITCODE -ne 0) { throw "docker push failed for $svc" }
}

Write-Host "IMAGE_TAG=$ImageTag"
Write-Host "Use this in infra/terraform.tfvars as image_tag = \"$ImageTag\""
