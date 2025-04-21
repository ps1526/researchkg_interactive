import Head from 'next/head';
import { useState, useEffect, useRef } from 'react';
import { saveAs } from 'file-saver';
import dynamic from 'next/dynamic';
import Sidebar from '../components/Sidebar';
import LoadingSpinner from '../components/LoadingSpinner';
import ResizableDetailsPanel from '../components/ResizeableDetailsPanel';
import FileUploadHandler from '../components/FileUploadHandler';
import GraphVisualizer from '../components/GraphVisualizer';
import ChatInterface from '../components/ChatInterface';
import AuthModal from '../components/AuthModal';
import SavedGraphsList from '../components/SavedGraphsList';
import SaveGraphDialog from '../components/SaveGraphDialog';
import BackendStatusCheck from '../components/BackendStatusCheck';
import { useAuth } from '../components/AuthProvider';


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
  
  // Chat interface state
  const [showChatInterface, setShowChatInterface] = useState(false);
  
  // Auth state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { user, logout, authToken, refreshToken } = useAuth();
  
  // Job tracking state
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [pollInterval, setPollInterval] = useState(null);
  
  // Saved graphs state
  const [showSavedGraphs, setShowSavedGraphs] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveGraphName, setSaveGraphName] = useState('');
  const [savedGraphs, setSavedGraphs] = useState([]);
  const [notification, setNotification] = useState(null);
  
  // Used for memory cleanup
  const abortControllerRef = useRef(null);

  // Add this state variable near the other state variables
  const [accentedNode, setAccentedNode] = useState(null);

  // Reference for the dropdown
  const savedGraphsDropdownRef = useRef(null);

  // Check if chat is available
  const isChatAvailable = graphData && 
    graphData.nodes && 
    graphData.nodes.length > 0 && 
    graphData.edges && 
    graphData.edges.length > 0;
  
  // Deep clone graph data for the chat interface
  const prepareGraphDataForChat = () => {
    if (!graphData) return null;
    
    try {
      console.log("Preparing graph data for chat, size:", 
        JSON.stringify(graphData).length);
      
      // Create a deep clone of the graph data
      const clonedData = JSON.parse(JSON.stringify(graphData));
      
      // Log some stats
      console.log(`Graph data prepared with ${clonedData.nodes.length} nodes and ${clonedData.edges.length} edges`);
      
      return clonedData;
    } catch (error) {
      console.error("Error preparing graph data for chat:", error);
      return null;
    }
  };

  // Function to handle opening the chat interface
  const handleOpenChat = () => {
    setShowChatInterface(true);
  };
  
  // Function to handle closing the chat interface  
  const handleCloseChat = () => {
    setShowChatInterface(false);
  };

  // Function to handle auth
  const handleAuth = () => {
    if (user) {
      // If user is logged in, log them out
      logout();
    } else {
      // If not logged in, show auth modal
      setShowAuthModal(true);
    }
  };

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
      
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [pollInterval]);

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

  // Function to open the save graph dialog
  const handleSaveGraph = async () => {
    if (!saveGraphName.trim()) return;
    
    // Check if the user is logged in
    if (!user) {
      setNotification({ type: 'error', message: 'Please sign in to save graphs' });
      setShowSaveDialog(false);
      setShowAuthModal(true);
      return;
    }
    
    try {
      setLoading(true);
      
      // Try to get a fresh token first
      const token = await refreshToken() || authToken;
      
      if (!token) {
        throw new Error('Authentication token not available');
      }
      
      // Format the graph data according to the expected backend structure
      const processedNodes = Array.isArray(graphData.nodes) 
        ? graphData.nodes.map(node => ({
            id: node.id,
            type: node.type || 'unknown',
            title: node.title || '',
            name: node.name || '',
            year: node.year || null,
            abstract: node.abstract || '',
            venue: node.venue || '',
            citation_count: typeof node.citation_count === 'number' ? node.citation_count : 0,
            reference_count: typeof node.reference_count === 'number' ? node.reference_count : 0,
            is_seed: node.is_seed_paper || false,
            community: node.community || null
          }))
        : [];
        
      const processedEdges = Array.isArray(graphData.edges) 
        ? graphData.edges.map(edge => ({
            source: edge.source,
            target: edge.target,
            type: edge.type || 'cites'
          }))
        : [];
      
      // This format matches what the backend expects
      const graphToSave = {
        title: saveGraphName.trim(),
        description: '',
        nodes: processedNodes,
        edges: processedEdges,
        metadata: {
          title: saveGraphName.trim(),
          created_at: new Date().toISOString(),
          seed_paper: getSeedPaperTitle(graphData),
          paper_count: graphStats.paperCount || 0,
          author_count: graphStats.authorCount || 0,
          node_count: graphStats.nodeCount || 0,
          edge_count: graphStats.edgeCount || 0
        }
      };
      
      // Deep copy the original graph data to preserve all properties
      const originalGraphData = JSON.parse(JSON.stringify(graphData));
      
      // Logging to debug save issues
      console.log("=== DEBUG: SAVING GRAPH DATA ===");
      console.log("Graph title:", saveGraphName.trim());
      console.log("Nodes count:", processedNodes.length);
      console.log("Edges count:", processedEdges.length);
      console.log("Original graph structure:", Object.keys(originalGraphData));
      console.log("Original has nodes:", Array.isArray(originalGraphData.nodes));
      console.log("Original has edges:", Array.isArray(originalGraphData.edges));
      console.log("Original has communities:", Boolean(originalGraphData.communities));
      console.log("=== END DEBUG INFO ===");
      
      // Use the complete original graph data plus metadata
      const completeGraphToSave = {
        ...originalGraphData,
        title: saveGraphName.trim(),
        metadata: {
          title: saveGraphName.trim(),
          created_at: new Date().toISOString(),
          seed_paper: getSeedPaperTitle(graphData)
        }
      };
      
      console.log("Saving graph with title:", saveGraphName.trim());
      
      const response = await fetch('/api/graphs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(completeGraphToSave),
      });
      
      if (response.ok) {
        setSaveGraphName('');
        fetchUserGraphs();
        setNotification({ type: 'success', message: 'Graph saved successfully!' });
        setShowSaveDialog(false);
      } else {
        let errorMessage = 'Unknown error';
        try {
          const errorData = await response.json();
          console.error('Error saving graph, server response:', errorData);
          
          // Try to extract a more specific error message
          if (errorData.error) {
            errorMessage = errorData.error;
          } else if (errorData.details) {
            errorMessage = errorData.details;
          } else {
            errorMessage = `Failed to save graph (${response.status})`;
          }
        } catch (err) {
          // If we can't parse JSON, just use the raw text
          try {
            const errorText = await response.text();
            console.error('Error saving graph, raw response:', errorText);
            errorMessage = `Server error (${response.status}): ${errorText.substring(0, 100)}`;
          } catch (textErr) {
            errorMessage = `Failed to save graph: HTTP ${response.status}`;
          }
        }
        
        setNotification({ type: 'error', message: errorMessage });
      }
    } catch (error) {
      console.error('Error saving graph:', error);
      setNotification({ type: 'error', message: `Error saving graph: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };
  
  // Helper function to identify seed paper title
  const getSeedPaperTitle = (data) => {
    if (!data || !data.nodes) return 'Unknown Paper';
    
    // First, look for nodes marked as seed paper
    const seedPaper = data.nodes.find(n => 
      n.type === 'paper' && (n.is_seed_paper || n.is_seed)
    );
    
    if (seedPaper) {
      return seedPaper.title || 'Unknown Paper';
    }
    
    // If no seed paper is marked, try to find the first paper
    const firstPaper = data.nodes.find(n => n.type === 'paper');
    return firstPaper ? (firstPaper.title || 'Unknown Paper') : 'Unknown Paper';
  };
  
  // Function to load a saved graph
  const handleLoadSavedGraph = (graphData) => {
    console.log("Loading saved graph with structure:", {
      hasNodes: !!graphData.nodes,
      nodeCount: graphData.nodes?.length || 0,
      hasEdges: !!graphData.edges,
      edgeCount: graphData.edges?.length || 0,
      hasMetadata: !!graphData.metadata,
      metadataKeys: graphData.metadata ? Object.keys(graphData.metadata) : []
    });
    
    // Reset all related state first
    setSelectedNode(null);
    setShowChatInterface(false);
    setLoading(true);
    
    // Clear current graph data before setting new data
    // This ensures the GraphVisualizer completely reinitializes
    setGraphData(null);
    
    // Use setTimeout to ensure state updates before setting new graph
    setTimeout(() => {
      // Set the graph data
      setGraphData(graphData);
      
      // Process it for visualization
      try {
        processGraphData(graphData);
        console.log("Graph processed successfully");
      } catch (error) {
        console.error("Error processing graph:", error);
        setNotification({ type: 'warning', message: 'Graph loaded but visualization may be incomplete' });
      } finally {
        setLoading(false);
      }
      
      // Close the dropdown and show graph
      setShowSavedGraphs(false);
      setShowStartOptions(false);
    }, 100);
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

  // Function to start polling for job status
  const startPolling = (id) => {
    // Set initial poll
    checkJobStatus(id);
    
    // Set up recurring poll
    const interval = setInterval(() => {
      checkJobStatus(id);
    }, 5000); // Poll every 5 seconds
    
    setPollInterval(interval);
  };
  
  // Function to check job status
  const checkJobStatus = async (id) => {
    try {
      console.log(`Checking status for job ID: ${id}`);
      const response = await fetch(`/api/check_job_status?jobId=${id}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to check job status');
      }
      
      console.log(`Job status for ${id}: ${data.status}`);
      setJobStatus(data.status);
      
      // Update progress and status message based on job status
      switch (data.status) {
        case 'queued':
          setStatusMessage('Job is queued and waiting to start...');
          setProgress(10);
          break;
        case 'processing':
          const progressMessage = data.progress_message || 'Processing citation graph...';
          setStatusMessage(progressMessage);
          
          // Use progress if available, otherwise estimate
          if (data.progress) {
            setProgress(data.progress);
          } else {
            // Calculate progress based on estimated completion
            if (data.estimated_completion_time) {
              const estimatedTime = new Date(data.estimated_completion_time);
              const now = new Date();
              const startTime = new Date(data.created_at);
              const totalDuration = estimatedTime - startTime;
              const elapsed = now - startTime;
              
              // Calculate progress but cap it at 90%
              const calculatedProgress = Math.min(90, Math.round((elapsed / totalDuration) * 100));
              setProgress(calculatedProgress);
            } else {
              // If no estimate, use a simple incremental progress
              setProgress((prev) => Math.min(90, prev + 2));
            }
          }
          break;
        case 'completed':
          setStatusMessage('Citation graph generation complete!');
          setProgress(100);
          
          // Add a small delay before fetching the result
          console.log("Job completed, waiting 1 second before fetching result");
          setTimeout(() => {
            fetchJobResult(id);
          }, 1000);
          
          // Stop polling
          if (pollInterval) {
            clearInterval(pollInterval);
            setPollInterval(null);
          }
          break;
        case 'failed':
          setStatusMessage('Job failed');
          setLoading(false);
          
          // Stop polling
          if (pollInterval) {
            clearInterval(pollInterval);
            setPollInterval(null);
          }
          
          alert('Failed to generate graph: ' + (data.error || 'Unknown error'));
          break;
        default:
          setStatusMessage(`Status: ${data.status}`);
      }
    } catch (error) {
      console.error('Error checking job status:', error);
      setStatusMessage('Error checking job status');
      setLoading(false);
      
      // Stop polling on error
      if (pollInterval) {
        clearInterval(pollInterval);
        setPollInterval(null);
      }
      
      alert('Error checking job status: ' + error.message);
    }
  };
  
  // Function to fetch job result
  const fetchJobResult = async (id) => {
    try {
      console.log(`Fetching job result for job ID: ${id}`);
      setStatusMessage('Retrieving graph data...');

      const statusResponse = await fetch(`/api/check_job_status?jobId=${id}`);
      const statusData = await statusResponse.json();
      console.log("Job status data:", statusData);
      
      // If the status includes a result_data field (small graphs), use it directly
      if (statusData.status === 'completed' && statusData.result_data) {
        console.log("Using result data directly from status response");
        processGraphData(statusData.result_data);
        setShowStartOptions(false);
        setLoading(false);
        return;
      }
    
    // Continue with normal result fetching
    const response = await fetch(`/api/get_job_result?jobId=${id}`);
    console.log(`Result response status: ${response.status}`);
      
      // If job not found (404), try alternate approaches
      if (response.status === 404) {
        console.log("Job not found, checking status for more information");
        
        // Check the job status again to see what's happening
        const statusResponse = await fetch(`/api/check_job_status?jobId=${id}`);
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          console.log("Current job status:", statusData);
          
          if (statusData.status === 'completed') {
            console.log("Job is marked as completed but result not found - possible mismatch");
            alert("There was an issue retrieving the completed graph. Please try again.");
          }
        }
        
        setLoading(false);
        return;
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log(`Error response text: ${errorText}`);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          console.log('Failed to parse error response as JSON');
          errorData = { error: 'Unknown error', details: errorText };
        }
        
        throw new Error(errorData.error || 'Failed to fetch job result');
      }
      
      console.log('Successfully received job result, parsing JSON');
      
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
      }
      
      // Final decode to ensure we get any remaining bytes
      jsonText += decoder.decode();
      
      // Parse the JSON data
      const data = JSON.parse(jsonText);
      console.log(`Received graph data with ${data.nodes?.length || 0} nodes and ${data.edges?.length || 0} edges`);
      
      setProgress(100);
      
      // Process the graph data
      processGraphData(data);
      setShowStartOptions(false);
      setLoading(false);
      
    } catch (error) {
      console.error('Error retrieving graph data:', error);
      setStatusMessage('Error retrieving graph data');
      setLoading(false);
      alert('Failed to retrieve graph data: ' + error.message);
    }
  };

  // Function to generate graph using the job processing system
  // Function to generate graph directly (no job processing)
