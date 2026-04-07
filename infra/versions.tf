terraform {
  required_version = ">= 1.4.0"

  backend "azurerm" {
    resource_group_name  = "ctse-group"
    storage_account_name = "ctseterraformstate"
    container_name       = "tfstate"
    key                  = "ctse.terraform.tfstate"
  }

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.32"
    }
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}

provider "kubernetes" {
  host                   = azurerm_kubernetes_cluster.aks.kube_config[0].host
  username               = azurerm_kubernetes_cluster.aks.kube_config[0].username
  password               = azurerm_kubernetes_cluster.aks.kube_config[0].password
  client_certificate     = base64decode(azurerm_kubernetes_cluster.aks.kube_config[0].client_certificate)
  client_key             = base64decode(azurerm_kubernetes_cluster.aks.kube_config[0].client_key)
  cluster_ca_certificate = base64decode(azurerm_kubernetes_cluster.aks.kube_config[0].cluster_ca_certificate)
}