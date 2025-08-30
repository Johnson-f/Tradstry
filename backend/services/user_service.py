from typing import Optional, Dict, Any, Union
from datetime import datetime
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import Client
from database import get_supabase
from auth_service import AuthService
import jwt
import json
import base64
import logging

logger = logging.getLogger(__name__)

class UserService:
    def __init__(self, supabase: Client = None):
        self.supabase = supabase or get_supabase()
        self.auth_service = AuthService(supabase)

    def is_token_expired(self, token: str) -> bool:
        """Check if JWT token is expired with proper error handling"""
        try:
            # Validate token format first
            if not token or not isinstance(token, str):
                logger.warning("Invalid token format")
                return True
                
            # Handle potential encoding issues
            try:
                # Split JWT into parts
                parts = token.split('.')
                if len(parts) != 3:
                    logger.warning("Invalid JWT format - incorrect number of parts")
                    return True
                
                # Decode the payload (second part) with proper padding
                payload = parts[1]
                # Add padding if needed
                payload += '=' * (4 - len(payload) % 4)
                
                # Decode base64
                decoded_bytes = base64.urlsafe_b64decode(payload)
                decoded_str = decoded_bytes.decode('utf-8')
                payload_data = json.loads(decoded_str)
                
                exp = payload_data.get('exp', 0)
                current_time = datetime.utcnow().timestamp()
                
                is_expired = current_time >= exp
                if is_expired:
                    logger.info("Token is expired")
                
                return is_expired
                
            except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as e:
                logger.error(f"Error decoding token: {str(e)}")
                return True
                
        except Exception as e:
            logger.error(f"Unexpected error checking token expiration: {str(e)}")
            return True

    async def get_current_user_from_token_async(self, token: str) -> Dict[str, Any]:
        """Async version of get current user from token"""
        try:
            # Validate token format
            if not token or not isinstance(token, str):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token format",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # Check if token needs refresh
            try:
                if self.is_token_expired(token):
                    logger.info("Token is expired, attempting refresh")
                    refreshed_token = await self.auth_service.refresh_token_if_needed(token)
                    if refreshed_token and refreshed_token != token:
                        token = refreshed_token
                        logger.info("Token was successfully refreshed")
                    else:
                        logger.warning("Token refresh failed or returned same token")
            except Exception as e:
                logger.error(f"Token refresh failed: {str(e)}")
                # Continue with original token

            # Use Supabase to verify the JWT token
            try:
                user = self.supabase.auth.get_user(token)
            except Exception as e:
                logger.error(f"Error getting user from Supabase: {str(e)}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication expired - please log in again",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            if not user or not user.user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid authentication credentials",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # Try to get additional user data from users table
            try:
                # Use authenticated client for database queries
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
                    except Exception as e:
                        logger.warning(f"Could not create user profile: {e}")
                        # Return auth user data as fallback
                        return {
                            'id': user.user.id,
                            'email': user.user.email,
                            'created_at': user.user.created_at,
                            'updated_at': user.user.updated_at,
                            'access_token': token
                        }

                return {**response.data[0], 'access_token': token}

            except Exception as e:
                logger.warning(f"Error accessing users table: {e}")
                # Return auth user data as fallback
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
            logger.error(f"Unexpected authentication error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

    def get_current_user_from_token(self, token: str) -> Dict[str, Any]:
        """Get current user from token string (synchronous version) - DEPRECATED"""
        logger.warning("Using deprecated synchronous get_current_user_from_token. Use async version instead.")
        
        try:
            # Validate token format
            if not token or not isinstance(token, str):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token format",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # Use Supabase to verify the JWT token (without refresh for sync version)
            try:
                user = self.supabase.auth.get_user(token)
            except Exception as e:
                logger.error(f"Error getting user from Supabase: {str(e)}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication expired - please log in again",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            if not user or not user.user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid authentication credentials",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # Return basic user data without database query for sync version
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
            logger.error(f"Authentication error: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

    async def get_current_user(
        self,
        credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer(auto_error=False))
    ) -> Dict[str, Any]:
        """Get current authenticated user with proper error handling"""
        if credentials is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authorization header missing or invalid",
                headers={"WWW-Authenticate": "Bearer"},
            )

        try:
            # Get the JWT token from the Authorization header
            token = credentials.credentials

            # Validate token format
            if not token or not isinstance(token, str):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token format",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # Check if token needs refresh
            try:
                if self.is_token_expired(token):
                    logger.info("Token is expired, attempting refresh")
                    refreshed_token = await self.auth_service.refresh_token_if_needed(token)
                    if refreshed_token and refreshed_token != token:
                        token = refreshed_token
                        logger.info("Token was successfully refreshed")
                    else:
                        logger.warning("Token refresh failed - token may be invalid")
                        # Don't fail here, let Supabase auth handle the invalid token
            except Exception as e:
                logger.error(f"Token refresh failed: {str(e)}")
                # Continue with original token and let Supabase handle validation

            # Use Supabase to verify the JWT token
            try:
                user = self.supabase.auth.get_user(token)
            except Exception as e:
                logger.error(f"Supabase auth failed: {str(e)}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication expired - please log in again",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            if not user or not user.user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid authentication credentials",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # Try to get additional user data from users table with authenticated client
            try:
                auth_client = await self.auth_service.get_authenticated_client(token)
                if not auth_client:
                    logger.warning("Could not get authenticated client")
                    # Return basic auth data as fallback
                    return {
                        'id': user.user.id,
                        'email': user.user.email,
                        'created_at': user.user.created_at,
                        'updated_at': user.user.updated_at,
                        'access_token': token
                    }

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
                    except Exception as e:
                        logger.warning(f"Could not create user profile: {e}")
                        # Return auth user data as fallback
                        return {
                            'id': user.user.id,
                            'email': user.user.email,
                            'created_at': user.user.created_at,
                            'updated_at': user.user.updated_at,
                            'access_token': token
                        }

                # Merge database user data with access token
                user_data = response.data[0]
                user_data['access_token'] = token
                return user_data

            except Exception as e:
                logger.warning(f"Error accessing users table: {e}")
                # Return auth user data as fallback
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
            logger.error(f"Unexpected authentication error: {str(e)}")
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

    def validate_token_format(self, token: str) -> bool:
        """Validate JWT token format without decoding"""
        try:
            if not token or not isinstance(token, str):
                return False
            
            parts = token.split('.')
            if len(parts) != 3:
                return False
                
            # Check if each part is valid base64
            for part in parts:
                try:
                    # Add padding if needed
                    padded_part = part + '=' * (4 - len(part) % 4)
                    base64.urlsafe_b64decode(padded_part)
                except Exception:
                    return False
                    
            return True
        except Exception:
            return False