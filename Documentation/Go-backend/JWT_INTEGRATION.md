# JWT Integration Documentation

## Overview
This document describes the production-ready JWT authentication implementation for the Tradistry Go backend, which integrates with Supabase authentication.

## Implementation Details

### 1. JWT Token Validation
- **Full JWT Parsing**: Uses `github.com/golang-jwt/jwt/v5` for complete token validation
- **Supabase Claims**: Custom `SupabaseClaims` struct matches Supabase JWT structure
- **Token Verification**: Validates signature, expiration, and claims integrity
- **Error Handling**: Comprehensive error messages for debugging

### 2. User Context Extraction
- **Real User IDs**: Extracts actual user ID from JWT `sub` claim
- **Context Storage**: Stores user info in Fiber context for handler access
- **Type Safety**: Proper type conversion from string to int64 for database operations

### 3. Security Features
- **Token Expiration**: Validates `exp` claim to prevent expired token usage
- **Signature Verification**: Uses HMAC signing method validation
- **Bearer Token Support**: Handles "Bearer " prefix in Authorization headers
- **User Authorization**: Ensures users can only access their own resources

## Code Structure

### AuthService (`services/auth_service.go`)
```go
type SupabaseClaims struct {
    Sub   string `json:"sub"`   // User ID
    Email string `json:"email"`
    Role  string `json:"role"`
    Aud   string `json:"aud"`   // Audience
    Exp   int64  `json:"exp"`   // Expiration time
    Iat   int64  `json:"iat"`   // Issued at
    Iss   string `json:"iss"`   // Issuer
    jwt.RegisteredClaims
}

func (a *AuthService) ValidateToken(tokenString string) (*AuthUser, error)
func (a *AuthService) GetUserIDFromToken(tokenString string) (string, error)
```

### Authentication Middleware (`middleware/auth.go`)
- Validates JWT tokens on protected routes
- Extracts user information and stores in context
- Returns 401 for invalid/expired tokens

### Handler Updates
All handlers now use real user context:
- **Trade Handlers**: Extract user ID from context for data isolation
- **User Handlers**: Implement proper authorization checks
- **Error Handling**: Return 401/403 for authentication/authorization failures

## Usage Examples

### Protected Route Access
```bash
# With valid JWT token
curl -H "Authorization: Bearer <jwt_token>" \
     http://localhost:9000/api/trades

# Without token (returns 401)
curl http://localhost:9000/api/trades
```

### User Data Isolation
- Users can only access their own trades
- User profile endpoints require matching user ID
- Admin privileges can be implemented via role claims

## Configuration

### Environment Variables
```env
JWT_SECRET=your-jwt-secret-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
```

### JWT Secret
- Must match the secret used by Supabase for token signing
- Should be a strong, randomly generated key
- Used for HMAC signature verification

## Testing

### Valid Token Structure
Supabase JWT tokens contain:
- `sub`: User UUID
- `email`: User email address
- `role`: User role (authenticated, anon, etc.)
- `exp`: Expiration timestamp
- `iat`: Issued at timestamp
- `iss`: Issuer (supabase)

### Error Scenarios
1. **Missing Token**: Returns 401 "Token required"
2. **Invalid Format**: Returns 401 "Failed to parse token"
3. **Expired Token**: Returns 401 "Token has expired"
4. **Invalid Signature**: Returns 401 "Failed to parse token"
5. **Missing Claims**: Returns 401 "Invalid token claims"

## Migration Notes

### From Mock Authentication
- Removed hardcoded `userID := int64(1)` from all handlers
- Added `getUserIDFromContext()` helper functions
- Implemented proper error handling for missing context

### Database Integration
- User IDs are now extracted from JWT claims
- Supports both string UUIDs and numeric IDs
- Proper type conversion for database operations

## Security Considerations

1. **Token Storage**: Frontend should store tokens securely (httpOnly cookies recommended)
2. **Token Refresh**: Implement token refresh logic for long-lived sessions
3. **Rate Limiting**: Add rate limiting to prevent brute force attacks
4. **HTTPS Only**: Always use HTTPS in production
5. **Secret Rotation**: Regularly rotate JWT secrets

## Future Enhancements

1. **Role-Based Access Control**: Implement granular permissions
2. **Token Blacklisting**: Add logout functionality with token invalidation
3. **Multi-Factor Authentication**: Support for MFA tokens
4. **Audit Logging**: Log authentication events for security monitoring
