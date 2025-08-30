from typing import List, Dict, Any, Optional
import numpy as np
from sentence_transformers import SentenceTransformer
import logging
from functools import lru_cache

logger = logging.getLogger(__name__)

class AIEmbeddingService:
    """
    Service for generating embeddings using Hugging Face Sentence Transformers.
    Provides local embedding generation for cost-effective AI operations.
    """
    
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        """
        Initialize the embedding service with a specified model.
        
        Args:
            model_name: Name of the sentence transformer model to use
        """
        self.model_name = model_name
        self._model = None
        self.embedding_dimension = 384  # Default for all-MiniLM-L6-v2
        
    @property
    def model(self):
        """Lazy load the model to avoid initialization overhead."""
        if self._model is None:
            try:
                self._model = SentenceTransformer(self.model_name)
                self.embedding_dimension = self._model.get_sentence_embedding_dimension()
                logger.info(f"Loaded embedding model: {self.model_name} (dim: {self.embedding_dimension})")
            except Exception as e:
                logger.error(f"Failed to load embedding model {self.model_name}: {str(e)}")
                raise Exception(f"Failed to initialize embedding model: {str(e)}")
        return self._model
    
    def generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding for a single text.
        
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
            
            # Generate embedding
            embedding = self.model.encode(cleaned_text, convert_to_tensor=False)
            
            # Convert to list and ensure proper format
            if isinstance(embedding, np.ndarray):
                embedding = embedding.tolist()
                
            return embedding
            
        except Exception as e:
            logger.error(f"Error generating embedding for text: {str(e)}")
            # Return zero vector as fallback
            return [0.0] * self.embedding_dimension
    
    def generate_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple texts efficiently.
        
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
            
            # Generate embeddings in batch
            embeddings = self.model.encode(cleaned_texts, convert_to_tensor=False)
            
            # Convert to list format
            if isinstance(embeddings, np.ndarray):
                embeddings = embeddings.tolist()
                
            return embeddings
            
        except Exception as e:
            logger.error(f"Error generating batch embeddings: {str(e)}")
            # Return zero vectors as fallback
            return [[0.0] * self.embedding_dimension] * len(texts)
    
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
        
        # Truncate if too long (models have token limits)
        max_length = 500  # Conservative limit for sentence transformers
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
            'max_sequence_length': getattr(self.model, 'max_seq_length', 512),
            'model_type': 'sentence-transformer'
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
