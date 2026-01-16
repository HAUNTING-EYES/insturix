/**
 * Version Graph - Relationship tracking between versions
 * 
 * CRITICAL: This graph can ONLY reference nodes that exist in the VersionTree.
 * It cannot create nodes independently - all nodes must be created in the tree first.
 * 
 * Think of it as:
 * - Tree = existence (versions live there)
 * - Graph = meaning (relationships between versions)
 */

import { VersionTree, VersionNode } from './VersionTree';

export type EdgeType = 'parent' | 'merge' | 'branch' | 'influence';

export interface VersionEdge {
  from: string;
  to: string;
  type: EdgeType;
  metadata?: Record<string, any>;
  createdAt: Date;
}

/**
 * Version Graph - Graph structure for version relationships
 * 
 * IMPORTANT: This graph cannot create nodes independently.
 * All nodes must exist in the tree first.
 */
export class VersionGraph {
  private tree: VersionTree;
  private edges: Map<string, VersionEdge[]> = new Map();
  private reverseEdges: Map<string, VersionEdge[]> = new Map(); // For reverse lookups

  constructor(tree: VersionTree) {
    this.tree = tree;
  }

  /**
   * Add an edge between two versions
   * CRITICAL: Both nodes must exist in the tree
   */
  addEdge(edge: Omit<VersionEdge, 'createdAt'>): void {
    // Validate both nodes exist in tree
    if (!this.tree.hasVersion(edge.from)) {
      throw new Error(`Cannot add edge: node ${edge.from} does not exist in tree`);
    }
    if (!this.tree.hasVersion(edge.to)) {
      throw new Error(`Cannot add edge: node ${edge.to} does not exist in tree`);
    }

    const fullEdge: VersionEdge = {
      ...edge,
      createdAt: new Date(),
    };

    // Add to forward edges
    const forwardEdges = this.edges.get(edge.from) || [];
    forwardEdges.push(fullEdge);
    this.edges.set(edge.from, forwardEdges);

    // Add to reverse edges
    const reverseEdges = this.reverseEdges.get(edge.to) || [];
    reverseEdges.push(fullEdge);
    this.reverseEdges.set(edge.to, reverseEdges);
  }

  /**
   * Get outgoing edges from a version
   */
  getOutgoingEdges(versionId: string): VersionEdge[] {
    return [...(this.edges.get(versionId) || [])];
  }

  /**
   * Get incoming edges to a version
   */
  getIncomingEdges(versionId: string): VersionEdge[] {
    return [...(this.reverseEdges.get(versionId) || [])];
  }

  /**
   * Get all edges of a specific type from a version
   */
  getEdgesByType(versionId: string, type: EdgeType): VersionEdge[] {
    return this.getOutgoingEdges(versionId).filter(e => e.type === type);
  }

  /**
   * Get neighbor versions (connected by edges)
   */
  getNeighbors(versionId: string): VersionNode[] {
    const neighborIds = new Set<string>();
    
    // Add outgoing neighbors
    const outgoing = this.edges.get(versionId) || [];
    for (const edge of outgoing) {
      neighborIds.add(edge.to);
    }
    
    // Add incoming neighbors
    const incoming = this.reverseEdges.get(versionId) || [];
    for (const edge of incoming) {
      neighborIds.add(edge.from);
    }
    
    return Array.from(neighborIds)
      .map(id => this.tree.getVersion(id))
      .filter(Boolean) as VersionNode[];
  }

  /**
   * Find shortest path between two versions using BFS
   */
  findPath(from: string, to: string): VersionNode[] {
    if (from === to) {
      const node = this.tree.getVersion(from);
      return node ? [node] : [];
    }

    const visited = new Set<string>();
    const queue: { id: string; path: string[] }[] = [{ id: from, path: [from] }];
    visited.add(from);

    while (queue.length > 0) {
      const { id, path } = queue.shift()!;

      // Get all neighbors (via edges and tree structure)
      const neighbors = new Set<string>();
      
      // Graph edges
      const outgoing = this.edges.get(id) || [];
      const incoming = this.reverseEdges.get(id) || [];
      for (const edge of [...outgoing, ...incoming]) {
        neighbors.add(edge.from === id ? edge.to : edge.from);
      }
      
      // Tree edges (parent/children)
      const node = this.tree.getVersion(id);
      if (node) {
        if (node.parentVersionId) neighbors.add(node.parentVersionId);
        for (const childId of node.childrenVersionIds) {
          neighbors.add(childId);
        }
      }

      for (const neighborId of neighbors) {
        if (neighborId === to) {
          return [...path, neighborId].map(id => this.tree.getVersion(id)).filter(Boolean) as VersionNode[];
        }
        
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push({ id: neighborId, path: [...path, neighborId] });
        }
      }
    }

