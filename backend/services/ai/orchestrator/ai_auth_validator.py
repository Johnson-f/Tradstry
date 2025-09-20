from typing import Optional
import logging
import string
import base64

logger = logging.getLogger(__name__)


class AIAuthValidator:
    """
    Handles authentication and security validation for AI services.
    Validates JWT tokens, checks token structure, and ensures security compliance.
    """

    def __init__(self):
        logger.info("AI Auth Validator initialized")

    def validate_token(self, access_token: str) -> bool:
        """
        Validate access token format and structure.
        
        Args:
            access_token: The JWT token to validate
            
        Returns:
            True if token is valid, False otherwise
        """
        try:
            # Handle None or empty token
            if not access_token:
                logger.warning("Token validation failed: Empty or None token")
                return False

            # Ensure token is a string, not bytes
            if isinstance(access_token, bytes):
                try:
                    access_token = access_token.decode('utf-8')
                except UnicodeDecodeError as e:
                    logger.error(f"Error decoding token from bytes: Invalid UTF-8 sequence: {str(e)}")
                    return False

            # Remove Bearer prefix if present
            token = access_token.replace("Bearer ", "").strip()

            # Basic token validation - should be a valid JWT-like string
            if not token or len(token) < 20:
                logger.warning("Token validation failed: Token too short or empty")
                return False

            # Check for valid JWT characters (base64url + dots)
            valid_chars = string.ascii_letters + string.digits + '-_.'
            if not all(c in valid_chars for c in token):
                logger.warning("Token validation failed: Contains invalid characters for JWT")
                return False

            # Validate JWT structure before decoding
            parts = token.split('.')
            if len(parts) != 3:
                logger.warning(f"Token validation failed: Invalid JWT structure - expected 3 parts, got {len(parts)}")
                return False

            # Validate each part can be base64 decoded
            try:
                # Check header and payload parts (not signature)
                for i, part in enumerate(parts[:2]):
                    if not part:  # Empty part
                        logger.warning(f"Token validation failed: Empty JWT part {i}")
                        return False

                    # Add proper padding
                    padded_part = part + '=' * (4 - len(part) % 4)
                    base64.urlsafe_b64decode(padded_part)

                logger.debug("Token validation successful")
                return True
                
            except Exception as decode_error:
                logger.warning(f"Token validation failed: Base64 decoding error in JWT part: {str(decode_error)}")
                return False

        except Exception as e:
            logger.error(f"Unexpected error validating token: {str(e)}")
            return False

    def extract_user_id(self, user: dict) -> str:
        """
        Extract user ID from user object with proper fallback.
        
        Args:
            user: User object containing authentication information
            
        Returns:
            User ID string or 'unknown' if not found
        """
        try:
            # Based on memory fix - auth utility returns user with 'id' field, not 'user_id'
            user_id = user.get("id", "unknown")
            
            if user_id == "unknown":
                # Try alternative field names as fallback
                user_id = user.get("user_id", "unknown")
                if user_id == "unknown":
                    user_id = user.get("sub", "unknown")  # JWT standard field
            
            # Log successful extraction for debugging
            if user_id != "unknown":
                logger.debug(f"Successfully extracted user ID: {user_id[:8]}...")
            else:
                logger.warning("Failed to extract user ID from user object", extra={
                    "available_fields": list(user.keys()) if isinstance(user, dict) else "not_dict"
                })
                
            return user_id
            
        except Exception as e:
            logger.error(f"Error extracting user ID: {str(e)}")
            return "unknown"

    def extract_access_token(self, user: dict) -> Optional[str]:
        """
        Extract access token from user object.
        
        Args:
            user: User object containing authentication information
            
        Returns:
            Access token string or None if not found
        """
        try:
            access_token = user.get("access_token")
            
            if not access_token:
                # Try alternative field names
                access_token = user.get("token") or user.get("jwt")
                
            if access_token and self.validate_token(access_token):
                return access_token
            else:
                logger.warning("No valid access token found in user object")
                return None
                
        except Exception as e:
            logger.error(f"Error extracting access token: {str(e)}")
            return None

    def validate_user_object(self, user: dict) -> bool:
        """
        Validate that user object contains required authentication fields.
        
        Args:
            user: User object to validate
            
        Returns:
            True if user object is valid, False otherwise
        """
        try:
            if not isinstance(user, dict):
                logger.error("User object is not a dictionary")
                return False
                
            # Check for required fields
            required_fields = ["id", "access_token"]
            missing_fields = [field for field in required_fields if not user.get(field)]
            
            if missing_fields:
                logger.warning(f"User object missing required fields: {missing_fields}")
                return False
                
            # Validate access token if present
            access_token = user.get("access_token")
            if access_token and not self.validate_token(access_token):
                logger.warning("User object contains invalid access token")
                return False
                
            return True
            
        except Exception as e:
            logger.error(f"Error validating user object: {str(e)}")
            return False

    def get_auth_context(self, user: dict) -> dict:
        """
        Extract authentication context from user object.
        
        Args:
            user: User object containing authentication information
            
        Returns:
            Dictionary with authentication context
        """
        try:
            return {
                "user_id": self.extract_user_id(user),
                "has_valid_token": bool(self.extract_access_token(user)),
                "user_email": user.get("email", "unknown"),
                "auth_valid": self.validate_user_object(user),
                "token_length": len(user.get("access_token", "")) if user.get("access_token") else 0
            }
            
        except Exception as e:
            logger.error(f"Error getting auth context: {str(e)}")
            return {
                "user_id": "unknown",
                "has_valid_token": False,
                "user_email": "unknown",
                "auth_valid": False,
                "token_length": 0,
                "error": str(e)
            }