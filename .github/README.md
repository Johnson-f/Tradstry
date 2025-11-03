# GitHub Actions for Tradistry

This repository includes GitHub Actions workflows to ensure code quality and catch type errors before merging pull requests.

## Workflows

### 1. Type Check Only (`type-check.yml`)
**Purpose**: Lightweight workflow that only runs TypeScript and Rust type checking.

**Triggers**: 
- Pull requests to `main` or `master` branches
- When PR is opened, updated, or reopened

**What it checks**:
- ✅ TypeScript type checking (`bun run type-check`)
- ✅ Rust type checking (`cargo check --all-targets`)

### 2. Full Quality Checks (`pr-checks.yml`)
**Purpose**: Comprehensive quality checks including security.

**Triggers**: 
- Pull requests to `