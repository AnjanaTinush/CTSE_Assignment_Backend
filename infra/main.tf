locals {
  namespace = "ctse-app"

  auth_service_url     = "http://auth-service:3301"
  product_service_url  = "http://product-service:3302"
  order_service_url    = "http://order-service:3303"
  delivery_service_url = "http://delivery-service:3304"
}

resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location
}

resource "azurerm_kubernetes_cluster" "aks" {
  name                = var.aks_cluster_name
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  dns_prefix          = var.dns_prefix
  sku_tier            = "Free"

  default_node_pool {
    name       = "system"
    node_count = var.node_count
    vm_size    = var.vm_size
  }

  identity {
    type = "SystemAssigned"
  }

  network_profile {
    network_plugin    = "kubenet"
    load_balancer_sku = "standard"
  }

  tags = {
    project = "ctse"
    env     = "prod"
  }
}

resource "kubernetes_namespace_v1" "ctse" {
  metadata {
    name = local.namespace
    labels = {
      app         = "ctse"
      environment = "production"
    }
  }

  depends_on = [azurerm_kubernetes_cluster.aks]
}

resource "kubernetes_config_map_v1" "ctse" {
  metadata {
    name      = "ctse-config"
    namespace = kubernetes_namespace_v1.ctse.metadata[0].name
    labels = {
      app = "ctse"
    }
  }

  data = {
    AUTH_SERVICE_URL     = local.auth_service_url
    PRODUCT_SERVICE_URL  = local.product_service_url
    ORDER_SERVICE_URL    = local.order_service_url
    DELIVERY_SERVICE_URL = local.delivery_service_url
    CORS_ORIGIN          = var.cors_origin
    NODE_ENV             = "production"
  }
}

resource "kubernetes_secret_v1" "ctse" {
  metadata {
    name      = "ctse-secrets"
    namespace = kubernetes_namespace_v1.ctse.metadata[0].name
    labels = {
      app = "ctse"
    }
  }

  type = "Opaque"

  data = {
    JWT_SECRET             = var.jwt_secret
    INTERNAL_SERVICE_TOKEN = var.internal_service_token
    AUTH_MONGO_URI         = var.auth_mongo_uri
    PRODUCT_MONGO_URI      = var.product_mongo_uri
    ORDER_MONGO_URI        = var.order_mongo_uri
    DELIVERY_MONGO_URI     = var.delivery_mongo_uri
  }
}

resource "kubernetes_deployment_v1" "auth_service" {
  metadata {
    name      = "auth-service"
    namespace = local.namespace
    labels = {
      app = "auth-service"
    }
  }

  spec {
    replicas = 2

    selector {
      match_labels = {
        app = "auth-service"
      }
    }

    template {
      metadata {
        labels = {
          app = "auth-service"
        }
      }

      spec {
        security_context {
          run_as_non_root = true
          run_as_user     = 1000
        }

        container {
          name              = "auth-service"
          image             = "${var.dockerhub_username}/auth-service:${var.image_tag}"
          image_pull_policy = "Always"

          port {
            container_port = 3301
          }

          env {
            name  = "PORT"
            value = "3301"
          }

          env {
            name = "ORDER_SERVICE_URL"
            value_from {
              config_map_key_ref {
                name = kubernetes_config_map_v1.ctse.metadata[0].name
                key  = "ORDER_SERVICE_URL"
              }
            }
          }

          env {
            name = "CORS_ORIGIN"
            value_from {
              config_map_key_ref {
                name = kubernetes_config_map_v1.ctse.metadata[0].name
                key  = "CORS_ORIGIN"
              }
            }
          }

          env {
            name = "NODE_ENV"
            value_from {
              config_map_key_ref {
                name = kubernetes_config_map_v1.ctse.metadata[0].name
                key  = "NODE_ENV"
              }
            }
          }

          env {
            name = "MONGO_URI"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.ctse.metadata[0].name
                key  = "AUTH_MONGO_URI"
              }
            }
          }

          env {
            name = "JWT_SECRET"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.ctse.metadata[0].name
                key  = "JWT_SECRET"
              }
            }
          }

          env {
            name = "INTERNAL_SERVICE_TOKEN"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.ctse.metadata[0].name
                key  = "INTERNAL_SERVICE_TOKEN"
              }
            }
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = 3301
            }
            initial_delay_seconds = 15
            period_seconds        = 20
          }

          readiness_probe {
            http_get {
              path = "/health"
              port = 3301
            }
            initial_delay_seconds = 5
            period_seconds        = 10
          }

          resources {
            requests = {
              cpu    = "100m"
              memory = "128Mi"
            }
            limits = {
              cpu    = "500m"
              memory = "256Mi"
            }
          }
        }
      }
    }
  }

  depends_on = [kubernetes_config_map_v1.ctse, kubernetes_secret_v1.ctse]
}

