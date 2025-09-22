from typing import List, Dict, Any, Optional
import numpy as np
import logging
from functools import lru_cache
import os
from dotenv import load_dotenv
import voyageai

# Load environment variables from .env file
load_dotenv()

logger = logging.getLogger(__name__)

class AIEmbeddingService:
    """
    Service for generating embeddings using Voyager AI embedding models.
    Provides cloud-based embedding generation with high-quality results.
    """
    
    def __init__(self, model_name: str = "voyage-3.5"):
        """
        Initialize the embedding service with a specified Voyager AI model.
        
        Args:
            model_name: Name of the Voyager AI embedding model to use
        """
        self.model_name = model_name
        self._client = None
        # Set embedding dimensions based on model
        if model_name == "voyage-3.5":
            self.embedding_dimension = 1024
        elif model_name == "voyage-3":
            self.embedding_dimension = 1024
        elif model_name == "voyage-large-2":
            self.embedding_dimension = 1536
        elif model_name == "voyage-code-2":
            self.embedding_dimension = 1536
        else:
            self.embedding_dimension = 1024  # Default for other models
        
        # Set up environment variables for Voyager AI
        self._setup_voyager_env()
        
    def _setup_voyager_env(self):
        """Setup environment variables for Voyager AI if not already set."""
        # Load environment variables from .env file if it exists
        load_dotenv()
        
        # Check for required Voyager API key
        api_key = os.getenv("VOYAGE_API_KEY")
        if not api_key:
            logger.warning(
                "VOYAGE_API_KEY environment variable not set. "
                "Please set it in your .env file or environment. "
                "Get your API key from https://dashboard.voyageai.com/organization/api-keys"
            )
        
    @property
    def client(self):
        """Lazy load the Voyager AI client to avoid initialization overhead."""
        if self._client is None:
            try:
                self._client = voyageai.Client()
                logger.info(f"Initialized Voyager AI client for model: {self.model_name} (dim: {self.embedding_dimension})")
            except Exception as e:
                logger.error(f"Failed to initialize Voyager AI client: {str(e)}")
                raise Exception(f"Failed to initialize Voyager AI embedding client: {str(e)}")
        return self._client
    
    def generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding for a single text using Voyager AI's embedding model.
        
        Args:
            text: Input text to embed
            
        Returns:
            List of floats representing the embedding vector
        """
        try:
            if not text or not text.strip():
                # Return zero vector for empty text
                return [0.0] * self.embedding_dimension
                
            # Clean and normalize text
            cleaned_text = self._preprocess_text(text)
            
            # Generate embedding using Voyager AI's API
            response = self.client.embed(
                texts=[cleaned_text],
                model=self.model_name,
                input_type="document"
            )
            
            # Extract embedding values
            if response.embeddings and len(response.embeddings) > 0:
                embedding = response.embeddings[0]
                return list(embedding)
            else:
                logger.warning("No embedding returned from Voyager AI API")
                return self._generate_fallback_embedding(cleaned_text)
                
        except Exception as e:
            # Check if it's a rate limit/billing issue
            if "rate limits" in str(e) or "payment method" in str(e):
                logger.warning(f"Voyage AI rate limit reached, using fallback embeddings: {str(e)}")
            else:
                logger.error(f"Error generating embedding for text: {str(e)}")
            # Use fallback embedding generation
            return self._generate_fallback_embedding(text)
    
    def generate_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple texts efficiently using Voyager AI's API.
        
        Args:
            texts: List of input texts to embed
            
        Returns:
            List of embedding vectors
        """
        try:
            if not texts:
                return []
                
            # Clean and normalize texts
            cleaned_texts = [self._preprocess_text(text) for text in texts]
            
            # Voyager AI has a batch limit of 128 texts per request
            batch_size = 128
            all_embeddings = []
            
            for i in range(0, len(cleaned_texts), batch_size):
                batch_texts = cleaned_texts[i:i + batch_size]
                
                # Generate embeddings in batch using Voyager AI's API
                response = self.client.embed(
                    texts=batch_texts,
                    model=self.model_name,
                    input_type="document"
                )
                
                # Extract embedding values
                if response.embeddings:
                    batch_embeddings = [list(embedding) for embedding in response.embeddings]
                    all_embeddings.extend(batch_embeddings)
                else:
                    logger.warning(f"No embeddings returned from Voyager AI API for batch {i//batch_size + 1}")
                    all_embeddings.extend([[0.0] * self.embedding_dimension] * len(batch_texts))
                
            return all_embeddings
            
        except Exception as e:
            # Check if it's a rate limit/billing issue
            if "rate limits" in str(e) or "payment method" in str(e):
                logger.warning(f"Voyage AI rate limit reached for batch, using fallback embeddings: {str(e)}")
            else:
                logger.error(f"Error generating batch embeddings: {str(e)}")
            # Use fallback embeddings for all texts
            return [self._generate_fallback_embedding(text) for text in texts]
    
    def _preprocess_text(self, text: str) -> str:
        """
        Preprocess text for embedding generation.
        
        Args:
            text: Raw input text
            
        Returns:
            Cleaned and normalized text
        """
        if not text:
            return ""
            
        # Basic cleaning
        cleaned = text.strip()
        
        # Remove excessive whitespace
        cleaned = " ".join(cleaned.split())
        
        # Truncate if too long (Voyager AI models have token limits)
        max_length = 4000  # Conservative limit for Voyager AI embedding models
        if len(cleaned) > max_length:
            cleaned = cleaned[:max_length].rsplit(' ', 1)[0]  # Cut at word boundary
            
        return cleaned
    
    def calculate_similarity(self, embedding1: List[float], embedding2: List[float]) -> float:
        """
        Calculate cosine similarity between two embeddings.
        
        Args:
            embedding1: First embedding vector
            embedding2: Second embedding vector
            
        Returns:
            Similarity score between 0 and 1
        """
        try:
            # Convert to numpy arrays
            vec1 = np.array(embedding1)
            vec2 = np.array(embedding2)
            
            # Calculate cosine similarity
            dot_product = np.dot(vec1, vec2)
            norm1 = np.linalg.norm(vec1)
            norm2 = np.linalg.norm(vec2)
            
            if norm1 == 0 or norm2 == 0:
                return 0.0
                
            similarity = dot_product / (norm1 * norm2)
            
            # Ensure result is between 0 and 1
            return max(0.0, min(1.0, float(similarity)))
            
        except Exception as e:
            logger.error(f"Error calculating similarity: {str(e)}")
            return 0.0
    
    def find_most_similar(self, query_embedding: List[float], 
                         candidate_embeddings: List[List[float]], 
                         threshold: float = 0.7) -> List[Dict[str, Any]]:
        """
        Find most similar embeddings from a list of candidates.
        
        Args:
            query_embedding: Query embedding vector
            candidate_embeddings: List of candidate embedding vectors
            threshold: Minimum similarity threshold
            
        Returns:
            List of dictionaries with index and similarity score
        """
        try:
            results = []
            
            for i, candidate in enumerate(candidate_embeddings):
                similarity = self.calculate_similarity(query_embedding, candidate)
                
                if similarity >= threshold:
                    results.append({
                        'index': i,
                        'similarity': similarity
                    })
            
            # Sort by similarity (highest first)
            results.sort(key=lambda x: x['similarity'], reverse=True)
            
            return results
            
        except Exception as e:
            logger.error(f"Error finding similar embeddings: {str(e)}")
            return []
    
    @lru_cache(maxsize=1000)
    def get_cached_embedding(self, text: str) -> tuple:
        """
        Get embedding with caching for frequently used texts.
        
        Args:
            text: Input text to embed
            
        Returns:
            Tuple of embedding values (for hashability)
        """
        embedding = self.generate_embedding(text)
        return tuple(embedding)
    
    def get_model_info(self) -> Dict[str, Any]:
        """
        Get information about the current embedding model.
        
        Returns:
            Dictionary with model information
        """
        return {
            'model_name': self.model_name,
            'embedding_dimension': self.embedding_dimension,
            'max_sequence_length': 4000,  # Voyager AI embedding models limit
            'model_type': 'voyager-ai',
            'provider': 'Voyager AI'
        }
    
    def validate_embedding(self, embedding: List[float]) -> bool:
        """
        Validate that an embedding has the correct format and dimension.
        
        Args:
            embedding: Embedding vector to validate
            
        Returns:
            True if valid, False otherwise
        """
        try:
            if not isinstance(embedding, list):
                return False
                
            if len(embedding) != self.embedding_dimension:
                return False
                
            # Check that all values are numbers
            for value in embedding:
                if not isinstance(value, (int, float)) or np.isnan(value) or np.isinf(value):
                    return False
                    
            return True
            
        except Exception:
            return False
    
    def _generate_fallback_embedding(self, text: str) -> List[float]:
        """
        Generate a simple fallback embedding when Voyager AI is unavailable.
        This uses a basic hash-based approach to create consistent embeddings.
        
        Args:
            text: Input text to embed
            
        Returns:
            List of floats representing the embedding vector
        """
        try:
            if not text or not text.strip():
                return [0.0] * self.embedding_dimension
            
            # Use a simple hash-based approach for fallback embeddings
            # This ensures consistent embeddings for the same text
            import hashlib
            
            # Clean and normalize text
            cleaned_text = self._preprocess_text(text).lower()
            
            # Create multiple hash values to generate the embedding
            embedding = []
            for i in range(self.embedding_dimension // 16):  # 16 values per hash
                seed = f"{cleaned_text}_{i}"
                hash_obj = hashlib.md5(seed.encode('utf-8'))
                hash_bytes = hash_obj.digest()
                
                # Convert hash bytes to float values between -1 and 1
                for j in range(0, len(hash_bytes), 2):
                    if len(embedding) >= self.embedding_dimension:
                        break
                    if j + 1 < len(hash_bytes):
                        # Combine two bytes to create a value
                        val = (hash_bytes[j] << 8) | hash_bytes[j + 1]
                        # Normalize to [-1, 1]
                        normalized = (val / 65535.0) * 2.0 - 1.0
                        embedding.append(normalized)
            
            # Pad with zeros if needed
            while len(embedding) < self.embedding_dimension:
                embedding.append(0.0)
            
            # Truncate if too long
            embedding = embedding[:self.embedding_dimension]
            
            logger.info(f"Generated fallback embedding for text (length: {len(text)})")
            return embedding
            
        except Exception as e:
            logger.error(f"Error generating fallback embedding: {str(e)}")
            # Return zero vector as final fallback
            return [0.0] * self.embedding_dimension
