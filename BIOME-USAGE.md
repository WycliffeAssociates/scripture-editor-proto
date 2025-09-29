# Using Biome in Scripture Editor Proto

This document provides instructions on how to use [Biome](https://biomejs.dev/) for code formatting and linting in this project.

## Available Scripts

The following npm scripts have been added to package.json:

- `npm run format` - Format all files using Biome
- `npm run lint` - Lint all files using Biome
- `npm run check` - Run Biome check with auto-fixes
- `npm run biome` - Comprehensive check that formats, lints, and organizes imports in one command

## Recommended Usage

For day-to-day development, the most comprehensive command is:

```bash
npm run biome
```

This will:
- Format your code according to the rules in biome.json
- Lint your code and apply fixes where possible
- Organize imports automatically

## Configuration

The Biome configuration is stored in `biome.json` at the root of the project. It specifies:

- 2-space indentation
- Double quotes for JavaScript
- Enabled linting with recommended rules
- Automatic import organization

## Formatting Specific Files

You can also format specific files or directories:

```bash
npm run format -- src/features/editor
```

## Pre-commit Hook (Recommendation)

For consistent code quality, consider adding Biome as a pre-commit hook using husky and lint-staged.