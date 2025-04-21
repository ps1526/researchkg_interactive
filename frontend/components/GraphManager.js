import { useEffect, useState, useCallback } from 'react';
import GraphVisualizer from './GraphVisualizer';

// Poll interval in milliseconds
const JOB_STATUS_POLL_INTERVAL = 5000;

export default function GraphManager() {
  // Form state
  const [seedPaper, setSeedPaper] = useState('');
  const [maxPapers, setMaxPapers] = useState(20);
  const [maxCitationsPerPaper, setMaxCitationsPerPaper] = useState(3);
  
  // Job processing state
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [estimatedCompletion, setEstimatedCompletion] = useState(null);
  
  // Graph data state
  const [graphData, setGraphData] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [highlightedNodes, setHighlightedNodes] = useState(null);
  const [showCycles, setShowCycles] = useState(false);
  const [cycles, setCycles] = useState([]);
  
  // Polling state
  const [pollInterval, setPollInterval] = useState(null);
  
  // Clean up polling when component unmounts
  useEffect(() => {
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [pollInterval]);
  
  // Reset selected node when graph data changes
  useEffect(() => {
    if (graphData) {
      // Reset any selections or highlighting when graph changes
      setSelectedNode(null);
      setHighlightedNodes(null);
      console.log("GraphManager: New graph data received, reset selections");
    }
  }, [graphData]);
  
  // Handle form submission to start job
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Reset state
    setIsLoading(true);
    setError('');
    setJobId(null);
    setJobStatus(null);
    setGraphData(null);
    setStatusMessage('Submitting job...');
    setProgress(0);
    setSelectedNode(null);
    
    // Clear any existing poll interval
    if (pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    }
    
    try {
      const response = await fetch('/api/submit_graph_job', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          seedPaper,
          maxPapers,
          maxCitationsPerPaper
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit job');
      }
      
      // Save job ID and start polling
      setJobId(data.job_id);
      setJobStatus(data.status);
      setStatusMessage(`Job submitted. ID: ${data.job_id}`);
      
      // Start polling for job status
      startPolling(data.job_id);
      
    } catch (err) {
      setError(err.message);
      setIsLoading(false);
      setStatusMessage('Error submitting job');
    }
  };
  
  // Function to start polling for job status
  const startPolling = (id) => {
    // Set initial poll
    checkJobStatus(id);
    
    // Set up recurring poll
    const interval = setInterval(() => {
      checkJobStatus(id);
    }, JOB_STATUS_POLL_INTERVAL);
    
    setPollInterval(interval);
  };
  
  // Function to check job status
  const checkJobStatus = async (id) => {
    try {
      const response = await fetch(`/api/check_job_status?jobId=${id}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to check job status');
      }
      
      setJobStatus(data.status);
      
      // Update status message based on job status
      switch (data.status) {
        case 'queued':
          setStatusMessage('Job is queued and waiting to start...');
          setProgress(10);
          break;
        case 'processing':
          setStatusMessage('Processing citation graph...');
          // Calculate a simulated progress based on estimated completion
          if (data.estimated_completion_time) {
            const estimatedTime = new Date(data.estimated_completion_time);
            setEstimatedCompletion(estimatedTime);
            
            // Calculate progress based on time elapsed vs. estimated time
            const now = new Date();
            const startTime = new Date(data.created_at);
            const totalDuration = estimatedTime - startTime;
            const elapsed = now - startTime;
            
            // Calculate progress but cap it at 90%
            const calculatedProgress = Math.min(90, Math.round((elapsed / totalDuration) * 100));
            setProgress(calculatedProgress);
          } else {
            // If no estimate, use a simple incremental progress
            setProgress((prev) => Math.min(90, prev + 5));
          }
          break;
        case 'completed':
          setStatusMessage('Citation graph generation complete!');
          setProgress(100);
          
          // Fetch the result
          fetchJobResult(id);
          
          // Stop polling
          if (pollInterval) {
            clearInterval(pollInterval);
            setPollInterval(null);
          }
          break;
        case 'failed':
          setStatusMessage('Job failed');
          setError(data.error || 'Job processing failed');
          setIsLoading(false);
          
          // Stop polling
          if (pollInterval) {
            clearInterval(pollInterval);
            setPollInterval(null);
          }
          break;
        default:
          setStatusMessage(`Status: ${data.status}`);
      }
    } catch (err) {
      setError(err.message);
      setStatusMessage('Error checking job status');
      setIsLoading(false);
      
      // Stop polling on error
      if (pollInterval) {
        clearInterval(pollInterval);
        setPollInterval(null);
      }
    }
  };
  
  // Function to fetch job result
  const fetchJobResult = async (id) => {
    try {
      setStatusMessage('Retrieving graph data...');
      
      const response = await fetch(`/api/get_job_result?jobId=${id}`);
      
      // If job is still processing
      if (response.status === 202) {
        return; // Continue polling
      }
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch job result');
      }
      
      // Set graph data
      setGraphData(data);
      
      // Extract cycles if available
      if (data.cycles && data.cycles.length > 0) {
        setCycles(data.cycles);
      }
      
      // Complete loading
      setIsLoading(false);
      setStatusMessage('Graph ready to explore');
      
    } catch (err) {
      setError(err.message);
      setStatusMessage('Error retrieving graph data');
      setIsLoading(false);
    }
  };
  
  // Handle node selection
  const handleNodeSelect = useCallback((node) => {
    setSelectedNode(node);
  }, []);
  
  // Handle search/filter
  const handleSearch = (query) => {
    if (!query.trim() || !graphData) {
      setHighlightedNodes(null);
      return;
    }
    
    const lowerQuery = query.toLowerCase();
    const matches = new Set();
    
    // Search nodes
    graphData.nodes.forEach(node => {
      // Match by title, name, or other relevant fields
      const title = (node.title || '').toLowerCase();
      const name = (node.name || '').toLowerCase();
      const abstract = (node.abstract || '').toLowerCase();
      
      if (title.includes(lowerQuery) || 
          name.includes(lowerQuery) || 
          abstract.includes(lowerQuery)) {
        matches.add(node.id);
      }
    });
    
    setHighlightedNodes(matches.size > 0 ? matches : null);
  };
  
  // Toggle showing cycles
  const toggleShowCycles = () => {
    setShowCycles(!showCycles);
  };
  
  // Recover job by ID
  const recoverJob = async (id) => {
    if (!id.trim()) return;
    
    setJobId(id);
    setIsLoading(true);
    setError('');
    setGraphData(null);
    setStatusMessage('Retrieving job status...');
    
    // Start polling for the job status
    startPolling(id);
  };
  
  return (
    <div className="graph-manager-container">
      {/* Input form */}
      {!isLoading && !graphData && (
        <>
          <div className="form-container">
            <h2>Citation Graph Generator</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="seedPaper">Seed Paper (DOI, title, or search term):</label>
                <input
                  type="text"
                  id="seedPaper"
                  value={seedPaper}
                  onChange={(e) => setSeedPaper(e.target.value)}
                  placeholder="Enter DOI, title, or search term"
                  required
                  minLength={5}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="maxPapers">Maximum Papers:</label>
                <input
                  type="number"
                  id="maxPapers"
                  value={maxPapers}
                  onChange={(e) => setMaxPapers(parseInt(e.target.value))}
                  min={5}
                  max={100}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="maxCitationsPerPaper">Max Citations Per Paper:</label>
                <input
                  type="number"
                  id="maxCitationsPerPaper"
                  value={maxCitationsPerPaper}
                  onChange={(e) => setMaxCitationsPerPaper(parseInt(e.target.value))}
                  min={1}
                  max={10}
                />
              </div>
              
              <button type="submit" disabled={isLoading}>
                Generate Citation Graph
              </button>
            </form>
          </div>
          
          <div className="job-recovery">
            <h3>Recover Previous Job</h3>
            <div className="form-group">
              <input
                type="text"
                placeholder="Enter previous job ID"
                onChange={(e) => setJobId(e.target.value)}
              />
              <button onClick={() => recoverJob(jobId)}>
                Recover Job
              </button>
            </div>
          </div>
        </>
      )}
      
      {/* Loading state */}
      {isLoading && (
        <div className="loading-container">
          <h2>{statusMessage}</h2>
          {jobId && (
            <div className="job-id-display">
              <p>Job ID: <strong>{jobId}</strong></p>
              <p>You can use this ID to recover your job later if needed.</p>
            </div>
          )}
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          {estimatedCompletion && (
            <p>Estimated completion: {new Date(estimatedCompletion).toLocaleTimeString()}</p>
          )}
          {error && <div className="error-message">{error}</div>}
        </div>
      )}
      
      {/* Graph visualizer */}
      {!isLoading && graphData && (
        <div className="graph-container">
          <div className="graph-header">
            <h2>Citation Graph</h2>
            <div className="graph-controls">
              <input
                type="text"
                placeholder="Search nodes..."
                onChange={(e) => handleSearch(e.target.value)}
              />
              {cycles.length > 0 && (
                <button 
                  onClick={toggleShowCycles}
                  className={showCycles ? 'active' : ''}
                >
                  {showCycles ? 'Hide Cycles' : 'Show Cycles'}
                </button>
              )}
              <button onClick={() => {
                setGraphData(null);
                setJobId(null);
                setJobStatus(null);
              }}>
                New Graph
              </button>
            </div>
          </div>
          
          <div className="graph-visualization">
            <GraphVisualizer
              graphData={graphData}
              selectedNode={selectedNode}
              onNodeSelect={handleNodeSelect}
              highlightedNodes={highlightedNodes}
              showCycles={showCycles}
              cycles={cycles}
            />
          </div>
          
          {selectedNode && (
            <div className="node-details">
              <h3>{selectedNode.title || selectedNode.name || 'Node Details'}</h3>
              {selectedNode.type === 'paper' && (
                <>
                  {selectedNode.abstract && <p><strong>Abstract:</strong> {selectedNode.abstract}</p>}
                  {selectedNode.year && <p><strong>Year:</strong> {selectedNode.year}</p>}
                  {selectedNode.venue && <p><strong>Venue:</strong> {selectedNode.venue}</p>}
                  {selectedNode.citation_count !== undefined && <p><strong>Citations:</strong> {selectedNode.citation_count}</p>}
                  {selectedNode.url && (
                    <p>
                      <strong>URL:</strong> <a href={selectedNode.url} target="_blank" rel="noopener noreferrer">View Paper</a>
                    </p>
                  )}
                </>
              )}
              {selectedNode.type === 'author' && (
                <>
                  {selectedNode.url && (
                    <p>
                      <strong>URL:</strong> <a href={selectedNode.url} target="_blank" rel="noopener noreferrer">View Author</a>
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}