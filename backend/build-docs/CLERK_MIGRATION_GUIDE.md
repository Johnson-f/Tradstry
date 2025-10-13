# Migrating from Supabase to Clerk Authentication

This guide provides a comprehensive approach to migrating your frontend authentication from Supabase to Clerk, based on your existing Rust/Actix Web backend that already supports Clerk authentication.

## Table of Contents

- [Overview](#overview)
- [Backend Analysis](#backend-analysis)
- [Frontend Migration Strategy](#frontend-migration-strategy)
- [Step-by-Step Implementation](#step-by-step-implementation)
- [Key Differences: Supabase vs Clerk](#key-differences-supabase-vs-clerk)
- [Security Considerations](#security-considerations)
- [Testing & Validation](#testing--validation)
- [Troubleshooting](#troubleshooting)

## Overview

Your backend is already configured for Clerk authentication with:
- JWT token validation middleware
- Clerk webhook handling for user events
- Protected routes using Bearer token authentication
- User database management integration

The migration focuses on updating your frontend to use Clerk's authentication system instead of Supabase.

## Backend Analysis

### Current Backend Setup

Your Rust backend (`src/main.rs`) already includes:

```rust
// JWT validation middleware
async fn jwt_validator(req: ServiceRequest, credentials: BearerAuth) -> Result<...>

// Clerk webhook handler
async fn clerk_webhook_handler(app_state: Data<AppState>, req: HttpRequest, body: Bytes) -> ActixResult<...>

// Protected routes configuration
fn configure_auth_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("")
            .wrap(HttpAuthentication::bearer(jwt_validator))
            // Protected endpoints
    );
}
```

### Authentication Flow

1. **Frontend** → Sends JWT token in Authorization header
2. **Backend** → Validates JWT using `validate_jwt_token()`
3. **Backend** → Extracts `ClerkClaims` and user information
4. **Database** → User-specific Turso database access

## Frontend Migration Strategy

### Phase 1: Preparation

#### 1.1 Install Clerk Dependencies

```bash
# For Next.js/React applications
npm install @clerk/nextjs
# OR for React-only applications
npm install @clerk/clerk-react

# For additional utilities
npm install @clerk/types
```

#### 1.2 Environment Variables

Replace Supabase environment variables with Clerk equivalents:

```env
# Remove Supabase variables
# NEXT_PUBLIC_SUPABASE_URL=
# NEXT_PUBLIC_SUPABASE_ANON_KEY=
# SUPABASE_SERVICE_ROLE_KEY=

# Add Clerk variables
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

### Phase 2: Core Implementation

#### 2.1 Application Setup (Next.js)

Replace your Supabase provider with Clerk:

```tsx
// app/layout.tsx or _app.tsx
import { ClerkProvider } from '@clerk/nextjs'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  )
}
```

#### 2.2 Authentication Components

**Sign In Component:**
```tsx
// components/SignIn.tsx
import { SignIn as ClerkSignIn } from '@clerk/nextjs'

export default function SignIn() {
  return (
    <div className="flex justify-center items-center min-h-screen">
      <ClerkSignIn 
        appearance={{
          elements: {
            formButtonPrimary: 'bg-blue-600 hover:bg-blue-700',
            card: 'shadow-lg'
          }
        }}
      />
    </div>
  )
}
```

**Sign Up Component:**
```tsx
// components/SignUp.tsx
import { SignUp as ClerkSignUp } from '@clerk/nextjs'

export default function SignUp() {
  return (
    <div className="flex justify-center items-center min-h-screen">
      <ClerkSignUp 
        appearance={{
          elements: {
            formButtonPrimary: 'bg-blue-600 hover:bg-blue-700',
            card: 'shadow-lg'
          }
        }}
      />
    </div>
  )
}
```

#### 2.3 Authentication Pages

```tsx
// app/sign-in/[[...sign-in]]/page.tsx
import SignIn from '@/components/SignIn'

export default function SignInPage() {
  return <SignIn />
}
```

```tsx
// app/sign-up/[[...sign-up]]/page.tsx
import SignUp from '@/components/SignUp'

export default function SignUpPage() {
  return <SignUp />
}
```

#### 2.4 User Profile Management

```tsx
// components/UserProfile.tsx
import { UserProfile } from '@clerk/nextjs'

export default function UserProfileComponent() {
  return (
    <div className="flex justify-center p-4">
      <UserProfile 
        appearance={{
          elements: {
            card: 'shadow-lg'
          }
        }}
      />
    </div>
  )
}
```

### Phase 3: API Integration

#### 3.1 HTTP Client with Authentication

Replace your Supabase client with a custom HTTP client:

```tsx
// lib/api-client.ts
import { auth } from '@clerk/nextjs'

class ApiClient {
  private baseURL: string

  constructor() {
    this.baseURL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:6000'
  }

  private async getAuthHeaders() {
    const { getToken } = auth()
    const token = await getToken()
    
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  async get<T>(endpoint: string): Promise<T> {
    const headers = await this.getAuthHeaders()
    
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    })

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`)
    }

    return response.json()
  }

  async post<T>(endpoint: string, data: any): Promise<T> {
    const headers = await this.getAuthHeaders()
    
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`)
    }

    return response.json()
  }
}

export const apiClient = new ApiClient()
```

#### 3.2 React Hooks for Data Fetching

```tsx
// hooks/useUser.ts
import { useUser as useClerkUser } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api-client'

interface UserData {
  user_id: string
  email: string
  database_name: string
  created_at: string
  updated_at: string
}

export function useUser() {
  const { user, isLoaded, isSignedIn } = useClerkUser()
  const [userData, setUserData] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchUserData() {
      if (!isSignedIn || !isLoaded) return

      setLoading(true)
      setError(null)

      try {
        const response = await apiClient.get<{
          success: boolean
          data: UserData
        }>('/me')

        if (response.success) {
          setUserData(response.data)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch user data')
      } finally {
        setLoading(false)
      }
    }

    fetchUserData()
  }, [isSignedIn, isLoaded])

  return {
    user,
    userData,
    isLoaded,
    isSignedIn,
    loading,
    error,
  }
}
```

#### 3.3 Server-Side Authentication

```tsx
// lib/auth-server.ts
import { auth } from '@clerk/nextjs'
import { redirect } from 'next/navigation'

export async function requireAuth() {
  const { userId, getToken } = auth()
  
  if (!userId) {
    redirect('/sign-in')
  }

  const token = await getToken()
  return { userId, token }
}

// Usage in server components
export default async function ProtectedPage() {
  const { userId, token } = await requireAuth()
  
  // Fetch data server-side with authentication
  const response = await fetch(`${process.env.API_BASE_URL}/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  const userData = await response.json()

  return (
    <div>
      <h1>Protected Content</h1>
      <pre>{JSON.stringify(userData, null, 2)}</pre>
    </div>
  )
}
```

### Phase 4: Route Protection

#### 4.1 Middleware Setup

```tsx
// middleware.ts
import { authMiddleware } from '@clerk/nextjs'

export default authMiddleware({
  // Routes that can be accessed while signed out
  publicRoutes: [
    '/',
    '/sign-in(.*)',
    '/sign-up(.*)',
    '/api/webhooks(.*)',
  ],
  // Routes that should always be accessible, even without authentication
  ignoredRoutes: [
    '/api/health',
  ],
})

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
}
```

#### 4.2 Client-Side Route Protection

```tsx
// components/ProtectedRoute.tsx
import { useAuth } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

interface ProtectedRouteProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function ProtectedRoute({ children, fallback }: ProtectedRouteProps) {
  const { isLoaded, isSignedIn } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in')
    }
  }, [isLoaded, isSignedIn, router])

  if (!isLoaded) {
    return fallback || <div>Loading...</div>
  }

  if (!isSignedIn) {
    return fallback || null
  }

  return <>{children}</>
}
```

## Key Differences: Supabase vs Clerk

### Authentication Methods

| Feature | Supabase | Clerk |
|---------|----------|-------|
| **Email/Password** | ✅ Built-in | ✅ Built-in |
| **Social OAuth** | ✅ Manual setup | ✅ Easy setup |
| **Magic Links** | ✅ Built-in | ✅ Built-in |
| **Phone/SMS** | ✅ Built-in | ✅ Built-in |
| **Multi-factor Auth** | ⚠️ Manual | ✅ Built-in |
| **Organizations** | ❌ Custom | ✅ Built-in |

### Session Management

**Supabase:**
```tsx
// Session handling
const { data: { session } } = await supabase.auth.getSession()
const token = session?.access_token

// Manual refresh
await supabase.auth.refreshSession()
```

**Clerk:**
```tsx
// Session handling (automatic)
const { getToken } = useAuth()
const token = await getToken()

// Automatic token refresh handled by Clerk
```

### User Management

**Supabase:**
```tsx
// User data from auth.users table
const { data: { user } } = await supabase.auth.getUser()

// Custom profile data requires separate query
const { data: profile } = await supabase
  .from('profiles')
  .select('*')
  .eq('user_id', user.id)
  .single()
```

**Clerk:**
```tsx
// Rich user object with metadata
const { user } = useUser()

// Built-in public/private metadata
const publicMetadata = user?.publicMetadata
const privateMetadata = user?.privateMetadata
```

## Security Considerations

### 1. Token Validation

Your backend already implements proper JWT validation:

```rust
// Validates Clerk JWT tokens
async fn validate_jwt_token(token: &str, config: &AppConfig) -> Result<ClerkClaims, AuthError>
```

### 2. CORS Configuration

Ensure your backend CORS settings allow your frontend domain:

```rust
let cors = Cors::default()
    .allowed_origin("http://localhost:3000") // Your frontend URL
    .allowed_origin("https://your-domain.com") // Production URL
    .allow_any_method()
    .allow_any_header()
    .max_age(3600);
```

### 3. Environment Security

- Never expose `CLERK_SECRET_KEY` to the client
- Use `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` for client-side operations
- Store sensitive keys in secure environment variables

### 4. Webhook Security

Your backend handles Clerk webhooks securely. Ensure webhook endpoints are:
- Verified using Clerk's signature validation
- Rate limited to prevent abuse
- Logged for monitoring

## Testing & Validation

### 1. Authentication Flow Testing

```tsx
// __tests__/auth.test.tsx
import { render, screen } from '@testing-library/react'
import { ClerkProvider } from '@clerk/nextjs'
import { useAuth } from '@clerk/nextjs'

// Mock Clerk hook
jest.mock('@clerk/nextjs', () => ({
  ...jest.requireActual('@clerk/nextjs'),
  useAuth: jest.fn(),
}))

describe('Authentication', () => {
  it('redirects to sign-in when not authenticated', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    })

    // Test your protected components
  })

  it('shows content when authenticated', () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: { id: 'user_123', emailAddresses: [{ emailAddress: 'test@example.com' }] },
    })

    // Test authenticated state
  })
})
```

### 2. API Integration Testing

```tsx
// __tests__/api-client.test.tsx
import { apiClient } from '@/lib/api-client'

// Mock Clerk auth
jest.mock('@clerk/nextjs', () => ({
  auth: () => ({
    getToken: jest.fn().mockResolvedValue('mock-token'),
  }),
}))

describe('API Client', () => {
  it('includes authorization header', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ success: true }),
    })

    await apiClient.get('/test')

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-token',
        }),
      })
    )
  })
})
```

### 3. Backend Integration Verification

Test that your backend properly handles Clerk tokens:

```bash
# Test with valid Clerk token
curl -H "Authorization: Bearer <clerk-jwt-token>" \
     http://127.0.0.1:6000/me

# Should return user information

# Test without token
curl http://127.0.0.1:6000/me

# Should return 401 Unauthorized
```

## Troubleshooting

### Common Issues

#### 1. CORS Errors
**Problem:** Frontend can't connect to backend
**Solution:** Update backend CORS configuration to include your frontend URL

#### 2. Token Validation Errors
**Problem:** Valid Clerk tokens rejected by backend
**Solution:** Verify JWT validation logic matches Clerk's token format

#### 3. Redirect Loops
**Problem:** Infinite redirects between sign-in and protected pages
**Solution:** Check middleware configuration and public routes

#### 4. Session Not Persisting
**Problem:** User gets logged out on page refresh
**Solution:** Ensure ClerkProvider wraps your entire app

### Debug Tools

#### 1. Clerk Dashboard
- Monitor authentication events
- View user sessions and activity
- Check webhook delivery status

#### 2. Network Inspector
```tsx
// Add debug logging to API client
console.log('Making request with token:', token?.substring(0, 10) + '...')
```

#### 3. Backend Logging
Your Rust backend includes logging. Check logs for:
- JWT validation failures
- Webhook processing errors
- Database connection issues

## Migration Checklist

### Pre-Migration
- [ ] Backup current authentication data
- [ ] Set up Clerk project and configure settings
- [ ] Update environment variables
- [ ] Test backend with Clerk tokens

### During Migration
- [ ] Install Clerk dependencies
- [ ] Replace Supabase components with Clerk equivalents
- [ ] Update API client for token management
- [ ] Configure route protection middleware
- [ ] Test authentication flows

### Post-Migration
- [ ] Verify all protected routes work correctly
- [ ] Test user profile management
- [ ] Confirm webhook functionality
- [ ] Monitor authentication metrics
- [ ] Remove Supabase dependencies

### Optional Enhancements
- [ ] Implement organization management
- [ ] Add multi-factor authentication
- [ ] Configure custom email templates
- [ ] Set up user analytics and monitoring

## Conclusion

This migration guide provides a comprehensive approach to switching from Supabase to Clerk authentication. Your backend is already properly configured for Clerk, so the migration primarily involves updating your frontend implementation.

Key benefits of this migration:
- **Better UX**: Pre-built, customizable authentication components
- **Enhanced Security**: Built-in MFA and advanced security features
- **Easier Management**: Centralized user and organization management
- **Better Analytics**: Comprehensive authentication metrics and insights

For additional support, refer to:
- [Clerk Documentation](https://clerk.com/docs)
- [Clerk Community](https://clerk.com/community)
- Your existing backend implementation in `src/main.rs`
