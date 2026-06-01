import * as d3 from 'd3';
import { MapNode, MapLink, GraphData, SourceMapOptions } from './source-map-types';

// DOM elements (initialized when modal opens)
let modalElement: HTMLElement;
let graphContainer: HTMLElement;
let closeButton: HTMLElement;
let depthSlider: HTMLInputElement;
let depthLabel: HTMLElement;
let loadingElement: HTMLElement;

// Graph state
let simulation: d3.Simulation<MapNode, MapLink> | null = null;
let svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
let currentOptions: SourceMapOptions | null = null;
let allGraphData: GraphData | null = null;

// Helper function to get CSS variable value
function getCSSVar(varName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

// Initialize DOM references
function initializeDOMReferences() {
  modalElement = document.getElementById('source-map-modal')!;
  graphContainer = document.getElementById('source-map-graph')!;
  closeButton = document.getElementById('close-source-map')!;
  depthSlider = document.getElementById('map-depth-slider')! as HTMLInputElement;
  depthLabel = document.getElementById('map-depth-label')!;
  loadingElement = document.getElementById('source-map-loading')!;
}

// Build graph data from search index
function buildGraphData(options: SourceMapOptions): GraphData {
  const { sourceName, currentPageFilename, searchIndex } = options;

  // Filter to current source
  const sourcePages = searchIndex.filter((item: any) => item._source === sourceName);

  const nodes: MapNode[] = [];
  const links: MapLink[] = [];
  const nodeMap = new Map<string, MapNode>();
  const tagSet = new Set<string>();

  // Create page nodes
  for (const page of sourcePages) {
    const isCurrentPage = page.filename === currentPageFilename;

    const node: MapNode = {
      id: page.filename,
      type: 'page',
      label: page.title || page.filename,
      isCurrentPage,
      connectionCount: 0,
      metadata: {
        filename: page.filename,
        tagCount: page.tags?.length || 0,
        linkCount: page.links?.length || 0
      }
    };

    nodes.push(node);
    nodeMap.set(page.filename, node);

    // Collect tags
    if (page.tags) {
      page.tags.forEach((tag: string) => tagSet.add(tag));
    }
  }

  // Create tag nodes
  for (const tag of tagSet) {
    const pagesWithTag = sourcePages.filter((p: any) => p.tags?.includes(tag));

    const node: MapNode = {
      id: `tag:${tag}`,
      type: 'tag',
      label: `#${tag}`,
      isCurrentPage: false,
      connectionCount: 0,
      metadata: {
        pageCount: pagesWithTag.length
      }
    };

    nodes.push(node);
    nodeMap.set(`tag:${tag}`, node);
  }

  // Create links: page -> tag
  for (const page of sourcePages) {
    if (page.tags) {
      for (const tag of page.tags) {
        links.push({
          source: page.filename,
          target: `tag:${tag}`,
          type: 'page-tag'
        });

        // Increment connection counts
        const pageNode = nodeMap.get(page.filename);
        const tagNode = nodeMap.get(`tag:${tag}`);
        if (pageNode) pageNode.connectionCount++;
        if (tagNode) tagNode.connectionCount++;
      }
    }
  }

  // Create links: page -> page
  for (const page of sourcePages) {
    if (page.links) {
      for (const linkedPageName of page.links) {
        // Check if target page exists in this source
        if (nodeMap.has(linkedPageName) && linkedPageName !== page.filename) {
          links.push({
            source: page.filename,
            target: linkedPageName,
            type: 'page-page'
          });

          // Increment connection counts
          const sourceNode = nodeMap.get(page.filename);
          const targetNode = nodeMap.get(linkedPageName);
          if (sourceNode) sourceNode.connectionCount++;
          if (targetNode) targetNode.connectionCount++;
        }
      }
    }
  }

  return { nodes, links };
}

// Filter graph data based on depth from current page
function filterGraphByDepth(graphData: GraphData, currentPageFilename: string, depth: number): GraphData {
  if (depth === 3) {
    // Show everything
    return graphData;
  }

  const visibleNodes = new Set<string>();
  const visibleLinks: MapLink[] = [];

  // Always show current page
  visibleNodes.add(currentPageFilename);

  // Find nodes at each depth level
  const nodesToExplore = [currentPageFilename];
  const exploredNodes = new Set<string>();

  for (let currentDepth = 0; currentDepth <= depth; currentDepth++) {
    const nextLevel: string[] = [];

    for (const nodeId of nodesToExplore) {
      if (exploredNodes.has(nodeId)) continue;
      exploredNodes.add(nodeId);
      visibleNodes.add(nodeId);

      // Find connected nodes
      for (const link of graphData.links) {
        const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
        const targetId = typeof link.target === 'string' ? link.target : link.target.id;

        if (sourceId === nodeId) {
          // Add target to visible nodes
          visibleNodes.add(targetId);

          if (currentDepth < depth) {
            nextLevel.push(targetId);
          }
          visibleLinks.push(link);
        }

        // For page-tag links, also show reverse direction (tag -> page at depth 0 if page has the tag)
        if (targetId === nodeId && link.type === 'page-tag') {
          visibleNodes.add(sourceId);
          if (!visibleLinks.includes(link)) {
            visibleLinks.push(link);
          }
        }
      }
    }

    nodesToExplore.length = 0;
    nodesToExplore.push(...nextLevel);
  }

  // Filter nodes and links
  const filteredNodes = graphData.nodes.filter(node => visibleNodes.has(node.id));

  // Ensure all links reference nodes that are in the filtered set
  const validLinks = visibleLinks.filter(link => {
    const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
    const targetId = typeof link.target === 'string' ? link.target : link.target.id;
    return visibleNodes.has(sourceId) && visibleNodes.has(targetId);
  });

  return {
    nodes: filteredNodes,
    links: validLinks
  };
}

// Render the graph using D3
function renderGraph(graphData: GraphData, options: SourceMapOptions) {
  const { currentPageFilename } = options;

  // Clear existing graph
  graphContainer.innerHTML = '';

  if (simulation) {
    simulation.stop();
  }

  // Get container dimensions
  const width = graphContainer.clientWidth;
  const height = graphContainer.clientHeight;

  // Create SVG
  const svgElement = d3.select(graphContainer)
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  svg = svgElement;

  // Create zoom behavior
  const g = svgElement.append('g');

  const zoom = d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
    });

  svgElement.call(zoom);

  // Create arrow marker for directed edges
  svgElement.append('defs').append('marker')
    .attr('id', 'arrowhead')
    .attr('viewBox', '-0 -5 10 10')
    .attr('refX', 20)
    .attr('refY', 0)
    .attr('orient', 'auto')
    .attr('markerWidth', 8)
    .attr('markerHeight', 8)
    .append('svg:path')
    .attr('d', 'M 0,-5 L 10,0 L 0,5')
    .attr('class', 'arrowhead');

  // Create force simulation
  simulation = d3.forceSimulation<MapNode>(graphData.nodes)
    .force('link', d3.forceLink<MapNode, MapLink>(graphData.links)
      .id(d => d.id)
      .distance(150))
    .force('charge', d3.forceManyBody().strength(-500))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(40));

  // Pin current page to center
  const currentPageNode = graphData.nodes.find(n => n.id === currentPageFilename);
  if (currentPageNode) {
    currentPageNode.fx = width / 2;
    currentPageNode.fy = height / 2;
  }

  // Create links
  const link = g.append('g')
    .selectAll('line')
    .data(graphData.links)
    .enter()
    .append('line')
    .attr('class', 'map-link')
    .attr('stroke-width', 1.5)
    .attr('marker-end', (d) => d.type === 'page-page' ? 'url(#arrowhead)' : null);

  // Create node groups
  const node = g.append('g')
    .selectAll('g')
    .data(graphData.nodes)
    .enter()
    .append('g')
    .attr('class', d => d.isCurrentPage ? 'map-node current-page-node' : 'map-node')
    .call(d3.drag<SVGGElement, MapNode>()
      .on('start', dragStarted)
      .on('drag', dragged)
      .on('end', dragEnded) as any);

  // Add shapes for nodes
  node.each(function(d) {
    const nodeGroup = d3.select(this);
    const radius = getNodeRadius(d);

    if (d.type === 'page') {
      // Circle for pages
      nodeGroup.append('circle')
        .attr('r', radius)
        .attr('class', d.isCurrentPage ? 'node-page-current' : 'node-page')
        .attr('stroke-width', d.isCurrentPage ? 4 : 2);

      // Add label above page circle
      nodeGroup.append('text')
        .text(d.label.length > 20 ? d.label.substring(0, 18) + '...' : d.label)
        .attr('text-anchor', 'middle')
        .attr('dy', -radius - 8)
        .attr('font-size', '12px')
        .attr('class', 'node-label')
        .attr('pointer-events', 'none');
    } else {
      // Square for tags
      const size = radius * 2.5;
      nodeGroup.append('rect')
        .attr('x', -size / 2)
        .attr('y', -size / 2)
        .attr('width', size)
        .attr('height', size)
        .attr('class', 'node-tag')
        .attr('stroke-width', 2);

      // Add "#" symbol inside tag square
      nodeGroup.append('text')
        .text('#')
        .attr('text-anchor', 'middle')
        .attr('dy', 6)
        .attr('font-size', '18px')
        .attr('class', 'node-tag-text')
        .attr('pointer-events', 'none');

      // Add tag label above square (without # prefix since it's in the square)
      const labelText = d.label.startsWith('#') ? d.label.substring(1) : d.label;
      nodeGroup.append('text')
        .text(labelText.length > 20 ? labelText.substring(0, 18) + '...' : labelText)
        .attr('text-anchor', 'middle')
        .attr('dy', -size - 8)
        .attr('font-size', '12px')
        .attr('class', 'node-label')
        .attr('pointer-events', 'none');
    }
  });

  // Add click handlers
  node.on('click', (event, d) => {
    event.stopPropagation();
    handleNodeClick(d);
  });

  // Add hover tooltips
  node.append('title')
    .text(d => getNodeTooltip(d));

  // Update positions on simulation tick
  simulation.on('tick', () => {
    link
      .attr('x1', d => (d.source as MapNode).x!)
      .attr('y1', d => (d.source as MapNode).y!)
      .attr('x2', d => (d.target as MapNode).x!)
      .attr('y2', d => (d.target as MapNode).y!);

    node.attr('transform', d => `translate(${d.x},${d.y})`);
  });

  // Auto-fit view after layout stabilizes
  simulation.on('end', () => {
    autoFitView();
  });

  // Drag functions
  function dragStarted(event: any, d: MapNode) {
    if (!event.active) simulation!.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event: any, d: MapNode) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragEnded(event: any, d: MapNode) {
    if (!event.active) simulation!.alphaTarget(0);
    // Keep current page fixed, unfix others
    if (!d.isCurrentPage) {
      d.fx = null;
      d.fy = null;
    }
  }

  // Auto-fit view to show all nodes
  function autoFitView() {
    if (!svg || graphData.nodes.length === 0) return;

    const bounds = {
      minX: d3.min(graphData.nodes, d => (d.x || 0) - getNodeRadius(d)) || 0,
      maxX: d3.max(graphData.nodes, d => (d.x || 0) + getNodeRadius(d)) || width,
      minY: d3.min(graphData.nodes, d => (d.y || 0) - getNodeRadius(d)) || 0,
      maxY: d3.max(graphData.nodes, d => (d.y || 0) + getNodeRadius(d)) || height
    };

    const boundsWidth = bounds.maxX - bounds.minX;
    const boundsHeight = bounds.maxY - bounds.minY;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    const scale = 0.9 / Math.max(boundsWidth / width, boundsHeight / height);
    const translate = [width / 2 - scale * centerX, height / 2 - scale * centerY];

    svg.transition()
      .duration(750)
      .call(
        zoom.transform as any,
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
      );
  }
}

