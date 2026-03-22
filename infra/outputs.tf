output "resource_group_name" {
  description = "Name of the created resource group"
  value       = azurerm_resource_group.rg.name
}

output "aks_cluster_name" {
  description = "AKS cluster name"
  value       = azurerm_kubernetes_cluster.aks.name
}

output "api_gateway_public_ip" {
  description = "Public IP for API gateway LoadBalancer service"
  value       = try(kubernetes_service_v1.api_gateway.status[0].load_balancer[0].ingress[0].ip, null)
}

output "api_gateway_health_url" {
  description = "Health endpoint URL for API gateway when IP is assigned"
  value       = try("http://${kubernetes_service_v1.api_gateway.status[0].load_balancer[0].ingress[0].ip}/health", null)
}
