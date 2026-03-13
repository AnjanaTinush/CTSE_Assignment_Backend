#!/usr/bin/env bash
# RUN :- & 'C:\Program Files\Git\bin\bash.exe' ./deploy-kind.sh

set -euo pipefail

CLUSTER_MODE="${CLUSTER_MODE:-docker-desktop}"
K8S_CONTEXT="${K8S_CONTEXT:-}"
CLUSTER_NAME="${CLUSTER_NAME:-ctse-kind}"
NAMESPACE="${NAMESPACE:-ctse-app}"
IMAGE_TAG="${IMAGE_TAG:-local}"
KIND_NODE_IMAGE="${KIND_NODE_IMAGE:-kindest/node:v1.29.2}"
PREFERRED_API_NODE_PORT="${PREFERRED_API_NODE_PORT:-30300}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SERVICES=(
  "auth-service"
  "product-service"
  "order-service"
  "delivery-service"
  "api-gateway"
)

K8S_NAMESPACE_FROM_MANIFEST="ctse-app"

require_command() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

log() {
  echo
  echo "==> $1"
}

warn() {
  echo "WARN: $1" >&2
}

fail() {
  echo "ERROR: $1" >&2
  exit 1
}

require_command docker
require_command kubectl

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  fail "Missing $ROOT_DIR/.env. Create it first (you can copy .env.example)."
fi

set -a
# shellcheck disable=SC1091
source "$ROOT_DIR/.env"
set +a

: "${JWT_SECRET:?JWT_SECRET is required in .env}"
: "${AUTH_MONGO_URI:?AUTH_MONGO_URI is required in .env}"
: "${PRODUCT_MONGO_URI:?PRODUCT_MONGO_URI is required in .env}"
: "${ORDER_MONGO_URI:?ORDER_MONGO_URI is required in .env}"
: "${DELIVERY_MONGO_URI:?DELIVERY_MONGO_URI is required in .env}"

CORS_ORIGIN="${CORS_ORIGIN:-http://localhost:5173,http://localhost:5174}"

if [[ "$NAMESPACE" != "$K8S_NAMESPACE_FROM_MANIFEST" ]]; then
  warn "Manifests are pinned to namespace '$K8S_NAMESPACE_FROM_MANIFEST'."
  warn "Using NAMESPACE='$NAMESPACE' may fail unless manifests are updated."
fi

case "$CLUSTER_MODE" in
  docker-desktop)
    K8S_CONTEXT="${K8S_CONTEXT:-docker-desktop}"
    ;;
  kind)
    require_command kind
    if ! kind get clusters | grep -Fxq "$CLUSTER_NAME"; then
      log "Creating kind cluster '$CLUSTER_NAME'"
      kind create cluster --name "$CLUSTER_NAME" --image "$KIND_NODE_IMAGE"
    else
      log "Using existing kind cluster '$CLUSTER_NAME'"
    fi
    K8S_CONTEXT="${K8S_CONTEXT:-kind-$CLUSTER_NAME}"
    ;;
  auto)
    if [[ -n "$K8S_CONTEXT" ]]; then
      :
    elif kubectl config get-contexts -o name | grep -Fxq docker-desktop; then
      CLUSTER_MODE="docker-desktop"
      K8S_CONTEXT="docker-desktop"
    else
      require_command kind
      if ! kind get clusters | grep -Fxq "$CLUSTER_NAME"; then
        log "Creating kind cluster '$CLUSTER_NAME'"
        kind create cluster --name "$CLUSTER_NAME" --image "$KIND_NODE_IMAGE"
      fi
      CLUSTER_MODE="kind"
      K8S_CONTEXT="kind-$CLUSTER_NAME"
    fi
    ;;
  *)
    fail "Invalid CLUSTER_MODE '$CLUSTER_MODE'. Use docker-desktop, kind, or auto."
    ;;
esac

if ! kubectl config get-contexts -o name | grep -Fxq "$K8S_CONTEXT"; then
  fail "Kubernetes context '$K8S_CONTEXT' not found. Available contexts: $(kubectl config get-contexts -o name | tr '\n' ' ')"
fi

KUBECTL=(kubectl --context "$K8S_CONTEXT")

if ! "${KUBECTL[@]}" cluster-info >/dev/null 2>&1; then
  fail "Cannot connect to Kubernetes using context '$K8S_CONTEXT'."
fi

log "Using Kubernetes context '$K8S_CONTEXT'"

log "Building Docker images"
for service in "${SERVICES[@]}"; do
  docker build -t "${service}:${IMAGE_TAG}" "$ROOT_DIR/$service"
done

if [[ "$CLUSTER_MODE" == "kind" ]]; then
  log "Loading Docker images into kind"
  for service in "${SERVICES[@]}"; do
    kind load docker-image "${service}:${IMAGE_TAG}" --name "$CLUSTER_NAME"
  done