    return []; // No path found
  }

  /**
   * Get connected components (groups of connected versions)
   */
  getConnectedComponents(): VersionNode[][] {
    const visited = new Set<string>();
    const components: VersionNode[][] = [];
    
    for (const node of this.tree.getAllVersions()) {
      if (visited.has(node.versionId)) continue;
      
      // BFS to find all connected nodes
      const component: VersionNode[] = [];
      const queue = [node.versionId];
      
      while (queue.length > 0) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        
        const currentNode = this.tree.getVersion(id);
        if (currentNode) {
          component.push(currentNode);
        }
        
        // Add neighbors
        const neighbors = this.getNeighbors(id);
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor.versionId)) {
            queue.push(neighbor.versionId);
          }
        }
        
        // Also traverse tree structure
        if (currentNode) {
          if (currentNode.parentVersionId && !visited.has(currentNode.parentVersionId)) {
            queue.push(currentNode.parentVersionId);
          }
          for (const childId of currentNode.childrenVersionIds) {
            if (!visited.has(childId)) {
              queue.push(childId);
            }
          }
        }
      }
      
      if (component.length > 0) {
        components.push(component);
      }
    }
    
    return components;
  }

  /**
   * Topological sort of versions
   */
  topologicalSort(): VersionNode[] {
    const visited = new Set<string>();
    const result: VersionNode[] = [];
    
    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      
      // Visit dependencies first (parents, merge sources)
      const node = this.tree.getVersion(id);
      if (node && node.parentVersionId) {
        visit(node.parentVersionId);
      }
      
      // Visit merge sources
      const incomingMerges = this.getIncomingEdges(id).filter(e => e.type === 'merge');
      for (const edge of incomingMerges) {
        visit(edge.from);
      }
      
      const nodeObj = this.tree.getVersion(id);
      if (nodeObj) {
        result.push(nodeObj);
      }
    };
    
    // Start from all leaf nodes
    for (const node of this.tree.getAllVersions()) {
      if (node.childrenVersionIds.length === 0) {
        visit(node.versionId);
      }
    }
    
    // Also visit any unvisited nodes
    for (const node of this.tree.getAllVersions()) {
      if (!visited.has(node.versionId)) {
        visit(node.versionId);
      }
    }
    
    return result;
  }

  /**
   * Trace influence - which versions influenced this one
   */
  traceInfluence(versionId: string): VersionNode[] {
    const influenced = new Set<string>();
    const queue = [versionId];
    
    while (queue.length > 0) {
      const id = queue.shift()!;
      
      // Get incoming influence and merge edges
      const incoming = this.getIncomingEdges(id);
      for (const edge of incoming) {
        if ((edge.type === 'influence' || edge.type === 'merge') && !influenced.has(edge.from)) {
          influenced.add(edge.from);
          queue.push(edge.from);
        }
      }
      
      // Also trace parent
      const node = this.tree.getVersion(id);
      if (node && node.parentVersionId && !influenced.has(node.parentVersionId)) {
        influenced.add(node.parentVersionId);
        queue.push(node.parentVersionId);
      }
    }
    
    return Array.from(influenced)
      .map(id => this.tree.getVersion(id))
      .filter(Boolean) as VersionNode[];
  }

  /**
   * Get all edges
   */
  getAllEdges(): VersionEdge[] {
    const allEdges: VersionEdge[] = [];
    for (const edges of this.edges.values()) {
      allEdges.push(...edges);
    }
    return allEdges;
  }

  /**
   * Remove edges for a version (use with caution)
   */
  removeEdgesFor(versionId: string): void {
    this.edges.delete(versionId);
    this.reverseEdges.delete(versionId);
    
    // Also remove from other nodes' edge lists
    for (const [id, edges] of this.edges) {
      this.edges.set(id, edges.filter(e => e.to !== versionId));
    }
    for (const [id, edges] of this.reverseEdges) {
      this.reverseEdges.set(id, edges.filter(e => e.from !== versionId));
    }
  }

  /**
   * Serialize graph to JSON for persistence
   */
  toJSON(): { edges: VersionEdge[] } {
    return {
      edges: this.getAllEdges(),
    };
  }

  /**
   * Load edges from JSON
   */
  loadEdges(edges: VersionEdge[]): void {
    for (const edge of edges) {
      try {
        this.addEdge({
          from: edge.from,
          to: edge.to,
          type: edge.type,
          metadata: edge.metadata,
        });
      } catch {
        // Skip edges that reference non-existent nodes
      }
    }
  }
}

export default VersionGraph;
