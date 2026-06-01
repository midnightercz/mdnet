// Type definitions for the source map graph

export type NodeType = 'page' | 'tag';

export interface MapNode {
  id: string;              // Unique identifier (page filename or tag name)
  type: NodeType;          // 'page' or 'tag'
  label: string;           // Display label
  isCurrentPage: boolean;  // Whether this is the active page
  connectionCount: number; // Number of connections (for sizing)

  // D3 force simulation properties (added by D3)
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;  // Fixed position (for current page)
  fy?: number | null;  // Fixed position (for current page)

  // Metadata for tooltips
  metadata?: {
    filename?: string;     // For pages
    tagCount?: number;     // For pages: how many tags
    linkCount?: number;    // For pages: how many outgoing links
    pageCount?: number;    // For tags: how many pages use this tag
  };
}

export interface MapLink {
  source: string | MapNode;  // Source node ID (D3 will replace with node object)
  target: string | MapNode;  // Target node ID (D3 will replace with node object)
  type: 'page-tag' | 'page-page';  // Type of connection
}

export interface GraphData {
  nodes: MapNode[];
  links: MapLink[];
}

export interface SourceMapOptions {
  sourceName: string;
  currentPageFilename: string;
  searchIndex: any[];  // SearchIndexItem[] from app.ts
  linkDepth: number;   // 0-3, how many hops to show
}