else
  log "Using local Docker images for Docker Desktop Kubernetes"
fi

log "Applying namespace"
"${KUBECTL[@]}" apply -f "$ROOT_DIR/k8s/namespace.yaml"

log "Creating or updating Kubernetes secret"
"${KUBECTL[@]}" -n "$NAMESPACE" create secret generic ctse-secrets \
  --from-literal=JWT_SECRET="$JWT_SECRET" \
  --from-literal=AUTH_MONGO_URI="$AUTH_MONGO_URI" \
  --from-literal=PRODUCT_MONGO_URI="$PRODUCT_MONGO_URI" \
  --from-literal=ORDER_MONGO_URI="$ORDER_MONGO_URI" \
  --from-literal=DELIVERY_MONGO_URI="$DELIVERY_MONGO_URI" \
  --dry-run=client -o yaml | "${KUBECTL[@]}" apply -f -

log "Creating or updating Kubernetes configmap"
"${KUBECTL[@]}" -n "$NAMESPACE" create configmap ctse-config \
  --from-literal=AUTH_SERVICE_URL="http://auth-service:3301" \
  --from-literal=PRODUCT_SERVICE_URL="http://product-service:3302" \
  --from-literal=ORDER_SERVICE_URL="http://order-service:3303" \
  --from-literal=DELIVERY_SERVICE_URL="http://delivery-service:3304" \
  --from-literal=CORS_ORIGIN="$CORS_ORIGIN" \
  --from-literal=NODE_ENV="production" \
  --dry-run=client -o yaml | "${KUBECTL[@]}" apply -f -

log "Applying service and deployment manifests"
"${KUBECTL[@]}" apply -f "$ROOT_DIR/k8s/auth-service"
"${KUBECTL[@]}" apply -f "$ROOT_DIR/k8s/product-service"
"${KUBECTL[@]}" apply -f "$ROOT_DIR/k8s/order-service"
"${KUBECTL[@]}" apply -f "$ROOT_DIR/k8s/delivery-service"
"${KUBECTL[@]}" apply -f "$ROOT_DIR/k8s/api-gateway"

log "Updating deployments to use local images"
for service in "${SERVICES[@]}"; do
  "${KUBECTL[@]}" -n "$NAMESPACE" set image "deployment/${service}" "${service}=${service}:${IMAGE_TAG}" >/dev/null
  "${KUBECTL[@]}" -n "$NAMESPACE" patch "deployment/${service}" --type json \
    -p='[{"op":"replace","path":"/spec/template/spec/containers/0/imagePullPolicy","value":"IfNotPresent"}]' >/dev/null
done

log "Restarting deployments to pick up rebuilt local images"
for service in "${SERVICES[@]}"; do
  "${KUBECTL[@]}" -n "$NAMESPACE" rollout restart "deployment/${service}" >/dev/null
done

log "Switching api-gateway service to NodePort for local access"
if ! "${KUBECTL[@]}" -n "$NAMESPACE" patch service api-gateway --type merge \
  -p "{\"spec\":{\"type\":\"NodePort\",\"ports\":[{\"protocol\":\"TCP\",\"port\":80,\"targetPort\":3300,\"nodePort\":${PREFERRED_API_NODE_PORT}}]}}" >/dev/null 2>&1; then
  warn "Preferred nodePort ${PREFERRED_API_NODE_PORT} is unavailable. Falling back to auto-assigned NodePort."
  "${KUBECTL[@]}" -n "$NAMESPACE" patch service api-gateway --type merge \
    -p '{"spec":{"type":"NodePort"}}' >/dev/null
fi

log "Waiting for deployments to become ready"
for service in "${SERVICES[@]}"; do
  "${KUBECTL[@]}" -n "$NAMESPACE" rollout status "deployment/${service}" --timeout=180s
done

API_NODE_PORT="$("${KUBECTL[@]}" -n "$NAMESPACE" get service api-gateway -o jsonpath='{.spec.ports[0].nodePort}')"

log "Deployment complete"
echo "Cluster mode: $CLUSTER_MODE"
echo "Kubernetes context: $K8S_CONTEXT"
if [[ "$CLUSTER_MODE" == "kind" ]]; then
  echo "Kind cluster: $CLUSTER_NAME"
fi
echo "Namespace: $NAMESPACE"
echo "API Gateway NodePort: $API_NODE_PORT"
echo
echo "Check pods:"
echo "  kubectl --context $K8S_CONTEXT get pods -n $NAMESPACE"
echo
echo "Open the API:"
echo "  http://localhost:$API_NODE_PORT"
echo
echo "If localhost:$API_NODE_PORT is not reachable on your setup, use port-forward:"
echo "  kubectl --context $K8S_CONTEXT port-forward -n $NAMESPACE svc/api-gateway 3300:80"
