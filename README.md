# MDNet - Lightweight Markdown Wiki

A TypeScript-based markdown wiki with Obsidian-style features. Minimal bundle size, no heavy frameworks.

## Features

- **Obsidian Wiki Links**: Use `[[page name]]` syntax to link between pages
- **Clickable Hashtags**: `#tag` mentions are automatically linked to tag search
- **Full-Text Search**: Fast client-side search across titles, headings, and tags
- **Automatic Indexing**: Server periodically re-indexes content automatically
- **Custom Plugin Blocks**: Extensible plugin system for custom code blocks
- **Multiple Layouts**: Simple and two-column layouts with responsive design
- **Theme Toggle**: Solarized Dark and Light themes
- **Lightweight**: Vanilla TypeScript frontend, minimal dependencies
- **Fast**: Built with esbuild for optimal bundle size
- **Configurable**: Environment variables for all settings

## Quick Start

### Installation

```bash
npm install
```

### Build

```bash
npm run build
```

This will:
- Compile the backend TypeScript
- Bundle the frontend into a single minified JavaScript file
- Build the search index from all markdown files
- Copy assets to the `public` directory

### Run

```bash
npm start
```

The server will start on `http://localhost:3000` (or the port specified in `PORT` environment variable).

### Configuration

**Environment Variables:**

- `PORT` - Server port (default: 3000)
- `CONTENT_DIR` - Path to markdown files directory (default: `./content`)
- `INDEX_INTERVAL` - Automatic re-indexing interval in milliseconds (default: 300000 = 5 minutes, set to 0 to disable)

**Examples:**

```bash
# Run on custom port with different content directory
PORT=8080 CONTENT_DIR=/path/to/markdown npm start

# Re-index every 10 minutes
INDEX_INTERVAL=600000 npm start

# Disable automatic re-indexing
INDEX_INTERVAL=0 npm start
```

## Project Structure

```
mdnet/
├── src/
│   ├── backend/
│   │   └── server.ts          # Express server
│   └── frontend/
│       ├── index.html          # HTML template
│       ├── app.ts              # Main application logic
│       └── markdown-renderer.ts # Markdown rendering with plugins
├── content/                    # Markdown files
│   ├── index.md
│   ├── example.md
│   └── features.md
├── public/                     # Compiled frontend assets
├── dist/                       # Compiled backend
└── package.json
```

## Creating Content

Place markdown files (`.md`) in the `content` directory. The `index.md` file serves as the default landing page.

### Wiki Links

Link to other pages using double brackets:

```markdown
[[page-name]]
[[page-name|Custom Link Text]]
```

Examples:
- `[[example]]` - Links to example.md
- `[[example|See Example]]` - Links to example.md with custom text

### Custom Plugin Blocks

Create custom code blocks with plugin identifiers:

````markdown
```pluginname
Your content here
```
````

Plugin blocks are automatically detected and wrapped in special containers for custom rendering.

## Development

### Build Scripts

- `npm run build:backend` - Compile backend only
- `npm run build:frontend` - Bundle frontend only
- `npm run build` - Build both backend and frontend
- `npm run dev` - Build and start server
- `npm start` - Start the server (requires prior build)

### Bundle Size

- HTML: ~4 KB
- JavaScript bundle: ~148 KB (includes markdown-it library)
- Total page size: <160 KB

## API Endpoints

- `GET /api/files` - List all markdown files
- `GET /api/content` - Get default content (index.md)
- `GET /api/content/:filename` - Get specific file content

## Technical Stack

- **Backend**: Express.js, TypeScript, Node.js
- **Frontend**: Vanilla TypeScript, markdown-it
- **Build**: esbuild (frontend bundling), tsc (backend compilation)
- **Routing**: Hash-based client-side routing (#/page-name)

## Security

- Path traversal prevention for file access
- Public access (no authentication required)
- Static file serving with express.static

## License

ISC