// Get node radius based on connection count
function getNodeRadius(node: MapNode): number {
  // Current page is always larger
  if (node.isCurrentPage) {
    return 30;
  }

  const baseRadius = 10;
  const maxRadius = 25;
  const scaleFactor = Math.min(node.connectionCount / 5, 1);
  return baseRadius + (maxRadius - baseRadius) * scaleFactor;
}

// Get tooltip text for node
function getNodeTooltip(node: MapNode): string {
  if (node.type === 'page') {
    const parts = [
      node.label,
      `Links: ${node.metadata?.linkCount || 0}`,
      `Tags: ${node.metadata?.tagCount || 0}`
    ];
    return parts.join('\n');
  } else {
    return `${node.label}\nPages: ${node.metadata?.pageCount || 0}`;
  }
}

// Handle node click
function handleNodeClick(node: MapNode) {
  if (node.type === 'page') {
    // Navigate to page
    const sourceName = currentOptions?.sourceName;
    if (sourceName) {
      closeSourceMap();
      // Use setTimeout to ensure navigation happens after modal closes
      setTimeout(() => {
        window.location.hash = `#/${encodeURIComponent(sourceName)}/${encodeURIComponent(node.id)}`;
      }, 50);
    }
  } else {
    // Open search with tag
    closeSourceMap();
    const tag = node.label.replace('#', '');
    const searchToggle = document.getElementById('search-toggle');
    const searchInput = document.getElementById('search-input') as HTMLInputElement;

    if (searchToggle && searchInput) {
      setTimeout(() => {
        searchToggle.click();
        setTimeout(() => {
          searchInput.value = `#${tag}`;
          searchInput.dispatchEvent(new Event('input'));
        }, 100);
      }, 50);
    }
  }
}

