#!/bin/bash
# UV-based activation script for the backend environment
# Usage: source activate.sh

# Add UV to PATH if not already present
export PATH="$HOME/.local/bin:$PATH"

if command -v uv &> /dev/null; then
    if [ -f "pyproject.toml" ]; then
        # Activate UV virtual environment
        source .venv/bin/activate
        echo "✅ UV environment activated: $(which python)"
        echo "📦 Python version: $(python --version)"
        echo "🔧 Virtual environment path: $VIRTUAL_ENV"
        echo "⚡ UV package manager ready"
        echo ""
        echo "🚀 Available UV commands:"
        echo "  uv add <package>     - Add a new dependency"
        echo "  uv remove <package>  - Remove a dependency"
        echo "  uv sync              - Sync dependencies"
        echo "  uv run <command>     - Run command in UV environment"
        echo "  uv lock              - Update lock file"
    else
        echo "❌ pyproject.toml not found. Run 'uv init' first."
    fi
else
    echo "❌ UV not found. Install with: curl -LsSf https://astral.sh/uv/install.sh | sh"
fi
