# Core Library Utilities

This directory contains essential utilities and configurations that provide foundational functionality across all Insturix services. These utilities handle database connections, user management, authentication, and shared business logic.

## Key Utilities

### Database Connection
- **editron-mongo.ts** - MongoDB connection utility with connection pooling and type safety

### User Management & Authentication
- **CheckUserType.ts** - User role and permission checking utilities
- **adminAuth.ts** - Administrative authentication and authorization
- **planUtils.ts** - Plan-related calculations and utilities

### Service Integration
- **QFunctions.ts** - Shared query functions and database operations
- **QueryClient.ts** - React Query client configuration and setup

### Payment & Pricing
- **razorpayConfig.ts** - Payment gateway configuration and utilities
- **PricingContext.tsx** - Pricing display and currency management
- **CurrencyContext.tsx** - Multi-currency support and conversion

### Configuration & Setup
- **themeConfig.ts** - Theme configuration and styling utilities
- **Location.ts** - Geolocation and regional settings
- **utils.ts** - Common utility functions and helpers

## MongoDB Connection System

### Connection Management
The MongoDB utility provides:
- **Connection Pooling** - Reuses database connections for performance
- **Environment Configuration** - Supports multiple environments (dev/staging/prod)
- **Type Safety** - Full TypeScript integration with proper typing
- **Error Handling** - Graceful connection failure handling
- **Auto-reconnection** - Automatic reconnection on connection loss

### Usage Pattern
```typescript
import { getMongoClient, getEditronDb, getTasksCollection } from '@/lib/editron-mongo';

// Get database connection
const db = await getEditronDb();

// Get typed collection
const tasksCollection = await getTasksCollection();

// Perform operations with full type safety
const tasks = await tasksCollection.find({ user_id: userId }).toArray();
```

### Service Extension
To add MongoDB support for new services:
1. Create service-specific connection utilities following the editron pattern
2. Define TypeScript interfaces for your data models
3. Implement proper error handling and connection management
4. Add environment variables for service-specific collections

## Authentication & Authorization

### User Type Checking
- Role-based access control
- Plan-based feature access
- Administrative permission validation
- Service-specific authorization

### Admin Authentication
- Secure admin panel access
- Administrative operation validation
- Audit trail for admin actions
- Multi-level admin permissions

## Payment Integration

### Razorpay Configuration
- Secure payment processing setup
- Multiple payment method support
- Webhook handling for payment events
- Refund and cancellation processing

### Currency Management
- Multi-currency support
- Real-time exchange rate integration
- Regional pricing display
- Currency conversion utilities

## Query & Data Management

### React Query Setup
- Optimized caching strategies
- Background data synchronization
- Error handling and retry logic
- Performance optimization

### Database Operations
- Common query patterns
- Data transformation utilities
- Efficient data fetching strategies
- Cross-service data operations

## Integration Guidelines

### For New Services
1. **Database Integration** - Use existing MongoDB patterns for consistency
2. **Authentication** - Integrate with existing user type and admin auth systems
3. **Payment Processing** - Use established Razorpay configuration
4. **Query Management** - Follow React Query patterns for data fetching

### Best Practices
- Always use TypeScript interfaces for data models
- Implement proper error handling for all database operations
- Follow established patterns for authentication and authorization
- Use environment variables for configuration
- Include proper logging for debugging and monitoring

## Performance Considerations

### Database Optimization
- Connection pooling reduces overhead
- Proper indexing for query performance
- Efficient query patterns
- Connection cleanup and resource management

### Caching Strategy
- React Query integration for client-side caching
- Database query result caching
- Static configuration caching
- Memory-efficient data structures

## Security Considerations

### Data Protection
- Secure database connection strings
- Encrypted sensitive data storage
- Proper input validation and sanitization
- SQL injection prevention

### Authentication Security
- Secure token handling
- Session management
- Rate limiting for authentication attempts
- Audit trails for security events

## Environment Management

### Configuration
- Environment-specific database connections
- API key management for different environments
- Feature flag support
- Regional configuration support

### Deployment
- Production-ready connection handling
- Environment variable validation
- Health check integration
- Monitoring and alerting setup