resource "kubernetes_service_v1" "auth_service" {
  metadata {
    name      = "auth-service"
    namespace = local.namespace
    labels = {
      app = "auth-service"
    }
  }

  spec {
    selector = {
      app = "auth-service"
    }

    type = "ClusterIP"

    port {
      port        = 3301
      target_port = 3301
      protocol    = "TCP"
    }
  }
}

resource "kubernetes_deployment_v1" "product_service" {
  metadata {
    name      = "product-service"
    namespace = local.namespace
    labels = {
      app = "product-service"
    }
  }

  spec {
    replicas = 2

    selector {
      match_labels = {
        app = "product-service"
      }
    }

    template {
      metadata {
        labels = {
          app = "product-service"
        }
      }

      spec {
        security_context {
          run_as_non_root = true
          run_as_user     = 1000
        }

        container {
          name              = "product-service"
          image             = "${var.dockerhub_username}/product-service:${var.image_tag}"
          image_pull_policy = "Always"

          port {
            container_port = 3302
          }

          env {
            name  = "PORT"
            value = "3302"
          }

          env {
            name = "AUTH_SERVICE_URL"
            value_from {
              config_map_key_ref {
                name = kubernetes_config_map_v1.ctse.metadata[0].name
                key  = "AUTH_SERVICE_URL"
              }
            }
          }

          env {
            name = "CORS_ORIGIN"
            value_from {
              config_map_key_ref {
                name = kubernetes_config_map_v1.ctse.metadata[0].name
                key  = "CORS_ORIGIN"
              }
            }
          }

          env {
            name = "NODE_ENV"
            value_from {
              config_map_key_ref {
                name = kubernetes_config_map_v1.ctse.metadata[0].name
                key  = "NODE_ENV"
              }
            }
          }

          env {
            name = "AUTH_SERVICE_URL"
            value_from {
              config_map_key_ref {
                name = kubernetes_config_map_v1.ctse.metadata[0].name
                key  = "AUTH_SERVICE_URL"
              }
            }
          }

          env {
            name = "DELIVERY_SERVICE_URL"
            value_from {
              config_map_key_ref {
                name = kubernetes_config_map_v1.ctse.metadata[0].name
                key  = "DELIVERY_SERVICE_URL"
              }
            }
          }

          env {
            name = "MONGO_URI"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.ctse.metadata[0].name
                key  = "PRODUCT_MONGO_URI"
              }
            }
          }

          env {
            name = "JWT_SECRET"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.ctse.metadata[0].name
                key  = "JWT_SECRET"
              }
            }
          }

          env {
            name = "INTERNAL_SERVICE_TOKEN"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.ctse.metadata[0].name
                key  = "INTERNAL_SERVICE_TOKEN"
              }
            }
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = 3302
            }
            initial_delay_seconds = 15
            period_seconds        = 20
          }

          readiness_probe {
            http_get {
              path = "/health"
              port = 3302
            }
            initial_delay_seconds = 5
            period_seconds        = 10
          }

          resources {
            requests = {
              cpu    = "100m"
              memory = "128Mi"
            }
            limits = {
              cpu    = "500m"
              memory = "256Mi"
            }
          }
        }
      }
    }
  }

  depends_on = [kubernetes_config_map_v1.ctse, kubernetes_secret_v1.ctse]
}

resource "kubernetes_service_v1" "product_service" {
  metadata {
    name      = "product-service"
    namespace = local.namespace
    labels = {
      app = "product-service"
    }
  }

  spec {
    selector = {
      app = "product-service"
    }

    type = "ClusterIP"

    port {
      port        = 3302
      target_port = 3302
      protocol    = "TCP"
    }
  }
}

