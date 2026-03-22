variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
}

variable "location" {
  description = "Azure region for resources"
  type        = string
  default     = "southeastasia"
}

variable "resource_group_name" {
  description = "Resource group name"
  type        = string
}

variable "aks_cluster_name" {
  description = "AKS cluster name"
  type        = string
}

variable "dns_prefix" {
  description = "DNS prefix for AKS"
  type        = string
  default     = "ctse"
}

variable "node_count" {
  description = "Number of AKS nodes"
  type        = number
  default     = 2
}

variable "vm_size" {
  description = "AKS node VM size"
  type        = string
  default     = "Standard_B2s"
}

variable "dockerhub_username" {
  description = "Docker Hub username that owns the microservice images"
  type        = string
}

variable "image_tag" {
  description = "Immutable image tag used by all services (recommended: git short SHA)"
  type        = string
}

variable "cors_origin" {
  description = "CORS origin exposed by API Gateway"
  type        = string
  default     = "*"
}

variable "jwt_secret" {
  description = "JWT secret for all services"
  type        = string
  sensitive   = true
}

variable "internal_service_token" {
  description = "Shared token used for internal service-to-service privileged routes"
  type        = string
  sensitive   = true
}

variable "auth_mongo_uri" {
  description = "MongoDB URI for auth-service"
  type        = string
  sensitive   = true
}

variable "product_mongo_uri" {
  description = "MongoDB URI for product-service"
  type        = string
  sensitive   = true
}

variable "order_mongo_uri" {
  description = "MongoDB URI for order-service"
  type        = string
  sensitive   = true
}

variable "delivery_mongo_uri" {
  description = "MongoDB URI for delivery-service"
  type        = string
  sensitive   = true
}
