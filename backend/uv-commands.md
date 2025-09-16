# UV Package Manager Commands

## Essential UV Commands for Tradistry Backend

### Environment Management
```bash
# Sync dependencies (install/update all packages)
uv sync

# Sync with development dependencies
uv sync --dev

# Create/update lock file
uv lock
```

### Package Management
```bash
# Add a new dependency
uv add fastapi

# Add a development dependency
uv add --dev pytest

# Remove a dependency
uv remove package-name

# Add with version constraint
uv add "fastapi>=0.100.0"
```

### Running Commands
```bash
# Run Python scripts
uv run python main.py

# Run FastAPI server
uv run uvicorn main:app --reload

# Run tests
uv run pytest

# Run linting
uv run ruff check .
uv run black .

# Run type checking
uv run mypy .
```

### Project Management
```bash
# Initialize new project
uv init

# Show project info
uv tree

# Show installed packages
uv pip list
```

### Migration from pip
```bash
# Convert requirements.txt to pyproject.toml
uv add -r requirements.txt

# Export to requirements.txt (if needed)
uv pip freeze > requirements.txt
```

## Benefits of UV over pip
- **Speed**: 10-100x faster than pip
- **Deterministic**: Lock file ensures reproducible builds
- **Modern**: Built-in support for pyproject.toml
- **Reliable**: Better dependency resolution
- **Integrated**: Works seamlessly with virtual environments
