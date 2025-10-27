#!/bin/bash

# Test Deployment Script - Tag-based Release
# This script helps create a release tag to trigger automated deployment

set -e

echo "🧪 Testing Automated Deployment Pipeline (Tag-based)"
echo "===================================================="

# Check if we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
echo "📍 Current branch: $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "⚠️  Warning: You're not on the main branch. Switch to main for releases."
    echo "   Switch to main: git checkout main"
    exit 1
fi

# Check if there are uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "📝 You have uncommitted changes. Let's commit them first..."
    
    git add .
    git commit -m "feat: prepare for release - $(date)"
    
    echo "✅ Changes committed"
fi

# Get the latest tag to suggest next version
LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
echo "📋 Latest tag: $LATEST_TAG"

# Suggest next version
IFS='.' read -r -a version_parts <<< "${LATEST_TAG#v}"
MAJOR=${version_parts[0]:-0}
MINOR=${version_parts[1]:-0}
PATCH=${version_parts[2]:-0}

NEXT_PATCH="v$MAJOR.$MINOR.$((PATCH + 1))"
NEXT_MINOR="v$MAJOR.$((MINOR + 1)).0"
NEXT_MAJOR="v$((MAJOR + 1)).0.0"

echo ""
echo "🏷️  Suggested next versions:"
echo "   Patch (bug fixes): $NEXT_PATCH"
echo "   Minor (new features): $NEXT_MINOR"
echo "   Major (breaking changes): $NEXT_MAJOR"
echo ""

# Ask user for version
read -p "Enter version tag (e.g., v1.0.0) or press Enter for $NEXT_PATCH: " VERSION_TAG
VERSION_TAG=${VERSION_TAG:-$NEXT_PATCH}

# Validate version format
if [[ ! $VERSION_TAG =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "❌ Invalid version format. Use format: v1.0.0"
    exit 1
fi

# Check if tag already exists
if git tag -l | grep -q "^$VERSION_TAG$"; then
    echo "❌ Tag $VERSION_TAG already exists!"
    exit 1
fi

# Ask for release message
read -p "Enter release message (optional): " RELEASE_MESSAGE
RELEASE_MESSAGE=${RELEASE_MESSAGE:-"Release $VERSION_TAG"}

echo ""
echo "🏷️  Creating release tag: $VERSION_TAG"
git tag -a "$VERSION_TAG" -m "$RELEASE_MESSAGE"

echo "🚀 Pushing tag to trigger deployment..."
git push origin "$VERSION_TAG"

echo ""
echo "✅ Tag pushed successfully!"
echo ""
echo "📊 Next steps:"
echo "1. Go to your GitHub repository"
echo "2. Click on the 'Actions' tab"
echo "3. Watch the 'CD Pipeline - Tagged Releases' workflow"
echo "4. The pipeline should:"
echo "   - Build your backend Docker image with tag $VERSION_TAG"
echo "   - Push it to Docker Hub"
echo "   - Deploy to your VPS at 95.216.219.131"
echo ""
echo "🔗 Direct link: https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^.]*\).*/\1/')/actions"
echo ""
echo "🧪 Test your deployed API:"
echo "   curl http://95.216.219.131/health"
echo ""
echo "📋 View logs on VPS:"
echo "   ssh root@95.216.219.131 'cd /opt/tradstry && docker logs tradstry-backend'"
echo ""
echo "🏷️  To create future releases:"
echo "   ./test-deployment.sh  (run this script again)"
echo "   OR manually:"
echo "   git tag -a v1.0.1 -m 'Release v1.0.1'"
echo "   git push origin v1.0.1"
