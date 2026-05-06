import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';

const app = express();
const PORT = process.env.PORT || 3000;
const CONTENT_DIR = process.env.CONTENT_DIR || path.join(__dirname, '../../content');
const INDEX_INTERVAL = parseInt(process.env.INDEX_INTERVAL || '300000'); // Default: 5 minutes

// Import the indexer
const indexerPath = path.join(__dirname, '../../build-index.js');
let buildIndex: () => void;

// Enable CORS for development
app.use(cors());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../../public')));

// Get list of all markdown files
app.get('/api/files', async (req: Request, res: Response) => {
  try {
    const files = await fs.readdir(CONTENT_DIR);
    const markdownFiles = files
      .filter(file => file.endsWith('.md'))
      .map(file => file.replace('.md', ''));
    res.json(markdownFiles);
  } catch (error) {
    console.error('Error reading content directory:', error);
    res.status(500).json({ error: 'Failed to read content directory' });
  }
});

// Get content of default file (index)
app.get('/api/content', async (req: Request, res: Response) => {
  try {
    const filename = 'index';
    const filepath = path.join(CONTENT_DIR, `${filename}.md`);
    const content = await fs.readFile(filepath, 'utf-8');
    res.json({ filename, content });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      res.status(404).json({ error: 'File not found' });
    } else {
      console.error('Error reading file:', error);
      res.status(500).json({ error: 'Failed to read file' });
    }
  }
});

// Get content of a specific markdown file
app.get('/api/content/:filename', async (req: Request, res: Response) => {
  try {
    const filename = req.params.filename;
    const filepath = path.join(CONTENT_DIR, `${filename}.md`);

    // Security check: prevent directory traversal
    const normalizedPath = path.normalize(filepath);
    if (!normalizedPath.startsWith(CONTENT_DIR)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const content = await fs.readFile(filepath, 'utf-8');
    res.json({ filename, content });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      res.status(404).json({ error: 'File not found' });
    } else {
      console.error('Error reading file:', error);
      res.status(500).json({ error: 'Failed to read file' });
    }
  }
});

// Serve index.html for all other GET requests (SPA routing)
app.use((req: Request, res: Response) => {
  if (req.method === 'GET') {
    res.sendFile(path.join(__dirname, '../../public/index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// Load and run indexer
try {
  const indexer = require(indexerPath);
  buildIndex = indexer.buildIndex;

  // Run indexer on startup
  console.log('Running initial indexing...');
  buildIndex();

  // Set up periodic indexing
  if (INDEX_INTERVAL > 0) {
    setInterval(() => {
      console.log('Running periodic indexing...');
      try {
        buildIndex();
      } catch (error) {
        console.error('Error during periodic indexing:', error);
      }
    }, INDEX_INTERVAL);
    console.log(`Periodic indexing enabled (every ${INDEX_INTERVAL / 1000}s)`);
  } else {
    console.log('Periodic indexing disabled');
  }
} catch (error) {
  console.error('Failed to load indexer:', error);
  console.log('Server will continue without automatic indexing');
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Content directory: ${CONTENT_DIR}`);
});
