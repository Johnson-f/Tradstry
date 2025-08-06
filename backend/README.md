# Tradistry Backend

This is the FastAPI backend for the Tradistry application, providing API endpoints for the frontend to interact with the Supabase database.

## Setup Instructions

1. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Environment Variables**
   Create a `.env` file in the backend directory with the following variables:
   ```
   # Supabase
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_KEY=your_supabase_anon_key
   
   # JWT
   JWT_SECRET_KEY=your_jwt_secret_key
   ```

3. **Running the Server**
   ```bash
   uvicorn main:app --reload
   ```
   The API will be available at `http://localhost:8000`

## Project Structure

- `main.py` - Main FastAPI application setup and configuration
- `config.py` - Application configuration and settings
- `database.py` - Supabase client setup and database utilities
- `models/` - Database models and schemas
- `routers/` - API route definitions

## API Documentation

Once the server is running, you can access:
- Interactive API docs: `http://localhost:8000/docs`
- Alternative API docs: `http://localhost:8000/redoc`

## Development

- Use Python 3.8+
- Follow PEP 8 style guide
- Write tests for new features
- Document all endpoints and functions
