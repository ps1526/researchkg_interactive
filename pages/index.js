import Head from 'next/head';
import { useState, useEffect, useRef } from 'react';
import GraphVisualizer from '../components/GraphVisualizer';
import Sidebar from '../components/Sidebar';
import DetailsPanel from '../components/DetailsPanel';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Home() {
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeById, setNodeById] = useState(new Map());
  const [filterOptions, setFilterOptions] = useState({
    searchTerm: '',
    nodeType: 'all',
    minYear: '',
    authorName: '',
    fieldsOfStudy: '',
    isOpenAccess: false
  });
  const [highlightedNodes, setHighlightedNodes] = useState(new Set());
  const [showCycles, setShowCycles] = useState(false);
  const [cycles, setCycles] = useState([]);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target.result);
        processGraphData(jsonData);
      } catch (error) {
        console.error("Error parsing JSON:", error);
        alert("Failed to parse the JSON file. Please check the file format.");
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const processGraphData = (data) => {
    // Create node lookup map
    const nodeMap = new Map();
    data.nodes.forEach(node => {
      nodeMap.set(node.id, {
        ...node,
        // Ensure these fields exist with default values
        type: node.type || "unknown",
        title: node.title || node.name || node.id,
        year: node.year || null,
        citation_count: node.citation_count || 0,
      });
    });
    
    setNodeById(nodeMap);
    setGraphData(data);
    
    // Find cycles in the graph
    if (data.edges && data.edges.length > 0) {
      const foundCycles = findCycles(data.nodes, data.edges);
      setCycles(foundCycles);
    }
  };

  // Algorithm to find citation cycles in the graph
  const findCycles = (nodes, edges) => {
    // Create an adjacency list representation of the graph
    const graph = {};
    
    // Initialize empty arrays for each node
    nodes.forEach(node => {
      graph[node.id] = [];
    });
    
    // Add directed edges
    edges.forEach(edge => {
      if (edge.type === 'cites' && graph[edge.source]) {
        graph[edge.source].push(edge.target);
      }
    });
    
    // Function to find cycles using DFS
    const findCyclesDFS = () => {
      const cycles = [];
      const visited = new Set();
      const recStack = new Set();
      const path = [];
      
      const dfs = (nodeId) => {
        if (recStack.has(nodeId)) {
          // Found a cycle - extract it from the path
          const cycleStart = path.lastIndexOf(nodeId);
          if (cycleStart !== -1) {
            const cycle = path.slice(cycleStart).concat(nodeId);
            cycles.push(cycle);
          }
          return;
        }
        
        if (visited.has(nodeId)) return;
        
        visited.add(nodeId);
        recStack.add(nodeId);
        path.push(nodeId);
        
        const neighbors = graph[nodeId] || [];
        for (const neighbor of neighbors) {
          dfs(neighbor);
        }
        
        path.pop();
        recStack.delete(nodeId);
      };
      
      // Start DFS from each node
      for (const nodeId in graph) {
        if (!visited.has(nodeId)) {
          dfs(nodeId);
        }
      }
      
      return cycles;
    };
    
    return findCyclesDFS();
  };

  const handleNodeSelect = (node) => {
    setSelectedNode(node);
  };

  const handleFilterChange = (newFilters) => {
    setFilterOptions(newFilters);
    
    // Apply filters to highlight matching nodes
    applyFilters(newFilters);
  };

  const applyFilters = (filters) => {
    if (!graphData) return;
    
    const highlighted = new Set();
    
    graphData.nodes.forEach(node => {
      // Skip if node doesn't match the node type filter
      if (filters.nodeType !== 'all' && node.type !== filters.nodeType) {
        return;
      }
      
      // Check minimum year (for papers)
      if (filters.minYear && node.type === 'paper') {
        const year = parseInt(node.year);
        if (isNaN(year) || year < parseInt(filters.minYear)) {
          return;
        }
      }
      
      // Check open access filter (for papers)
      if (filters.isOpenAccess && node.type === 'paper' && !node.is_open_access) {
        return;
      }
      
      // Check fields of study (for papers)
      if (filters.fieldsOfStudy && node.type === 'paper' && node.fields_of_study) {
        let fields = node.fields_of_study;
        if (typeof fields === 'string') {
          try {
            fields = JSON.parse(fields);
          } catch (e) {
            fields = [fields];
          }
        }
        
        const searchFields = filters.fieldsOfStudy.toLowerCase().split(',').map(f => f.trim());
        const matchesField = searchFields.some(searchField => 
          Array.isArray(fields) && fields.some(field => 
            field.toLowerCase().includes(searchField)
          )
        );
        
        if (!matchesField) {
          return;
        }
      }
      
      // Check author name (for authors or for papers by title search)
      if (filters.authorName && node.type === 'author') {
        const name = node.name || '';
        if (!name.toLowerCase().includes(filters.authorName.toLowerCase())) {
          return;
        }
        highlighted.add(node.id);
      } else if (filters.authorName && node.type === 'paper') {
        // For papers, we need to check if any of the authors match
        const authors = node.authors;
        let authorMatch = false;
        
        if (authors) {
          let authorList = authors;
          if (typeof authors === 'string') {
            try {
              authorList = JSON.parse(authors);
            } catch (e) {
              authorList = [authors];
            }
          }
          
          if (Array.isArray(authorList)) {
            authorMatch = authorList.some(author => {
              const authorName = typeof author === 'object' ? (author.name || '') : author;
              return authorName.toLowerCase().includes(filters.authorName.toLowerCase());
            });
          }
        }
        
        if (!authorMatch) {
          return;
        }
      }
      
      // Check general search term (title, abstract, venue)
      if (filters.searchTerm) {
        const searchTerm = filters.searchTerm.toLowerCase();
        const title = (node.title || node.name || '').toLowerCase();
        const abstract = (node.abstract || '').toLowerCase();
        const venue = (node.venue || '').toLowerCase();
        
        if (title.includes(searchTerm) || abstract.includes(searchTerm) || venue.includes(searchTerm)) {
          highlighted.add(node.id);
        } else {
          return;
        }
      }
      
      // If node passed all applicable filters, add to highlighted set
      highlighted.add(node.id);
    });
    
    setHighlightedNodes(highlighted);
  };

  const toggleCycles = () => {
    setShowCycles(!showCycles);
  };

  const resetView = () => {
    setSelectedNode(null);
    setHighlightedNodes(new Set());
    setFilterOptions({
      searchTerm: '',
      nodeType: 'all',
      minYear: '',
      authorName: '',
      fieldsOfStudy: '',
      isOpenAccess: false
    });
    setShowCycles(false);
  };

  return (
    <div style={{
      display: "flex", 
      flexDirection: "column",
      height: "100vh"
    }}>
      <Head>
        <title>Citation Graph Visualizer</title>
        <meta name="description" content="Interactive visualization of citation graphs" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
  
      <div style={{
        display: "flex", 
        flex: 1,
        overflow: "hidden"
      }}>
        <Sidebar 
          onFileUpload={handleFileUpload}
          graphData={graphData}
          nodeById={nodeById}
          selectedNode={selectedNode}
          onNodeSelect={handleNodeSelect}
          filterOptions={filterOptions}
          onFilterChange={handleFilterChange}
          onToggleCycles={toggleCycles}
          showCycles={showCycles}
          onReset={resetView}
          cycleCount={cycles.length}
        />
        
        <div style={{
          display: "flex", 
          flexDirection: "column", 
          flex: 1,
          overflow: "hidden"
        }}>
          <div style={{
            position: "relative", 
            flex: 1,
            minHeight: "500px"
          }}>
            {loading && <LoadingSpinner />}
            
            {graphData && (
              <GraphVisualizer 
                graphData={graphData}
                selectedNode={selectedNode}
                onNodeSelect={handleNodeSelect}
                highlightedNodes={highlightedNodes}
                showCycles={showCycles}
                cycles={cycles}
              />
            )}
          </div>
          
          {selectedNode && (
            <DetailsPanel 
              node={selectedNode} 
              nodeById={nodeById}
              graphData={graphData}
            />
          )}
        </div>
      </div>
    </div>
  );
}