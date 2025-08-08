import time
from gotrue.errors import AuthRetryableError
from fastapi import HTTPException, status
from typing import Dict, Any

def get_user_with_retry(supabase_client, token: str, max_retries: int = 3) -> Dict[str, Any]:
    """
    Get user from Supabase with retry logic for network issues
    """
    for attempt in range(max_retries):
        try:
            user = supabase_client.auth.get_user(token)
            if not user or not user.user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid authentication credentials",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            return {"id": user.user.id, "email": user.user.email}
            
        except AuthRetryableError as e:
            if attempt == max_retries - 1:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Authentication service temporarily unavailable. Please try again."
                )
            # Exponential backoff: 0.5s, 1s, 2s
            time.sleep(0.5 * (2 ** attempt))
        except Exception as e:
            # Handle other auth errors (invalid token, etc.)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

def get_user_with_token_retry(supabase_client, token: str, max_retries: int = 3) -> Dict[str, Any]:
    """
    Get user from Supabase with retry logic - includes access token in response
    """
    for attempt in range(max_retries):
        try:
            user = supabase_client.auth.get_user(token)
            if not user or not user.user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid authentication credentials",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            return {
                "id": user.user.id, 
                "email": user.user.email, 
                "access_token": token
            }
            
        except AuthRetryableError as e:
            if attempt == max_retries - 1:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Authentication service temporarily unavailable. Please try again."
                )
            # Exponential backoff: 0.5s, 1s, 2s
            time.sleep(0.5 * (2 ** attempt))
        except Exception as e:
            # Handle other auth errors (invalid token, etc.)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )