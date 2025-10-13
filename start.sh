#!/bin/bash

# Tradstry Backend Startup Script
# This script navigates to the backend directory and starts the Rust server.

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting Tradistry Backend Server${NC}"
echo "=================================="

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"

# Navigate to backend directory
echo -e "${BLUE}📁 Navigating to backend directory...${NC}"
cd "$BACKEND_DIR"
echo "Current directory: $(pwd)"

# Start the server
echo -e "${GREEN}🚀 Starting Rust server...${NC}"
export PORT=9000
RUST_LOG=info cargo run