resource "kubernetes_deployment_v1" "order_service" {
  metadata {
    name      = "order-service"
    namespace = local.namespace
    labels = {
      app = "order-service"
    }
  }

  spec {
    replicas = 2

    selector {
      match_labels = {
        app = "order-service"
      }
    }

    template {
      metadata {
        labels = {
          app = "order-service"
        }
      }

      spec {
        security_context {
          run_as_non_root = true
          run_as_user     = 1000
        }

        container {
          name              = "order-service"
          image             = "${var.dockerhub_username}/order-service:${var.image_tag}"
          image_pull_policy = "Always"

          port {
            container_port = 3303
          }

          env {
            name  = "PORT"
            value = "3303"
          }

          env {
            name = "PRODUCT_SERVICE_URL"
            value_from {
              config_map_key_ref {
                name = kubernetes_config_map_v1.ctse.metadata[0].name
                key  = "PRODUCT_SERVICE_URL"
              }
            }
          }

          env {
            name = "CORS_ORIGIN"
            value_from {
              config_map_key_ref {
                name = kubernetes_config_map_v1.ctse.metadata[0].name
                key  = "CORS_ORIGIN"
              }
            }
          }

          env {
            name = "NODE_ENV"
            value_from {
              config_map_key_ref {
                name = kubernetes_config_map_v1.ctse.metadata[0].name
                key  = "NODE_ENV"
              }
            }
          }

          env {
            name = "AUTH_SERVICE_URL"
            value_from {
              config_map_key_ref {
                name = kubernetes_config_map_v1.ctse.metadata[0].name
                key  = "AUTH_SERVICE_URL"
              }
            }
          }

          env {
            name = "MONGO_URI"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.ctse.metadata[0].name
                key  = "ORDER_MONGO_URI"
              }
            }
          }

          env {
            name = "JWT_SECRET"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.ctse.metadata[0].name
                key  = "JWT_SECRET"
              }
            }
          }

          env {
            name = "INTERNAL_SERVICE_TOKEN"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.ctse.metadata[0].name
                key  = "INTERNAL_SERVICE_TOKEN"
              }
            }
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = 3303
            }
            initial_delay_seconds = 15
            period_seconds        = 20
          }

          readiness_probe {
            http_get {
              path = "/health"
              port = 3303
            }
            initial_delay_seconds = 5
            period_seconds        = 10
          }

          resources {
            requests = {
              cpu    = "100m"
              memory = "128Mi"
            }
            limits = {
              cpu    = "500m"
              memory = "256Mi"
            }
          }
        }
      }
    }
  }

  depends_on = [kubernetes_config_map_v1.ctse, kubernetes_secret_v1.ctse]
}

resource "kubernetes_service_v1" "order_service" {
  metadata {
    name      = "order-service"
    namespace = local.namespace
    labels = {
      app = "order-service"
    }
  }

  spec {
    selector = {
      app = "order-service"
    }

    type = "ClusterIP"

    port {
      port        = 3303
      target_port = 3303
      protocol    = "TCP"
    }
  }
}

resource "kubernetes_deployment_v1" "delivery_service" {
  metadata {
    name      = "delivery-service"
    namespace = local.namespace
    labels = {
      app = "delivery-service"
    }
  }

  spec {
    replicas = 2

    selector {
      match_labels = {
        app = "delivery-service"
      }
    }

    template {
      metadata {
        labels = {
          app = "delivery-service"
        }
      }

      spec {
        security_context {
          run_as_non_root = true
          run_as_user     = 1000
        }

        container {
          name              = "delivery-service"
          image             = "${var.dockerhub_username}/delivery-service:${var.image_tag}"
          image_pull_policy = "Always"

          port {
            container_port = 3304
          }

          env {
            name  = "PORT"
            value = "3304"
          }

          env {
            name = "ORDER_SERVICE_URL"
            value_from {
              config_map_key_ref {
                name = kubernetes_config_map_v1.ctse.metadata[0].name
                key  = "ORDER_SERVICE_URL"
              }
            }
          }

          env {
            name = "CORS_ORIGIN"
            value_from {
              config_map_key_ref {
                name = kubernetes_config_map_v1.ctse.metadata[0].name
                key  = "CORS_ORIGIN"
              }
            }
          }

          env {
            name = "NODE_ENV"
            value_from {
              config_map_key_ref {
                name = kubernetes_config_map_v1.ctse.metadata[0].name
                key  = "NODE_ENV"
              }
            }
          }

          env {
            name = "MONGO_URI"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.ctse.metadata[0].name
                key  = "DELIVERY_MONGO_URI"
              }
            }
          }

          env {
            name = "JWT_SECRET"
            value_from {
              secret_key_ref {
                name = kubernetes_secret_v1.ctse.metadata[0].name
                key  = "JWT_SECRET"
              }
            }
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = 3304
            }
            initial_delay_seconds = 15
            period_seconds        = 20
          }

          readiness_probe {
            http_get {
              path = "/health"
              port = 3304
            }
            initial_delay_seconds = 5
            period_seconds        = 10
          }

          resources {
            requests = {
              cpu    = "100m"
              memory = "128Mi"
            }
            limits = {
              cpu    = "500m"
              memory = "256Mi"
            }
          }
        }
      }
    }
  }

  depends_on = [kubernetes_config_map_v1.ctse, kubernetes_secret_v1.ctse]
}

