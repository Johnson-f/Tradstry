"""
Dynamic Routing Configuration - Centralized routing management for AI services
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from enum import Enum
import json

class RouteType(str, Enum):
    """Types of dynamic routes"""
    VERSIONED = "versioned"
    SERVICE_BASED = "service_based"
    FEATURE_FLAG = "feature_flag"
    WILDCARD = "wildcard"
    CONDITIONAL = "conditional"

class HTTPMethod(str, Enum):
    """Supported HTTP methods"""
    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    DELETE = "DELETE"
    PATCH = "PATCH"

@dataclass
class RouteConfig:
    """Configuration for a dynamic route"""
    path: str
    methods: List[HTTPMethod]
    route_type: RouteType
    handler: str
    auth_required: bool = True
    rate_limit: Optional[int] = None
    feature_flag: Optional[str] = None
    version_support: Optional[List[str]] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None

class DynamicRoutingConfig:
    """Centralized configuration for dynamic AI routing"""
    
    def __init__(self):
        self.routes: Dict[str, RouteConfig] = {}
        self._load_default_routes()
    
    def _load_default_routes(self):
        """Load default AI routing configurations"""
        
        # Versioned routes
        self.add_route(RouteConfig(
            path="/{version}/generate",
            methods=[HTTPMethod.POST],
            route_type=RouteType.VERSIONED,
            handler="versioned_generate",
            version_support=["v1", "v2", "latest"],
            description="Version-aware AI analysis generation",
            tags=["analysis", "versioned"]
        ))
        
        self.add_route(RouteConfig(
            path="/{version}/chat",
            methods=[HTTPMethod.POST],
            route_type=RouteType.VERSIONED,
            handler="versioned_chat",
            version_support=["v1", "v2", "latest"],
            description="Version-aware chat functionality",
            tags=["chat", "versioned"]
        ))
        
        # Service-based routes
        self.add_route(RouteConfig(
            path="/service/{service_type}",
            methods=[HTTPMethod.GET, HTTPMethod.POST],
            route_type=RouteType.SERVICE_BASED,
            handler="service_type_handler",
            description="Dynamic service type routing",
            tags=["service", "dynamic"]
        ))
        
        self.add_route(RouteConfig(
            path="/service/{service_type}/{action}",
            methods=[HTTPMethod.POST, HTTPMethod.PUT],
            route_type=RouteType.SERVICE_BASED,
            handler="service_action_handler",
            description="Dynamic service action routing",
            tags=["service", "action"]
        ))
        
        # Feature flag routes
        self.add_route(RouteConfig(
            path="/features/{feature_name}",
            methods=[HTTPMethod.GET],
            route_type=RouteType.FEATURE_FLAG,
            handler="feature_handler",
            description="Feature flag controlled routing",
            tags=["features", "experimental"]
        ))
        
        # Conditional routes
        self.add_route(RouteConfig(
            path="/conditional/{condition_type}",
            methods=[HTTPMethod.GET, HTTPMethod.POST],
            route_type=RouteType.CONDITIONAL,
            handler="conditional_handler",
            description="Conditional routing based on runtime conditions",
            tags=["conditional", "runtime"]
        ))
        
        # Wildcard routes (should be last)
        self.add_route(RouteConfig(
            path="/dynamic/{path:path}",
            methods=[HTTPMethod.GET, HTTPMethod.POST, HTTPMethod.PUT, HTTPMethod.DELETE],
            route_type=RouteType.WILDCARD,
            handler="wildcard_handler",
            description="Catch-all dynamic routing",
            tags=["wildcard", "fallback"]
        ))
    
    def add_route(self, route_config: RouteConfig):
        """Add a new route configuration"""
        self.routes[route_config.path] = route_config
    
    def get_route(self, path: str) -> Optional[RouteConfig]:
        """Get route configuration by path"""
        return self.routes.get(path)
    
    def get_routes_by_type(self, route_type: RouteType) -> List[RouteConfig]:
        """Get all routes of a specific type"""
        return [route for route in self.routes.values() if route.route_type == route_type]
    
    def get_routes_by_tag(self, tag: str) -> List[RouteConfig]:
        """Get all routes with a specific tag"""
        return [route for route in self.routes.values() if route.tags and tag in route.tags]
    
    def is_feature_enabled(self, feature_name: str) -> bool:
        """Check if a feature is enabled (placeholder for feature flag logic)"""
        # This would integrate with your feature flag system
        feature_flags = {
            "advanced_analytics": True,
            "real_time_insights": True,
            "custom_models": False,
            "experimental_chat": True,
            "beta_reports": False
        }
        return feature_flags.get(feature_name, False)
    
    def get_supported_versions(self) -> List[str]:
        """Get all supported API versions"""
        versions = set()
        for route in self.routes.values():
            if route.version_support:
                versions.update(route.version_support)
        return sorted(list(versions))
    
    def export_config(self) -> Dict[str, Any]:
        """Export routing configuration as dictionary"""
        return {
            "routes": {
                path: {
                    "methods": [method.value for method in config.methods],
                    "route_type": config.route_type.value,
                    "handler": config.handler,
                    "auth_required": config.auth_required,
                    "rate_limit": config.rate_limit,
                    "feature_flag": config.feature_flag,
                    "version_support": config.version_support,
                    "description": config.description,
                    "tags": config.tags
                }
                for path, config in self.routes.items()
            },
            "supported_versions": self.get_supported_versions(),
            "total_routes": len(self.routes)
        }
    
    def validate_route_path(self, path: str, method: HTTPMethod) -> bool:
        """Validate if a route path and method combination is supported"""
        for route_config in self.routes.values():
            if self._path_matches(path, route_config.path) and method in route_config.methods:
                return True
        return False
    
    def _path_matches(self, request_path: str, config_path: str) -> bool:
        """Check if request path matches configuration path pattern"""
        # Simple pattern matching - could be enhanced with regex
        if "{" not in config_path:
            return request_path == config_path
        
        # Handle path parameters
        config_parts = config_path.split("/")
        request_parts = request_path.split("/")
        
        if len(config_parts) != len(request_parts):
            return False
        
        for config_part, request_part in zip(config_parts, request_parts):
            if config_part.startswith("{") and config_part.endswith("}"):
                continue  # Parameter match
            elif config_part != request_part:
                return False
        
        return True

# Global routing configuration instance
routing_config = DynamicRoutingConfig()
