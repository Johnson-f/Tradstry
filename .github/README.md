# GitHub Actions for Tradistry

This repository includes GitHub Actions workflows to ensure code quality and catch type errors before merging pull requests.

## Workflows

### 1. Type Check Only (`type-check.yml`)
**Purpose**: Lightweight workflow that only runs TypeScript and Rust type checking.

**Triggers**: 
- Pull requests to `main` or `master` branches
- When PR is opened, updated, or reopened

**What it checks**:
- ✅ TypeScript type checking (`pnpm run type-check`)
- ✅ Rust type checking (`cargo check --all-targets`)

### 2. Full Quality Checks (`pr-checks.yml`)
**Purpose**: Comprehensive quality checks including formatting, linting, and security.

**Triggers**: 
- Pull requests to `main` or `master` branches
- Pushes to `main` or `master` branches

**What it checks**:
- ✅ TypeScript type checking
- ✅ ESLint checks
- ✅ Prettier format checking
- ✅ Build verification
- ✅ Rust type checking
- ✅ Rust formatting (`cargo fmt`)
- ✅ Rust clippy linting
- ✅ Rust build verification
- ✅ Security audit

## Required Scripts

Make sure your `package.json` includes these scripts:

```json
{
  "scripts": {
    "type-check": "tsc --noEmit",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "next lint",
    "build": "next build"
  }
}
```

## Configuration Files

### Prettier Configuration (`.prettierrc`)
```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "avoid",
  "endOfLine": "lf",
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

### TypeScript Configuration
Your `tsconfig.json` should have:
- `"strict": true` - Enables strict type checking
- `"noEmit": true` - Only type check, don't emit files

## How It Works

1. **When you open a PR**: The workflows automatically run
2. **Type errors**: Will fail the check and prevent merging
3. **Formatting issues**: Will fail the check (run `pnpm run format` to fix)
4. **Linting issues**: Will fail the check (run `pnpm run lint` to fix)
5. **Security issues**: Will show warnings but won't block merging

## Local Development

Before pushing, run these commands locally:

```bash
# Type check
pnpm run type-check

# Format code
pnpm run format

# Lint code
pnpm run lint

# Build check
pnpm run build

# Rust checks
cd backend
cargo check
cargo fmt
cargo clippy
```

## Status Checks

The workflows will show status checks on your PR:
- ✅ **Passed**: All checks passed, PR is ready for review
- ❌ **Failed**: Fix the issues before merging
- ⚠️ **Warnings**: Security issues found, review before merging

## Customization

### Adding More Checks
You can add additional checks to the workflows:

```yaml
- name: Custom Check
  run: |
    echo "Running custom check..."
    # Your custom command here
```

### Branch Protection Rules
Set up branch protection rules in GitHub:
1. Go to Settings → Branches
2. Add rule for `main` branch
3. Require status checks to pass before merging
4. Select the workflows you want to require

### Skipping Checks
To skip checks in a commit message, use:
```
[skip ci]
```

## Troubleshooting

### Common Issues

1. **TypeScript errors**: Fix type issues in your code
2. **Formatting errors**: Run `pnpm run format` locally
3. **Rust errors**: Fix compilation errors in Rust code
4. **Dependency issues**: Update `pnpm-lock.yaml` or `Cargo.lock`

### Getting Help

If workflows fail:
1. Check the Actions tab in GitHub
2. Look at the specific step that failed
3. Fix the issue locally
4. Push the fix to trigger the workflow again

## Performance

- **Type Check Only**: ~2-3 minutes
- **Full Quality Checks**: ~5-8 minutes
- **Caching**: Dependencies are cached for faster runs