// Handle depth slider change
function handleDepthChange() {
  if (!currentOptions || !allGraphData) return;

  const depth = parseInt(depthSlider.value);
  depthLabel.textContent = depth.toString();

  // Filter and re-render graph
  const filteredData = filterGraphByDepth(allGraphData, currentOptions.currentPageFilename, depth);
  renderGraph(filteredData, currentOptions);
}

// Close source map modal
function closeSourceMap() {
  modalElement.classList.remove('active');
  if (simulation) {
    simulation.stop();
    simulation = null;
  }
  svg = null;
  currentOptions = null;
  allGraphData = null;
}

// Main API: Open source map
export function openSourceMap(sourceName: string, currentPageFilename: string, searchIndex: any[]) {
  // Initialize DOM if needed
  if (!modalElement) {
    initializeDOMReferences();

    // Set up event listeners
    closeButton.addEventListener('click', closeSourceMap);
    modalElement.addEventListener('click', (e) => {
      if (e.target === modalElement) closeSourceMap();
    });
    depthSlider.addEventListener('input', handleDepthChange);

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalElement.classList.contains('active')) {
        closeSourceMap();
      }
    });
  }

  // Show loading
  loadingElement.style.display = 'flex';
  graphContainer.style.display = 'none';
  modalElement.classList.add('active');

  // Build graph data
  const options: SourceMapOptions = {
    sourceName,
    currentPageFilename,
    searchIndex,
    linkDepth: parseInt(depthSlider.value) || 1
  };

  currentOptions = options;

  // Use setTimeout to allow loading screen to render
  setTimeout(() => {
    try {
      allGraphData = buildGraphData(options);
      const filteredData = filterGraphByDepth(allGraphData, currentPageFilename, options.linkDepth);

      // Hide loading, show graph
      loadingElement.style.display = 'none';
      graphContainer.style.display = 'block';

      renderGraph(filteredData, options);
    } catch (error) {
      console.error('Error rendering source map:', error);
      closeSourceMap();
      alert('Failed to render source map. See console for details.');
    }
  }, 100);
}