resource "kubernetes_service_v1" "delivery_service" {
  metadata {
    name      = "delivery-service"
    namespace = local.namespace
    labels = {
      app = "delivery-service"
    }
  }

  spec {
    selector = {
      app = "delivery-service"
    }

    type = "ClusterIP"

    port {
      port        = 3304
      target_port = 3304
      protocol    = "TCP"
    }
  }
}

resource "kubernetes_deployment_v1" "api_gateway" {
  metadata {
    name      = "api-gateway"
    namespace = local.namespace
    labels = {
      app = "api-gateway"
    }
  }

  spec {
    replicas = 2

    selector {
      match_labels = {
        app = "api-gateway"
      }
    }

    template {
      metadata {
        labels = {
          app = "api-gateway"
        }
      }

      spec {
        security_context {
          run_as_non_root = true
          run_as_user     = 1000
        }

        container {
          name              = "api-gateway"
          image             = "${var.dockerhub_username}/api-gateway:${var.image_tag}"
          image_pull_policy = "Always"

          port {
            container_port = 3300
          }

          env {
            name  = "PORT"
            value = "3300"
          }

          env {
            name = "AUTH_SERVICE_URL"
            value_from {
              config_map_key_ref {
                name = kubernetes_config_map_v1.ctse.metadata[0].name
                key  = "AUTH_SERVICE_URL"
              }
            }
          }

          env {
            name = "PRODUCT_SERVICE_URL"
            value_from {
              config_map_key_ref {
                name = kubernetes_config_map_v1.ctse.metadata[0].name
                key  = "PRODUCT_SERVICE_URL"
              }
            }
          }

          env {
            name = "ORDER_SERVICE_URL"
            value_from {
              config_map_key_ref {
                name = kubernetes_config_map_v1.ctse.metadata[0].name
                key  = "ORDER_SERVICE_URL"
              }
            }
          }

          env {
            name = "DELIVERY_SERVICE_URL"
            value_from {
              config_map_key_ref {
                name = kubernetes_config_map_v1.ctse.metadata[0].name
                key  = "DELIVERY_SERVICE_URL"
              }
            }
          }

          env {
            name = "CORS_ORIGIN"
            value_from {
              config_map_key_ref {
                name = kubernetes_config_map_v1.ctse.metadata[0].name
                key  = "CORS_ORIGIN"
              }
            }
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = 3300
            }
            initial_delay_seconds = 15
            period_seconds        = 20
          }

          readiness_probe {
            http_get {
              path = "/health"
              port = 3300
            }
            initial_delay_seconds = 5
            period_seconds        = 10
          }

          resources {
            requests = {
              cpu    = "100m"
              memory = "128Mi"
            }
            limits = {
              cpu    = "500m"
              memory = "256Mi"
            }
          }
        }
      }
    }
  }

  depends_on = [kubernetes_config_map_v1.ctse, kubernetes_secret_v1.ctse]
}

resource "kubernetes_service_v1" "api_gateway" {
  metadata {
    name      = "api-gateway"
    namespace = local.namespace
    labels = {
      app = "api-gateway"
    }
  }

  spec {
    selector = {
      app = "api-gateway"
    }

    type = "LoadBalancer"

    port {
      port        = 80
      target_port = 3300
      protocol    = "TCP"
    }
  }
}
