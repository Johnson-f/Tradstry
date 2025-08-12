from typing import Optional, Dict, Any, Union
from datetime import datetime
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import Client
from database import get_supabase
from auth_service import AuthService
import jwt

class UserService:
    def __init__(self, supabase: Client = None):
        self.supabase = supabase or get_supabase()
        self.auth_service = AuthService(supabase)

    def is_token_expired(self, token: str) -> bool:
        """Check if JWT token is expired"""
        try:
            decoded = jwt.decode(token, options={"verify_signature": False})
            exp = decoded.get('exp', 0)
            current_time = datetime.utcnow().timestamp()
            return current_time >= exp
        except:
            return True

    def get_current_user_from_token(self, token: str) -> Dict[str, Any]:
        """Get current user from token string (synchronous version)"""
        try:
            # Check if token needs refresh
            try:
                # Note: This is calling an async method from sync - you may need to handle this
                # For now, we'll skip the refresh in the sync version
                pass
            except Exception as e:
                print(f"Token refresh skipped in sync method: {e}")

            # Use Supabase to verify the JWT token
            user = self.supabase.auth.get_user(token)

            if not user or not user.user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid authentication credentials",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # Try to get additional user data from users table
            try:
                # Use the service client for this query since we need authenticated access
                response = self.supabase.table('users').select('*').eq('id', user.user.id).execute()

                if not response.data or len(response.data) == 0:
                    # Create user profile if it doesn't exist
                    user_data = {
                        'id': user.user.id,
                        'email': user.user.email,
                        'created_at': user.user.created_at,
                        'updated_at': user.user.updated_at,
                    }
                    try:
                        self.supabase.table('users').upsert(user_data).execute()
                        return {**user_data, 'access_token': token}
                    except Exception:
                        # If users table doesn't exist, return auth user data
                        return {
                            'id': user.user.id,
                            'email': user.user.email,
                            'created_at': user.user.created_at,
                            'updated_at': user.user.updated_at,
                            'access_token': token
                        }

                return {**response.data[0], 'access_token': token}

            except Exception as e:
                print(f"Error accessing users table: {e}")
                # If users table doesn't exist or query fails, return auth user data
                return {
                    'id': user.user.id,
                    'email': user.user.email,
                    'created_at': user.user.created_at,
                    'updated_at': user.user.updated_at,
                    'access_token': token
                }

        except HTTPException:
            raise
        except Exception as e:
            print(f"Authentication error: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

    async def get_current_user(
        self,
        credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer(auto_error=False))
    ) -> Dict[str, Any]:
        if credentials is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authorization header missing or invalid",
                headers={"WWW-Authenticate": "Bearer"},
            )

        try:
            # Get the JWT token from the Authorization header
            token = credentials.credentials

            # Check if token needs refresh
            try:
                refreshed_token = await self.auth_service.refresh_token_if_needed(token)
                if refreshed_token != token:
                    token = refreshed_token
                    print("Token was refreshed in get_current_user")
            except Exception as e:
                print(f"Token refresh failed: {e}")
                # Continue with original token and let it fail naturally if expired

            # Use Supabase to verify the JWT token
            user = self.supabase.auth.get_user(token)

            if not user or not user.user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid authentication credentials",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # Try to get additional user data from users table with authenticated client
            try:
                auth_client = await self.auth_service.get_authenticated_client(token)
                response = auth_client.table('users').select('*').eq('id', user.user.id).execute()

                if not response.data or len(response.data) == 0:
                    # Create user profile if it doesn't exist
                    user_data = {
                        'id': user.user.id,
                        'email': user.user.email,
                        'created_at': user.user.created_at,
                        'updated_at': user.user.updated_at,
                    }
                    try:
                        auth_client.table('users').upsert(user_data).execute()
                        return {**user_data, 'access_token': token}
                    except Exception:
                        # If users table doesn't exist, return auth user data
                        return {
                            'id': user.user.id,
                            'email': user.user.email,
                            'created_at': user.user.created_at,
                            'updated_at': user.user.updated_at,
                            'access_token': token
                        }

                return {**response.data[0], 'access_token': token}

            except Exception as e:
                print(f"Error accessing users table: {e}")
                # If users table doesn't exist or query fails, return auth user data
                return {
                    'id': user.user.id,
                    'email': user.user.email,
                    'created_at': user.user.created_at,
                    'updated_at': user.user.updated_at,
                    'access_token': token
                }

        except HTTPException:
            raise
        except Exception as e:
            print(f"Authentication error: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

    async def get_current_active_user(
        self,
        current_user: Dict[str, Any] = Depends(lambda: self.get_current_user)
    ) -> Dict[str, Any]:
        # Add any additional checks for active users here
        if current_user.get('banned'):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account has been deactivated",
            )
        return current_user