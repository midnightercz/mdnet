---
title: Features Overview
author: MDNet
category: Documentation
status: published
updated: 2024-04-30
---

# Features

MDNet is designed to be a lightweight, fast, and extensible markdown wiki.

## Core Features

### 1. Obsidian-Style Wiki Links

Use the familiar `[[page name]]` syntax to create links between pages. MDNet supports:

- Basic links: `[[example]]`
- Links with custom text: `[[example|See example]]`
- Automatic navigation and routing

### 2. Custom Plugin Framework

Define custom code blocks with special plugin identifiers:

```note
This is a note plugin block.
Future implementations can add custom rendering for specific plugin types.
```

The plugin system is extensible and allows for:
- Custom rendering logic
- Special formatting
- Integration with external libraries (like Mermaid for diagrams)

### 3. Lightweight Architecture

MDNet prioritizes minimal bundle size:
- No React, Vue, or other heavy frameworks
- Vanilla TypeScript for maximum control
- esbuild for fast, optimized bundling
- Estimated final page size: <100KB

### 4. Backend Features

- Configurable content directory via `CONTENT_DIR` environment variable
- RESTful API for content retrieval
- Security features (path traversal prevention)
- Static file serving

## Technical Stack

- **Backend**: Express.js + TypeScript
- **Frontend**: Vanilla TypeScript + markdown-it
- **Build**: esbuild + tsc
- **Routing**: Hash-based client-side routing

## Navigation

- [[index]] - Back to home
- [[example]] - See examples
