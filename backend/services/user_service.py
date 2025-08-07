from typing import Optional, Dict, Any, Union
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import Client
from database import get_supabase

class UserService:
    def __init__(self, supabase: Client = None):
        self.supabase = supabase or get_supabase()

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

            except Exception:
                # If users table doesn't exist or query fails, return auth user data
                return {
                    'id': user.user.id,
                    'email': user.user.email,
                    'created_at': user.user.created_at,
                    'updated_at': user.user.updated_at,
                    'access_token': token
                }

        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

    async def get_current_active_user(
        self,
        current_user: Dict[str, Any] = Depends(get_current_user)
    ) -> Dict[str, Any]:
        # Add any additional checks for active users here
        # For example, check if the user is banned or has verified their email
        if current_user.get('banned'):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account has been deactivated",
            )
        return current_user
