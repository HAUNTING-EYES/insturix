# Configuration Management

This directory contains centralized configuration files that define service limits, capabilities, and settings across the Insturix platform.

## Configuration Files

### Service Management
- **services.ts** - Defines all available services and their basic configuration
- **serviceLimits.ts** - Defines usage limits and restrictions for each service tier

## Purpose and Benefits

### Centralized Control
- Single source of truth for service configurations
- Easy to modify limits and add new services
- Consistent behavior across the platform

### Service Integration
These configurations integrate with:
- Limit middleware system
- Frontend usage displays
- Plan management system
- Usage tracking services

### Scalability
- Adding new services requires minimal configuration changes
- Service limits can be adjusted without code deployment
- Tier-based restrictions are easily manageable

## Usage Pattern

### Backend Integration
```typescript
import { serviceConfig } from '@/lib/config/services';
import { getServiceLimits } from '@/lib/config/serviceLimits';

const limits = getServiceLimits(userPlan, serviceName);
```

### Frontend Integration
```typescript
// Configurations are consumed by UI components
// to display appropriate limits and restrictions
```

## Configuration Structure

### Service Definitions
Each service is defined with:
- Service name and identifier
- Available features and capabilities
- Integration requirements
- Default settings

### Limit Definitions
Service limits include:
- Usage quotas per plan tier
- Feature availability per plan
- Rate limiting parameters
- Reset periods and cycles

## Maintenance Guidelines

### Adding New Services
1. Add service definition to services.ts
2. Define limit structure in serviceLimits.ts
3. Update related middleware configurations
4. Test limit enforcement

### Modifying Limits
1. Update serviceLimits.ts with new values
2. Consider backward compatibility
3. Update documentation if needed
4. Test with existing user plans

## Integration Points

These configurations are used by:
- Limit middleware system
- Plan management services
- Usage tracking components
- Frontend limit displays
- Admin management interfaces

## Security and Access

- Configuration files are server-side only
- Sensitive limits are not exposed to client
- Plan-based access control is enforced
- Configuration changes require proper authorization