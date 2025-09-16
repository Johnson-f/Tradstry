# Voyager AI Embedding Service Setup

This document explains how to set up and use the Voyager AI embedding service for Tradistry.

## Migration from Google Embeddings

The embedding service has been migrated from Google's Vertex AI to Voyager AI for improved performance and cost efficiency.

## Setup Instructions

### 1. Install Dependencies

The required dependency has been added to `requirements.txt`:

```bash
uv add voyageai
```

### 2. Get Voyager AI API Key

1. Sign up or log in to [Voyager AI Dashboard](https://dashboard.voyageai.com/)
2. Navigate to [API Keys section](https://dashboard.voyageai.com/organization/api-keys)
3. Click "Create new secret key"
4. Copy your API key

### 3. Environment Configuration

Add the following to your `.env` file:

```bash
# Voyager AI Configuration
VOYAGE_API_KEY=your_api_key_here
```

### 4. Model Configuration

The service supports several Voyager AI models:

- `voyage-3.5` (default) - 1024 dimensions, latest model
- `voyage-3` - 1024 dimensions
- `voyage-large-2` - 1536 dimensions
- `voyage-code-2` - 1536 dimensions (optimized for code)

## Usage

### Basic Usage

```python
from services.ai_embedding_service import AIEmbeddingService

# Initialize with default model (voyage-3.5)
service = AIEmbeddingService()

# Or specify a different model
service = AIEmbeddingService(model_name="voyage-large-2")

# Generate single embedding
embedding = service.generate_embedding("Your text here")

# Generate batch embeddings
texts = ["Text 1", "Text 2", "Text 3"]
embeddings = service.generate_embeddings_batch(texts)
```

### Advanced Features

```python
# Calculate similarity between embeddings
similarity = service.calculate_similarity(embedding1, embedding2)

# Get cached embedding (uses LRU cache)
cached_embedding = service.get_cached_embedding("Frequently used text")

# Get model information
model_info = service.get_model_info()
print(f"Model: {model_info['model_name']}")
print(f"Dimensions: {model_info['embedding_dimension']}")

# Validate embedding format
is_valid = service.validate_embedding(embedding)
```

## Key Changes from Google Embeddings

1. **API Client**: Now uses `voyageai.Client()` instead of `genai.Client()`
2. **Authentication**: Uses `VOYAGE_API_KEY` instead of Google Cloud credentials
3. **Model Names**: Uses Voyager AI model names (e.g., `voyage-3.5`)
4. **Dimensions**: Different embedding dimensions based on model
5. **Batch Limits**: 128 texts per batch request
6. **Input Types**: Supports `document` and `query` input types

## Testing

Run the test script to verify the setup:

```bash
cd backend
python test_voyager_embedding.py
```

## Performance Notes

- Voyager AI models are optimized for retrieval tasks
- Batch processing is automatically handled for large text lists
- LRU caching is available for frequently used texts
- Error handling with fallback to zero vectors

## Troubleshooting

### Common Issues

1. **API Key Not Found**
   - Ensure `VOYAGE_API_KEY` is set in your `.env` file
   - Check that the `.env` file is in the correct location

2. **Import Errors**
   - Run `uv add voyageai` to install the client
   - Ensure you're using the virtual environment

3. **Rate Limiting**
   - Voyager AI has rate limits; the service includes retry logic
   - Consider adding delays between large batch requests

4. **Dimension Mismatches**
   - Different models have different embedding dimensions
   - Update your vector database schema if changing models

## Migration Checklist

- [x] Updated `requirements.txt` with `voyageai`
- [x] Replaced Google imports with Voyager AI
- [x] Updated authentication to use `VOYAGE_API_KEY`
- [x] Modified embedding generation methods
- [x] Updated batch processing for 128-text limit
- [x] Changed model information and dimensions
- [x] Created test script for verification
- [x] Updated documentation

## Support

For issues with the Voyager AI service:
- [Voyager AI Documentation](https://docs.voyageai.com/)
- [Voyager AI Support](https://docs.voyageai.com/discuss)