// Function to generate graph directly (no job processing)
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
  setProgress(10);
  setStatusMessage('Generating citation graph...');
  
  // Start progress simulation
  const progressInterval = setInterval(() => {
    setProgress((prev) => {
      // Slowly approach 90% - the last 10% will be when data is received
      if (prev < 85) {
        return prev + 1;
      }
      return prev;
    });
  }, 1000);
  
  try {
    console.log(`Generating graph for: "${seedPaper}" with ${maxPapers} max papers and ${maxCitationsPerPaper} citations per paper`);
    
    const response = await fetch('/api/generate_graph', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seedPaper: seedPaper.trim(),
        maxPapers,
        maxCitationsPerPaper,
        detectCycles: true,
        maxCycles: 100
      }),
      signal
    });
    
    clearInterval(progressInterval);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('API error details:', errorData);
      throw new Error(errorData.error || `Failed to generate graph (${response.status})`);
    }
    
    setProgress(95);
    setStatusMessage('Processing graph data...');
    
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
    }
    
    // Final decode to ensure we get any remaining bytes
    jsonText += decoder.decode();
    
    // Parse the JSON data
    const data = JSON.parse(jsonText);
    setProgress(100);
    setStatusMessage('Graph generation complete!');
    
    // Log processing time if available
    if (data.processing_time) {
      console.log(`Server processing time: ${data.processing_time.toFixed(2)} seconds`);
    }
    
    // Log cycle information if available
    if (data.cycles && data.cycle_analysis) {
      console.log(`Found ${data.cycles.length} citation cycles`);
      console.log('Cycle analysis:', data.cycle_analysis);
    }
    
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
  // Cancel job generation
  const cancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    if (pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    }
    
    setLoading(false);
    setStatusMessage('');
    
    // If we have a job ID, we could add code to cancel the job on the server
    if (jobId) {
      console.log(`Cancelled job ${jobId}`);
      // In a full implementation, you might call an API to cancel the job
      // fetch(`/api/cancel_job?jobId=${jobId}`, { method: 'POST' });
    }
  };

  // Process graph data with improved memory efficiency for large graphs
  const processGraphData = (data) => {
    try {
      // Start processing
      console.time('processGraphData');
      
      // Validate the data structure
      if (!data || typeof data !== 'object') {
        console.warn('Invalid graph data: data is not an object');
        return; // Exit early rather than throwing error
      }
      
      // Create empty arrays if missing instead of throwing error
      if (!Array.isArray(data.nodes)) {
        console.warn('Graph data missing nodes array, initializing empty array');
        data.nodes = [];
      }
      
      if (!Array.isArray(data.edges)) {
        console.warn('Graph data missing edges array, initializing empty array');
        data.edges = [];
      }
      
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
          if (!node || !node.id) {
            console.warn(`Node at index ${i} is invalid, skipping`);
            continue;
          }
          
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
      
      // Use cycles from the server if provided, otherwise calculate them
      if (data.cycles && Array.isArray(data.cycles)) {
        setCycles(data.cycles);
        stats.cycleCount = data.cycles.length;
      } else if (data.edges && data.edges.length > 0) {
        try {
          // For very large graphs, limit the cycle detection to avoid performance issues
          let cyclesToFind = data.edges.length > 10000 ? 100 : -1;
          const foundCycles = findCycles(data.nodes, data.edges, cyclesToFind);
          setCycles(foundCycles);
          stats.cycleCount = foundCycles.length;
        } catch (cycleError) {
          console.warn('Error finding cycles:', cycleError);
          // Continue without cycles
          setCycles([]);
        }
      }
      
      // Update statistics
      setGraphStats(stats);
      
      console.timeEnd('processGraphData');
      
    } catch (error) {
      console.error('Error processing graph data:', error);
      console.warn('Graph data was:', JSON.stringify(data).substring(0, 500) + '...');
      // Don't alert, just log the error
      setNotification({ type: 'warning', message: 'Graph may display incompletely due to processing issues' });
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
    setShowChatInterface(false);
    setGraphStats({
      nodeCount: 0,
      edgeCount: 0,
      paperCount: 0,
      authorCount: 0,
      cycleCount: 0
    });
    
    // Reset job tracking state
    setJobId(null);
    setJobStatus(null);
    
    // Clear any polling interval
    if (pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    }
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

  // Function to handle node selection in graph
  const handleNodeSelect = (node) => {
    setSelectedNode(node);
    // Don't highlight or blur other nodes when selecting
  };

  // Function to highlight a node without selecting it or causing blurring
  const handleHighlightNode = (node) => {
    // Track the node to be visually accented without blurring others
    setAccentedNode(node);
  };

  const handleFilterChange = (newFilters) => {
    setFilterOptions(newFilters);
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

  // Add click-away event listener for the dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (savedGraphsDropdownRef.current && !savedGraphsDropdownRef.current.contains(event.target)) {
        setShowSavedGraphs(false);
      }
    }

    // Bind the event listener
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      // Unbind the event listener on clean up
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [savedGraphsDropdownRef]);

  // Add fetchUserGraphs function if it doesn't exist
  const fetchUserGraphs = async () => {
    if (!user) {
      setSavedGraphs([]);
      return;
    }
    
    try {
      // Get fresh token
      const token = await refreshToken() || authToken;
      
      if (!token) {
        console.warn("No auth token available for fetching graphs");
        return;
      }
      
      const response = await fetch('/api/graphs', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error fetching graphs:', errorData);
        throw new Error(errorData.error || 'Failed to fetch user graphs');
      }
      
      const data = await response.json();
      console.log(`Fetched ${data.graphs?.length || 0} saved graphs`);
      setSavedGraphs(data.graphs || []);
    } catch (error) {
      console.error('Error fetching user graphs:', error);
      setNotification({ type: 'error', message: `Could not load saved graphs: ${error.message}` });
    }
  };
  
  useEffect(() => {
    // Fetch user's saved graphs when component mounts or user changes
    if (user) {
      fetchUserGraphs();
    } else {
      setSavedGraphs([]);
    }
  }, [user]);

  useEffect(() => {
    // Auto-dismiss notification after 5 seconds
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [notification]);

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
      
      {/* Notification Component */}
      {notification && (
        <div 
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            backgroundColor: notification.type === 'success' ? "#10B981" : "#EF4444",
            color: "white",
            padding: "12px 16px",
            borderRadius: "6px",
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            maxWidth: "400px"
          }}
        >
          {notification.type === 'success' ? (
            <svg style={{marginRight: "12px", height: "20px", width: "20px"}} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg style={{marginRight: "12px", height: "20px", width: "20px"}} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          )}
          <div>
            <div style={{fontWeight: "500"}}>{notification.message}</div>
          </div>
          <button 
            onClick={() => setNotification(null)} 
            style={{
              marginLeft: "auto",
              backgroundColor: "transparent",
              border: "none",
              color: "white",
              cursor: "pointer",
              padding: "4px"
            }}
          >
            <svg style={{height: "16px", width: "16px"}} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}
      
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
            {/* Chat button */}
            <button
              onClick={() => setShowChatInterface(!showChatInterface)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 16px",
                backgroundColor: showChatInterface ? "#4338CA" : "#4F46E5",
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              {showChatInterface ? "Hide Chat" : "Ask AI"}
            </button>
            
            {/* Graphs Dropdown Menu - Only visible to signed-in users */}
            {user && (
              <div style={{ position: "relative" }} ref={savedGraphsDropdownRef}>
                <button
                  onClick={() => setShowSavedGraphs(!showSavedGraphs)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "8px 16px",
                    backgroundColor: showSavedGraphs ? "#2563EB" : "#3B82F6",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    fontSize: "14px",
                    fontWeight: "500",
                    cursor: "pointer"
                  }}
                  title="Save current graph or load a previously saved graph"
                >
                  <svg style={{marginRight: "8px", height: "20px", width: "20px"}} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Graphs
                </button>
                
                {showSavedGraphs && (
                  <div 
                    style={{
                      position: "absolute",
                      top: "100%",
                      right: "0",
                      marginTop: "4px",
                      backgroundColor: "white",
                      borderRadius: "8px",
                      boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
                      width: "320px",
                      zIndex: 50,
                      overflow: "hidden",
                      border: "1px solid #E5E7EB"
                    }}
                  >
                    <div className="p-3 border-b border-gray-200">
                      <SavedGraphsList 
                        onLoadGraph={handleLoadSavedGraph} 
                        onClose={() => setShowSavedGraphs(false)} 
                      />
                    </div>
                    
                    <div className="p-3 bg-gray-50">
                      <button
                        onClick={() => {
                          setShowSavedGraphs(false);
                          setShowSaveDialog(true);
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "100%",
                          padding: "8px 16px",
                          backgroundColor: "#4F46E5",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                          fontSize: "14px",
                          fontWeight: "500",
                          cursor: "pointer",
                          transition: "background-color 0.2s"
                        }}
                        className="hover:bg-indigo-700"
                        title="Save your current graph"
                      >
                        <svg style={{marginRight: "8px", height: "20px", width: "20px"}} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                        </svg>
                        Save Current Graph
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Login/Profile button */}
            <button
              onClick={handleAuth}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "8px 16px",
                backgroundColor: user ? "#10B981" : "#3B82F6",
                color: "white",
                border: "none",
                borderRadius: "4px",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                fontSize: "14px",
                fontWeight: "500",
                cursor: "pointer"
              }}
            >
              <svg 
                style={{marginRight: "8px", height: "20px", width: "20px"}} 
                xmlns="http://www.w3.org/2000/svg" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d={user 
                    ? "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" 
                    : "M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"} 
                />
              </svg>
              {user ? user.email ? user.email.split('@')[0] : 'Profile' : 'Login'}
            </button>
            
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
                gap: "24px",
                justifyContent: "center",
                flexWrap: "wrap",
                maxWidth: "1440px",
                margin: "0 auto"
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
                      <p style={{marginTop: "8px"}}>
                        Here are some places to find a wide variety of papers: <a href="https://arxiv.org" target="_blank" rel="noopener noreferrer" style={{color: "#2563EB", textDecoration: "underline"}}>arXiv</a>, <a href="https://dl.acm.org/browse/" target="_blank" rel="noopener noreferrer" style={{color: "#2563EB", textDecoration: "underline"}}>ACM Digital Library</a>, and <a href="https://pubmed.ncbi.nlm.nih.gov" target="_blank" rel="noopener noreferrer" style={{color: "#2563EB", textDecoration: "underline"}}>PubMed</a>
                      </p>
                      <p style={{marginTop: "8px"}}>Note: If you want to generate larger graphs (i.e: more than 250 papers), please download the <a href='https://github.com/ps1526/researchkg' className='highlight-link' style={{color: "#2563EB", textDecoration: "underline"}}>researchkg</a> notebook and run it locally</p>
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
                          <span>{statusMessage || 'Processing...'}</span>
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
                          {jobStatus === 'processing' 
                            ? 'Searching for papers and building citation connections...' 
                            : jobStatus === 'completed'
                            ? 'Retrieving and processing graph data...'
                            : 'Starting job...'}
                        </p>
                        {jobId && (
                          <p style={{
                            fontSize: "12px",
                            color: "#374151",
                            marginTop: "8px"
                          }}>
                            Job ID: <strong>{jobId}</strong>
                          </p>
                        )}
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
                              max="300" // Increased maximum
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
                        <span style={{fontWeight: "500"}}>Optimized for large files:</span> Supports graphs with thousands of nodes and files up to 50MB. <a href="https://drive.google.com/drive/folders/1nTlEK5zW0p5ygEi4XO4eRF5L8Tq_igM6?usp=share_link" target="_blank" rel="noopener noreferrer" style={{color: "#2563EB", textDecoration: "underline"}}>See sample graph inputs here</a>
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
                
                {/* Option 3: Account Management */}
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
                      {user ? 'Your Account' : 'Sign In / Register'}
                    </h3>
                    <div style={{
                      fontSize: "14px",
                      color: "#6B7280",
                      marginBottom: "16px"
                    }}>
                      {user ? (
                        <p>You're signed in as <strong>{user.email}</strong>. Save and access your citation graphs across devices.</p>
                      ) : (
                        <p>Sign in to save your citation graphs and access them from any device. Your research, everywhere you go.</p>
                      )}
                    </div>
                    <div style={{marginTop: "16px", display: "flex", flexDirection: "column", gap: "16px"}}>
                      {!user ? (
                        <button
                          onClick={handleAuth}
                          style={{
                            width: "100%",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            padding: "10px",
                            backgroundColor: "#3B82F6",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            fontWeight: "500",
                            cursor: "pointer"
                          }}
                        >
                          <svg 
                            style={{marginRight: "8px", height: "20px", width: "20px"}} 
                            xmlns="http://www.w3.org/2000/svg" 
                            fill="none" 
                            viewBox="0 0 24 24" 
                            stroke="currentColor"
                          >
                            <path 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                              strokeWidth={2} 
                              d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
                            />
                          </svg>
                          Sign In / Register
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setShowSavedGraphs(!showSavedGraphs);
                              
                              // If showing saved graphs and there's no current graph data,
                              // we need to hide start options to ensure SavedGraphsList is visible
                              if (!showSavedGraphs && !graphData) {
                                setShowStartOptions(false);
                              }
                            }}
                            style={{
                              width: "100%",
                              display: "flex",
                              justifyContent: "center",
                              alignItems: "center",
                              padding: "10px",
                              backgroundColor: showSavedGraphs ? "#4338CA" : "#4F46E5",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                              fontWeight: "500",
                              cursor: "pointer",
                              marginBottom: "10px",
                              transition: "all 0.2s ease"
                            }}
                          >
                            <svg 
                              style={{marginRight: "8px", height: "20px", width: "20px"}} 
                              xmlns="http://www.w3.org/2000/svg" 
                              fill="none" 
                              viewBox="0 0 24 24" 
                              stroke="currentColor"
                            >
                              <path 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                strokeWidth={2} 
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                            {showSavedGraphs ? 'Hide Saved Graphs' : 'View Saved Graphs'}
                          </button>
                          
                          {showSavedGraphs && (
                            <div style={{
                              marginTop: "8px", 
                              marginBottom: "10px",
                              border: "1px solid #E5E7EB",
                              borderRadius: "8px",
                              overflow: "hidden"
                            }}>
                              <SavedGraphsList onLoadGraph={handleLoadSavedGraph} />
                            </div>
                          )}
                          
                          <button
                            onClick={handleAuth}
                            style={{
                              width: "100%",
                              display: "flex",
                              justifyContent: "center",
                              alignItems: "center",
                              padding: "10px",
                              backgroundColor: "#10B981",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                              fontWeight: "500",
                              cursor: "pointer",
                              transition: "all 0.2s ease"
                            }}
                          >
                            <svg 
                              style={{marginRight: "8px", height: "20px", width: "20px"}} 
                              xmlns="http://www.w3.org/2000/svg" 
                              fill="none" 
                              viewBox="0 0 24 24" 
                              stroke="currentColor"
                            >
                              <path 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                strokeWidth={2} 
                                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                              />
                            </svg>
                            Sign Out
                          </button>
                        </>
                      )}
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
              
              {graphData && !loading && (
                <GraphVisualizer 
                  graphData={graphData}
                  selectedNode={selectedNode}
                  onNodeSelect={handleNodeSelect}
                  highlightedNodes={highlightedNodes}
                  showCycles={showCycles}
                  cycles={cycles}
                  accentedNode={accentedNode}
                />
              )}

              {/* Chat Interface */}
              {isChatAvailable && (
                <>
                  {!showChatInterface && (
                    <button
                      onClick={handleOpenChat}
                      className="chat-button"
                      style={{
                        position: 'fixed',
                        right: '20px',
                        bottom: '20px',
                        backgroundColor: '#3B82F6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '50%',
                        width: '60px',
                        height: '60px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                        cursor: 'pointer',
                        zIndex: 999
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                      </svg>
                    </button>
                  )}
                  
                  <ChatInterface
                    graphData={prepareGraphDataForChat()}
                    visible={showChatInterface}
                    onClose={handleCloseChat}
                    selectedNode={selectedNode}
                    onHighlightNode={handleHighlightNode}
                    onSelectNode={handleNodeSelect}
                  />
                </>
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

      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />

      {/* Save Graph Dialog */}
      {showSaveDialog && (
        <div className="dialog-overlay" style={{
          position: "fixed", 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 50
        }}>
          <div className="dialog" style={{
            backgroundColor: "white",
            borderRadius: "8px",
            maxWidth: "400px",
            width: "100%",
            padding: "24px",
            boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)"
          }}>
            <div className="dialog-content">
              <h3 style={{ 
                fontSize: "18px", 
                fontWeight: "600", 
                color: "#1F2937", 
                marginBottom: "16px",
                display: "flex",
                alignItems: "center"
              }}>
                <svg style={{marginRight: "8px", height: "20px", width: "20px"}} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                Save Graph
              </h3>
              
              <div style={{marginBottom: "20px"}}>
                <label 
                  htmlFor="graph-name" 
                  style={{ 
                    display: "block", 
                    fontSize: "14px", 
                    fontWeight: "500", 
                    color: "#4B5563", 
                    marginBottom: "6px" 
                  }}
                >
                  Graph Name
                </label>
                <input
                  id="graph-name"
                  type="text"
                  placeholder="Enter a name for your graph"
                  value={saveGraphName}
                  onChange={(e) => setSaveGraphName(e.target.value)}
                  style={{ 
                    width: "100%",
                    border: "1px solid #D1D5DB",
                    borderRadius: "4px",
                    padding: "8px 12px",
                    fontSize: "14px",
                    color: "#374151",
                    outline: "none",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  }}
                />
              </div>
              
              <div style={{ 
                padding: "12px", 
                borderRadius: "6px", 
                marginBottom: "20px",
                backgroundColor: "#F9FAFB",
                border: "1px solid #E5E7EB"
              }}>
                <div style={{ 
                  fontSize: "14px", 
                  fontWeight: "500", 
                  color: "#4B5563", 
                  marginBottom: "8px",
                  display: "flex",
                  alignItems: "center"
                }}>
                  <svg style={{marginRight: "6px", height: "16px", width: "16px"}} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Graph Statistics
                </div>
                <div style={{ 
                  display: "grid", 
                  gridTemplateColumns: "1fr 1fr 1fr", 
                  gap: "8px" 
                }}>
                  <div style={{ 
                    backgroundColor: "white", 
                    padding: "10px", 
                    borderRadius: "4px", 
                    textAlign: "center",
                    border: "1px solid #E5E7EB"
                  }}>
                    <span style={{ display: "block", fontWeight: "600", color: "#2563EB", fontSize: "16px" }}>
                      {graphStats.paperCount}
                    </span>
                    <span style={{ fontSize: "12px", color: "#6B7280" }}>Papers</span>
                  </div>
                  <div style={{ 
                    backgroundColor: "white", 
                    padding: "10px", 
                    borderRadius: "4px", 
                    textAlign: "center",
                    border: "1px solid #E5E7EB"
                  }}>
                    <span style={{ display: "block", fontWeight: "600", color: "#7C3AED", fontSize: "16px" }}>
                      {graphStats.authorCount}
                    </span>
                    <span style={{ fontSize: "12px", color: "#6B7280" }}>Authors</span>
                  </div>
                  <div style={{ 
                    backgroundColor: "white", 
                    padding: "10px", 
                    borderRadius: "4px", 
                    textAlign: "center",
                    border: "1px solid #E5E7EB"
                  }}>
                    <span style={{ display: "block", fontWeight: "600", color: "#059669", fontSize: "16px" }}>
                      {graphStats.edgeCount}
                    </span>
                    <span style={{ fontSize: "12px", color: "#6B7280" }}>Connections</span>
                  </div>
                </div>
              </div>
              
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  onClick={() => setShowSaveDialog(false)}
                  style={{
                    backgroundColor: "#F3F4F6",
                    padding: "8px 16px",
                    color: "#374151",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "14px",
                    fontWeight: "500",
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveGraph}
                  style={{
                    backgroundColor: "#4F46E5",
                    padding: "8px 16px",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "14px",
                    fontWeight: "500",
                    display: "flex",
                    alignItems: "center",
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.7 : 1
                  }}
                  disabled={!saveGraphName.trim() || loading}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </>
                  ) : (
                    'Save Graph'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Backend status checker */}
      <BackendStatusCheck />
    </div>
  );
}