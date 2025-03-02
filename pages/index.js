import Head from 'next/head';
import { useState, useEffect, useRef } from 'react';
import { saveAs } from 'file-saver';
import dynamic from 'next/dynamic';
import Sidebar from '../components/Sidebar';
import LoadingSpinner from '../components/LoadingSpinner';
import ResizableDetailsPanel from '../components/ResizeableDetailsPanel';
import FileUploadHandler from '../components/FileUploadHandler';
// import D3WebGLVisualizer from '../components/D3WebGLVisualizer';
import GraphVisualizer from '../components/GraphVisualizer';


export default function Home() {
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
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
  const [showStartOptions, setShowStartOptions] = useState(true);
  const [seedPaper, setSeedPaper] = useState('');
  const [maxPapers, setMaxPapers] = useState(20);
  const [maxCitationsPerPaper, setMaxCitationsPerPaper] = useState(3);
  const [isMobile, setIsMobile] = useState(false);
  const [graphStats, setGraphStats] = useState({
    nodeCount: 0,
    edgeCount: 0,
    paperCount: 0,
    authorCount: 0,
    cycleCount: 0
  });
  
  // Used for memory cleanup
  const abortControllerRef = useRef(null);

  // Effect to handle window size on client-side only
  useEffect(() => {
    setIsMobile(window.innerWidth < 640);
    
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Cleanup function for large graph processing
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Function to download current graph as JSON with optimized encoding
  const downloadGraph = () => {
    if (!graphData) return;
    
    try {
      // For very large graphs, use more compact JSON encoding
      const isLargeGraph = graphData.nodes.length > 1000;
      const jsonString = JSON.stringify(
        graphData, 
        null, 
        isLargeGraph ? 0 : 2 // Use compact encoding for large graphs
      );
      
      const blob = new Blob([jsonString], { type: 'application/json' });
      saveAs(blob, `citation-graph-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (error) {
      console.error('Error downloading graph:', error);
      alert('Failed to download graph: ' + error.message);
    }
  };

  // Optimized file upload handler for large files
  const handleFileUpload = (jsonData) => {
    try {
      setLoading(true);
      processGraphData(jsonData);
      setShowStartOptions(false);
    } catch (error) {
      console.error("Error processing graph data:", error);
      alert("Failed to process the graph data: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Function to generate graph with progress tracking and abort support
  const generateGraph = async () => {
    // Validate seed paper input
    if (!seedPaper || seedPaper.trim().length < 5) {
      alert('Please enter a valid paper title, DOI, or search term (at least 5 characters)');
      return;
    }
    
    // Clean up any previous aborted requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create a new abort controller
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    setLoading(true);
    setProgress(0);
    
    // Start progress simulation
    const progressInterval = simulateProgress();
    
    try {
      console.log(`Generating graph for: "${seedPaper}" with ${maxPapers} max papers and ${maxCitationsPerPaper} citations per paper`);
      
      const response = await fetch('/api/generate_graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedPaper: seedPaper.trim(),
          maxPapers,
          maxCitationsPerPaper
        }),
        signal // Add abort signal to the fetch request
      });
      
      clearInterval(progressInterval);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('API error details:', errorData);
        throw new Error(errorData.error || `Failed to generate graph (${response.status})`);
      }
      
      // For large responses, use streaming approach
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let jsonText = '';
      
      // Read the response stream in chunks
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        // Decode and append the chunk
        jsonText += decoder.decode(value, { stream: true });
        
        // Update progress for large responses
        setProgress(prev => Math.min(99, prev + 0.5));
      }
      
      // Final decode to ensure we get any remaining bytes
      jsonText += decoder.decode();
      
      // Parse the JSON data
      const data = JSON.parse(jsonText);
      setProgress(100);
      
      // Process the graph data
      processGraphData(data);
      setShowStartOptions(false);
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Graph generation cancelled');
      } else {
        console.error('Error generating graph:', error);
        alert('Failed to generate graph: ' + error.message);
      }
    } finally {
      clearInterval(progressInterval);
      setLoading(false);
      abortControllerRef.current = null;
    }
  };
  
  // Cancel graph generation
  const cancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setLoading(false);
    }
  };
  
  // Simulates progress for better UX
  const simulateProgress = () => {
    return setInterval(() => {
      setProgress(prev => {
        // Slowly approach 90% (the last 10% will be when data is actually received and processed)
        if (prev < 85) {
          const increment = (85 - prev) / 10;
          return prev + Math.max(0.5, increment);
        }
        return prev;
      });
    }, 200);
  };

  // Process graph data with improved memory efficiency for large graphs
  const processGraphData = (data) => {
    try {
      // Start processing
      console.time('processGraphData');
      
      // Create node lookup map with optimized approach for large graphs
      const nodeMap = new Map();
      const isLargeGraph = data.nodes.length > 1000;
      
      // Calculate graph statistics
      const stats = {
        nodeCount: data.nodes.length,
        edgeCount: data.edges.length,
        paperCount: 0,
        authorCount: 0,
        cycleCount: 0
      };
      
      // Process nodes in batches for large graphs
      const processBatch = (startIdx, endIdx) => {
        for (let i = startIdx; i < endIdx && i < data.nodes.length; i++) {
          const node = data.nodes[i];
          nodeMap.set(node.id, {
            ...node,
            // Ensure these fields exist with default values
            type: node.type || "unknown",
            title: node.title || node.name || node.id,
            year: node.year || null,
            citation_count: node.citation_count || 0,
          });
          
          // Count node types
          if (node.type === 'paper') {
            stats.paperCount++;
          } else if (node.type === 'author') {
            stats.authorCount++;
          }
        }
      };
      
      if (isLargeGraph) {
        // Process in batches for large graphs (1000 nodes per batch)
        const batchSize = 1000;
        for (let i = 0; i < data.nodes.length; i += batchSize) {
          processBatch(i, i + batchSize);
        }
      } else {
        // Process all nodes at once for smaller graphs
        processBatch(0, data.nodes.length);
      }
      
      setNodeById(nodeMap);
      setGraphData(data);
      
      // For large graphs, limit cycle detection to avoid performance issues
      if (data.edges && data.edges.length > 0) {
        // For very large graphs, limit the cycle detection
        let cyclesToFind = data.edges.length > 10000 ? 100 : -1;
        const foundCycles = findCycles(data.nodes, data.edges, cyclesToFind);
        setCycles(foundCycles);
        stats.cycleCount = foundCycles.length;
      }
      
      // Update statistics
      setGraphStats(stats);
      
      console.timeEnd('processGraphData');
      
    } catch (error) {
      console.error('Error processing graph data:', error);
      alert('Failed to process graph: ' + error.message);
    }
  };

  // Reset the application to show start options
  const resetToStart = () => {
    setGraphData(null);
    setSelectedNode(null);
    setNodeById(new Map());
    setHighlightedNodes(new Set());
    setCycles([]);
    setShowStartOptions(true);
    setGraphStats({
      nodeCount: 0,
      edgeCount: 0,
      paperCount: 0,
      authorCount: 0,
      cycleCount: 0
    });
  };

  // Algorithm to find citation cycles in the graph, with optimizations for large graphs
  const findCycles = (nodes, edges, maxCycles = -1) => {
    console.time('findCycles');
    
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
    
    // Function to find cycles using DFS with optimizations for large graphs
    const findCyclesDFS = () => {
      const cycles = [];
      const visited = new Set();
      const recStack = new Set();
      const path = [];
      
      const dfs = (nodeId) => {
        // Early termination if we found enough cycles
        if (maxCycles > 0 && cycles.length >= maxCycles) {
          return;
        }
        
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
          
          // Early termination if we found enough cycles
          if (maxCycles > 0 && cycles.length >= maxCycles) {
            break;
          }
        }
        
        path.pop();
        recStack.delete(nodeId);
      };
      
      // For large graphs, limit the starting nodes to improve performance
      const isLargeGraph = nodes.length > 1000;
      const startNodeIds = isLargeGraph 
        ? Object.keys(graph).slice(0, 500) // Limit to first 500 nodes for large graphs
        : Object.keys(graph);
      
      // Start DFS from each node
      for (const nodeId of startNodeIds) {
        if (!visited.has(nodeId)) {
          dfs(nodeId);
          
          // Early termination if we found enough cycles
          if (maxCycles > 0 && cycles.length >= maxCycles) {
            break;
          }
        }
      }
      
      return cycles;
    };
    
    const result = findCyclesDFS();
    console.timeEnd('findCycles');
    return result;
  };

  const handleNodeSelect = (node) => {
    setSelectedNode(node);
  };

  const handleFilterChange = (newFilters) => {
    setFilterOptions(newFilters);
    
    // Apply filters to highlight matching nodes
    applyFilters(newFilters);
  };

  // Optimized filter application for large graphs
  const applyFilters = (filters) => {
    if (!graphData) return;
    
    console.time('applyFilters');
    
    const highlighted = new Set();
    const isLargeGraph = graphData.nodes.length > 1000;
    
    // For large graphs, process nodes in batches to avoid UI freezing
    const processBatch = (startIdx, endIdx) => {
      for (let i = startIdx; i < endIdx && i < graphData.nodes.length; i++) {
        const node = graphData.nodes[i];
        
        // Skip if node doesn't match the node type filter
        if (filters.nodeType !== 'all' && node.type !== filters.nodeType) {
          continue;
        }
        
        // Check minimum year (for papers)
        if (filters.minYear && node.type === 'paper') {
          const year = parseInt(node.year);
          if (isNaN(year) || year < parseInt(filters.minYear)) {
            continue;
          }
        }
        
        // Check open access filter (for papers)
        if (filters.isOpenAccess && node.type === 'paper' && !node.is_open_access) {
          continue;
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
            continue;
          }
        }
        
        // Check author name (for authors or for papers by title search)
        if (filters.authorName && node.type === 'author') {
          const name = node.name || '';
          if (!name.toLowerCase().includes(filters.authorName.toLowerCase())) {
            continue;
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
            continue;
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
            continue;
          }
        }
        
        // If node passed all applicable filters, add to highlighted set
        highlighted.add(node.id);
      }
    };
    
    if (isLargeGraph) {
      // Process in batches of 1000 nodes for large graphs
      const batchSize = 1000;
      for (let i = 0; i < graphData.nodes.length; i += batchSize) {
        processBatch(i, i + batchSize);
      }
    } else {
      // Process all nodes at once for smaller graphs
      processBatch(0, graphData.nodes.length);
    }
    
    setHighlightedNodes(highlighted);
    console.timeEnd('applyFilters');
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
        <title>ResearchKG</title>
        <meta name="description" content="Interactive visualization of citation graphs" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      
      {/* Header with reset and download options */}
      {graphData && (
        <header style={{
          backgroundColor: "white",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          padding: "12px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <div style={{display: "flex", alignItems: "center"}}>
            <h1 style={{fontSize: "30px", fontWeight: "bold", color: "#1F2937", marginRight: "16px"}}>ResearchKG</h1>
            
            {/* Graph statistics */}
            <div style={{fontSize: "14px", color: "#6B7280"}}>
              {graphStats.nodeCount > 0 && (
                <span>
                  {graphStats.paperCount} papers, {graphStats.authorCount} authors, {graphStats.cycleCount} cycles
                </span>
              )}
            </div>
          </div>
          
          <div style={{display: "flex", gap: "16px"}}>
            <button
              onClick={downloadGraph}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 16px",
                backgroundColor: "#047857",
                color: "white",
                border: "none",
                borderRadius: "4px",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                fontSize: "14px",
                fontWeight: "500",
                cursor: "pointer"
              }}
            >
              <svg style={{marginRight: "8px", height: "20px", width: "20px"}} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download JSON
            </button>
            
            <button
              onClick={resetToStart}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 16px",
                backgroundColor: "white",
                color: "#4B5563",
                border: "1px solid #D1D5DB",
                borderRadius: "4px",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                fontSize: "14px",
                fontWeight: "500",
                cursor: "pointer"
              }}
            >
              <svg style={{marginRight: "8px", height: "20px", width: "20px"}} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Start Over
            </button>
          </div>
        </header>
      )}

      <div style={{
        display: "flex", 
        flex: 1,
        overflow: "hidden"
      }}>
        {(!graphData || showStartOptions) ? (
          <div style={{
            width: "100%", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center", 
            backgroundColor: "#F9FAFB"
          }}>
            <div style={{
              maxWidth: "1024px",
              width: "100%",
              padding: "32px 16px"
            }}>
              <h2 style={{
                fontSize: "28px",
                fontWeight: "800",
                textAlign: "center",
                color: "#111827",
                marginBottom: "32px"
              }}>
                ResearchKG
              </h2>
              
              <div style={{
                display: "flex",
                flexDirection: isMobile ? "column" : "row",
                gap: "32px",
                justifyContent: "center"
              }}>
                {/* Option 1: Generate New Graph */}
                <div style={{
                  backgroundColor: "white",
                  borderRadius: "8px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  overflow: "hidden",
                  flex: "1",
                  maxWidth: "450px"
                }}>
                  <div style={{padding: "20px"}}>
                    <h3 style={{
                      fontSize: "18px",
                      fontWeight: "500",
                      color: "#111827",
                      marginBottom: "8px"
                    }}>
                      Generate New Graph
                    </h3>
                    <div style={{
                      fontSize: "14px",
                      color: "#6B7280",
                      marginBottom: "8px"
                    }}>
                      <p>Create a citation network from a seed paper. Uses the Semantic Scholar API.</p>
                    </div>
                    
                    {loading ? (
                      <div style={{marginTop: "20px"}}>
                        <div style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "14px",
                          color: "#4B5563",
                          marginBottom: "8px"
                        }}>
                          <span>Generating graph...</span>
                          <span>{Math.round(progress)}%</span>
                        </div>
                        <div style={{
                          width: "100%",
                          backgroundColor: "#E5E7EB",
                          borderRadius: "9999px",
                          height: "10px",
                          overflow: "hidden"
                        }}>
                          <div 
                            style={{
                              backgroundColor: "#3B82F6",
                              height: "10px",
                              borderRadius: "9999px",
                              width: `${progress}%`,
                              transition: "width 300ms ease-out"
                            }}
                          ></div>
                        </div>
                        <p style={{
                          fontSize: "12px",
                          color: "#6B7280",
                          marginTop: "8px",
                          fontStyle: "italic"
                        }}>
                          Searching for papers and building citation connections...
                        </p>
                        <button
                          onClick={cancelGeneration}
                          style={{
                            marginTop: "16px",
                            width: "100%",
                            display: "flex",
                            justifyContent: "center",
                            padding: "8px",
                            backgroundColor: "#EF4444",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            fontWeight: "500",
                            cursor: "pointer"
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{marginTop: "20px", display: "flex", flexDirection: "column", gap: "16px"}}>
                        <div>
                          <label style={{
                            display: "block",
                            fontSize: "14px",
                            fontWeight: "500",
                            color: "#374151",
                            marginBottom: "4px"
                          }}>
                            Paper Title or DOI
                          </label>
                          <input
                            type="text"
                            value={seedPaper}
                            onChange={(e) => setSeedPaper(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "8px 12px",
                              border: "1px solid #D1D5DB",
                              borderRadius: "4px",
                              boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                            }}
                            placeholder="e.g., Attention Is All You Need"
                          />
                        </div>
                        
                        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px"}}>
                          <div>
                            <label style={{
                              display: "block",
                              fontSize: "14px",
                              fontWeight: "500",
                              color: "#374151",
                              marginBottom: "4px"
                            }}>
                              Max Papers
                            </label>
                            <input
                              type="number"
                              value={maxPapers}
                              onChange={(e) => setMaxPapers(parseInt(e.target.value) || 20)}
                              min="5"
                              max="5000" // Increased maximum
                              style={{
                                width: "100%",
                                padding: "8px 12px",
                                border: "1px solid #D1D5DB",
                                borderRadius: "4px",
                                boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                              }}
                            />
                          </div>
                          
                          <div>
                            <label style={{
                              display: "block",
                              fontSize: "14px",
                              fontWeight: "500",
                              color: "#374151",
                              marginBottom: "4px"
                            }}>
                              Citations Per Paper
                            </label>
                            <input
                              type="number"
                              value={maxCitationsPerPaper}
                              onChange={(e) => setMaxCitationsPerPaper(parseInt(e.target.value) || 3)}
                              min="1"
                              max="20" // Increased maximum
                              style={{
                                width: "100%",
                                padding: "8px 12px",
                                border: "1px solid #D1D5DB",
                                borderRadius: "4px",
                                boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
                              }}
                            />
                          </div>
                        </div>
                        
                        <button
                          onClick={generateGraph}
                          disabled={!seedPaper.trim()}
                          style={{
                            width: "100%",
                            display: "flex",
                            justifyContent: "center",
                            padding: "10px",
                            backgroundColor: !seedPaper.trim() ? "#93C5FD" : "#3B82F6",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            fontWeight: "500",
                            cursor: !seedPaper.trim() ? "not-allowed" : "pointer"
                          }}
                        >
                          Generate Graph
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Option 2: Upload Existing Graph */}
                <div style={{
                  backgroundColor: "white",
                  borderRadius: "8px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  overflow: "hidden",
                  flex: "1",
                  maxWidth: "450px"
                }}>
                  <div style={{padding: "20px"}}>
                    <h3 style={{
                      fontSize: "18px",
                      fontWeight: "500",
                      color: "#111827",
                      marginBottom: "8px"
                    }}>
                      Upload Existing Graph
                    </h3>
                    <div style={{
                      fontSize: "14px",
                      color: "#6B7280",
                      marginBottom: "16px"
                    }}>
                      <p>Upload a previously generated citation graph JSON file.</p>
                      <p style={{marginTop: "4px"}}>
                        <span style={{fontWeight: "500"}}>Optimized for large files:</span> Supports graphs with thousands of nodes and files up to 50MB.
                      </p>
                    </div>
                    <div style={{marginTop: "16px"}}>
                      {/* Replace standard file upload with optimized chunked uploader */}
                      <FileUploadHandler 
                        onFileLoaded={handleFileUpload} 
                        maxSizeMB={50}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Left sidebar for search and filters */}
            <Sidebar 
              onFileUpload={(jsonData) => handleFileUpload(jsonData)}
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
              // Add graph stats
              graphStats={graphStats}
            />
            
            {/* Main graph visualization area */}
            <div style={{
              display: "flex", 
              flex: 1,
              overflow: "hidden",
              position: "relative"
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
            
            {/* Right sidebar for details panel (conditionally rendered) */}
            {selectedNode && (
              <ResizableDetailsPanel 
                node={selectedNode} 
                nodeById={nodeById}
                graphData={graphData}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}