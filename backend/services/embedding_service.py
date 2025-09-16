"""
Embedding Service for AI Reports
Generates vector embeddings for semantic search and similarity matching
"""

import asyncio
import aiohttp
import os
from typing import List, Optional, Dict, Any
import logging
import hashlib
import json

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Service for generating text embeddings using Hugging Face Inference API"""
    
    def __init__(self):
        self.api_token = os.getenv("HUGGINGFACE_API_TOKEN")
        if not self.api_token:
            raise ValueError("HUGGINGFACE_API_TOKEN environment variable is required")
        
        # Use sentence-transformers model for embeddings
        self.embedding_model = "sentence-transformers/all-MiniLM-L6-v2"
        self.base_url = "https://api-inference.huggingface.co/pipeline/feature-extraction"
        self.session = None
        
        # Cache for embeddings to avoid redundant API calls
        self.embedding_cache = {}
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    def _get_cache_key(self, text: str) -> str:
        """Generate cache key for text"""
        return hashlib.sha256(text.encode()).hexdigest()
    
    async def generate_embedding(self, text: str, max_retries: int = 3) -> Optional[List[float]]:
        """Generate embedding for a single text"""
        
        if not text or not text.strip():
            return None
        
        # Check cache first
        cache_key = self._get_cache_key(text)
        if cache_key in self.embedding_cache:
            logger.info("Using cached embedding")
            return self.embedding_cache[cache_key]
        
        # Truncate text if too long (model limit is usually around 512 tokens)
        truncated_text = text[:2000] if len(text) > 2000 else text
        
        headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "inputs": truncated_text,
            "options": {
                "wait_for_model": True
            }
        }
        
        for attempt in range(max_retries):
            try:
                url = f"{self.base_url}/{self.embedding_model}"
                
                async with self.session.post(url, headers=headers, json=payload) as response:
                    if response.status == 200:
                        result = await response.json()
                        
                        # Handle different response formats
                        if isinstance(result, list) and len(result) > 0:
                            embedding = result[0] if isinstance(result[0], list) else result
                            
                            # Cache the result
                            self.embedding_cache[cache_key] = embedding
                            
                            logger.info(f"Generated embedding with {len(embedding)} dimensions")
                            return embedding
                        else:
                            logger.error(f"Unexpected response format: {result}")
                            
                    elif response.status == 503:
                        # Model loading
                        wait_time = 20 * (attempt + 1)
                        logger.info(f"Model loading, waiting {wait_time}s...")
                        await asyncio.sleep(wait_time)
                        continue
                        
                    else:
                        error_text = await response.text()
                        logger.error(f"API error {response.status}: {error_text}")
                        
            except Exception as e:
                logger.error(f"Embedding generation error (attempt {attempt + 1}): {str(e)}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(5 * (attempt + 1))
                    continue
        
        logger.error(f"Failed to generate embedding after {max_retries} attempts")
        return None
    
    async def generate_batch_embeddings(self, texts: List[str]) -> Dict[str, Optional[List[float]]]:
        """Generate embeddings for multiple texts"""
        
        results = {}
        
        # Process texts in batches to avoid overwhelming the API
        batch_size = 5
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            
            # Create tasks for concurrent processing
            tasks = []
            for text in batch:
                task = self.generate_embedding(text)
                tasks.append((text, task))
            
            # Wait for batch completion
            for text, task in tasks:
                embedding = await task
                results[text] = embedding
            
            # Small delay between batches to be respectful to the API
            if i + batch_size < len(texts):
                await asyncio.sleep(1)
        
        return results
    
    def prepare_report_text_for_embedding(self, report_data: Dict[str, Any]) -> str:
        """Prepare report text for embedding generation"""
        
        # Combine key parts of the report for comprehensive embedding
        text_parts = []
        
        if report_data.get("report_title"):
            text_parts.append(f"Title: {report_data['report_title']}")
        
        if report_data.get("executive_summary"):
            text_parts.append(f"Summary: {report_data['executive_summary']}")
        
        if report_data.get("data_analysis"):
            # Take first 500 chars of analysis
            analysis = report_data["data_analysis"][:500]
            text_parts.append(f"Analysis: {analysis}")
        
        if report_data.get("insights"):
            # Take first 500 chars of insights
            insights = report_data["insights"][:500]
            text_parts.append(f"Insights: {insights}")
        
        # Add key metrics as context
        metrics = []
        if report_data.get("win_rate"):
            metrics.append(f"Win Rate: {report_data['win_rate']}%")
        if report_data.get("profit_factor"):
            metrics.append(f"Profit Factor: {report_data['profit_factor']}")
        if report_data.get("trade_expectancy"):
            metrics.append(f"Expectancy: {report_data['trade_expectancy']}")
        
        if metrics:
            text_parts.append(f"Metrics: {', '.join(metrics)}")
        
        return " | ".join(text_parts)
    
    def prepare_summary_text_for_embedding(self, executive_summary: str) -> str:
        """Prepare executive summary for embedding"""
        # Clean and truncate summary for embedding
        return executive_summary.strip()[:1000] if executive_summary else ""
    
    async def generate_report_embeddings(self, report_data: Dict[str, Any]) -> Dict[str, Optional[List[float]]]:
        """Generate both report and summary embeddings for a report"""
        
        # Prepare texts
        report_text = self.prepare_report_text_for_embedding(report_data)
        summary_text = self.prepare_summary_text_for_embedding(report_data.get("executive_summary", ""))
        
        # Generate embeddings
        embeddings = await self.generate_batch_embeddings([report_text, summary_text])
        
        return {
            "report_embedding": embeddings.get(report_text),
            "summary_embedding": embeddings.get(summary_text)
        }
    
    def clear_cache(self):
        """Clear the embedding cache"""
        self.embedding_cache.clear()
        logger.info("Embedding cache cleared")


# Example usage
async def main():
    """Example usage of the embedding service"""
    
    async with EmbeddingService() as embedding_service:
        
        # Example report data
        report_data = {
            "report_title": "Trading Performance Report - Last 7 Days",
            "executive_summary": "Solid week with 65.5% win rate and $1,882 net profit. Your disciplined approach to risk management is paying off.",
            "data_analysis": "Performance analysis shows consistent risk management with 1-2% position sizing...",
            "insights": "Psychological insights reveal disciplined trading behavior with room for improvement in hold times...",
            "win_rate": 65.5,
            "profit_factor": 1.8,
            "trade_expectancy": 125.50
        }
        
        # Generate embeddings
        embeddings = await embedding_service.generate_report_embeddings(report_data)
        
        print("Generated embeddings:")
        print(f"Report embedding dimensions: {len(embeddings['report_embedding']) if embeddings['report_embedding'] else 0}")
        print(f"Summary embedding dimensions: {len(embeddings['summary_embedding']) if embeddings['summary_embedding'] else 0}")


if __name__ == "__main__":
    asyncio.run(main())
