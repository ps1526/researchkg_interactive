import { useState, useEffect } from 'react';
import { useAuth } from '../components/AuthProvider';

const SavedGraphsList = ({ onLoadGraph, onClose }) => {
  const [savedGraphs, setSavedGraphs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loadingGraphId, setLoadingGraphId] = useState(null);
  const [deletingGraphId, setDeletingGraphId] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [graphToDelete, setGraphToDelete] = useState(null);
  const { user, authToken, refreshToken } = useAuth();

  useEffect(() => {
    // Only fetch if user is logged in
    if (user) {
      fetchSavedGraphs();
    }
  }, [user]);

  const fetchSavedGraphs = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Refresh the token before making the request
      const token = await refreshToken() || authToken;
      
      if (!token) {
        throw new Error('No authentication token available');
      }
      
      const response = await fetch('/api/graphs', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const responseData = await response.json();
      
      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to fetch saved graphs');
      }
      
      setSavedGraphs(responseData.graphs || []);
    } catch (err) {
      console.error('Error fetching saved graphs:', err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadGraph = async (graphId) => {
    if (loadingGraphId || !user) return; // Prevent loading if not signed in
    
    console.log(`Loading graph ID: ${graphId}`);
    setLoadingGraphId(graphId);
    setError(null);
    
    // Maximum number of retry attempts
    const maxRetries = 3;
    let retryCount = 0;
    let success = false;
    let responseData = null;
    
    try {
      const token = await refreshToken() || authToken;
      
      if (!token) {
        throw new Error('No authentication token available');
      }
      
      // Keep trying until successful or max retries is reached
      while (retryCount < maxRetries && !success) {
        try {
          const response = await fetch(`/api/graphs/${graphId}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          // If not successful
          if (!response.ok) {
            if (response.status === 404) {
              throw new Error('Graph not found');
            } else {
              throw new Error(`Server error: ${response.status}`);
            }
          }

          // Get response text first to handle streaming or large responses
          const responseText = await response.text();
          
          // Try to parse response data
          try {
            responseData = JSON.parse(responseText);
            console.log('Graph data received with keys:', Object.keys(responseData));
            success = true;
          } catch (parseError) {
            console.error('Failed to parse JSON response:', parseError);
            throw new Error('Invalid response format from server');
          }
          
        } catch (err) {
          console.error(`Attempt ${retryCount + 1} failed:`, err);
          retryCount++;
          
          if (retryCount >= maxRetries) {
            throw err;
          }
          
          // Wait before retrying (with increasing delay)
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
      
      // Validate the response data
      if (!responseData) {
        throw new Error('Empty response from server');
      }
      
      if (!responseData.graph) {
        console.error('Missing graph data in response. Response data:', responseData);
        throw new Error('Invalid response from server (missing graph data)');
      }
      
      // Get the graph data
      const graphData = responseData.graph;
      
      // Log the graph structure to help debug
      console.log('Graph structure received:', {
        hasNodes: !!graphData.nodes,
        nodeCount: graphData.nodes?.length || 0,
        hasEdges: !!graphData.edges,
        edgeCount: graphData.edges?.length || 0,
        hasMetadata: !!graphData.metadata,
        metadataKeys: graphData.metadata ? Object.keys(graphData.metadata) : []
      });
      
      // Ensure graph has expected properties
      if (!graphData.nodes || !graphData.edges) {
        console.error('Graph data is missing nodes or edges:', graphData);
        throw new Error('Invalid graph structure (missing nodes or edges)');
      }
      
      // Pass the data to the parent component
      console.log('Loading graph into visualizer...');
      onLoadGraph(graphData);
      console.log('Graph loaded successfully!');
      
      if (onClose) onClose();

    } catch (error) {
      console.error('Error loading graph:', error);
      setError(error.message || 'Failed to load graph');
    } finally {
      setLoadingGraphId(null);
    }
  };

  const openDeleteConfirm = (graph, e) => {
    e.stopPropagation(); // Prevent triggering the load graph action
    setGraphToDelete(graph);
    setShowDeleteConfirm(true);
  };

  const cancelDelete = (e) => {
    if (e) e.stopPropagation();
    setShowDeleteConfirm(false);
    setGraphToDelete(null);
  };

  const confirmDelete = async (e) => {
    e.stopPropagation();
    
    if (!graphToDelete) return;
    
    try {
      setDeletingGraphId(graphToDelete.id);
      setError(null);
      
      // Refresh the token before making the request
      const token = await refreshToken() || authToken;
      
      if (!token) {
        throw new Error('No authentication token available');
      }
      
      console.log(`Deleting graph ${graphToDelete.id} with token length: ${token.length}`);
      
      const response = await fetch(`/api/graphs/${graphToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      // Get response as text first for better debugging
      const responseText = await response.text();
      console.log(`Delete response status: ${response.status}, Length: ${responseText.length}`);
      
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse delete response:', responseText);
        throw new Error(`Error parsing server response: ${responseText.substring(0, 100)}`);
      }
      
      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to delete graph');
      }
      
      // Remove the deleted graph from the state
      setSavedGraphs(savedGraphs.filter(graph => graph.id !== graphToDelete.id));
      
      // Close the confirmation modal
      setShowDeleteConfirm(false);
      setGraphToDelete(null);
    } catch (err) {
      console.error('Error deleting graph:', err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setDeletingGraphId(null);
    }
  };

  // Format date string
  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  // Get graph title from various possible locations
  const getGraphTitle = (graph) => {
    // Try different possible locations for the title
    if (graph.title) return graph.title;
    if (graph.metadata && graph.metadata.title) return graph.metadata.title;
    return 'Untitled Graph';
  };

  // Get graph stats as a string
  const getGraphStats = (graph) => {
    const paperCount = graph.paper_count || 0;
    const authorCount = graph.author_count || 0;
    return `${paperCount} papers · ${authorCount} authors`;
  };

  if (!user) {
    return (
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Sign In Required
            </h3>
            
            <p style={{
              fontSize: "14px",
              color: "#4B5563",
              marginBottom: "20px"
            }}>
              Please sign in to view and manage your saved graphs. Your graphs will be securely stored in your account.
            </p>
            
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => window.location.href = '#auth'}
                style={{
                  backgroundColor: "#4F46E5",
                  padding: "8px 16px",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "14px",
                  fontWeight: "500",
                  display: "flex", 
                  alignItems: "center"
                }}
              >
                <svg style={{marginRight: "8px", height: "16px", width: "16px"}} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                Sign In
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: "100%",
      borderRadius: "8px",
      overflow: "hidden",
      backgroundColor: "white",
      boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      border: "1px solid #E5E7EB"
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 16px",
        borderBottom: "1px solid #E5E7EB",
        backgroundColor: "#F9FAFB"
      }}>
        <h3 style={{
          fontSize: "14px",
          fontWeight: "600",
          color: "#374151",
          margin: 0
        }}>
          Your Saved Graphs ({savedGraphs.length})
        </h3>
        
        <button
          onClick={fetchSavedGraphs}
          style={{
            backgroundColor: "transparent",
            color: "#4F46E5",
            border: "none",
            padding: "4px 8px",
            borderRadius: "4px",
            fontSize: "13px",
            fontWeight: "500",
            cursor: "pointer",
            display: "flex",
            alignItems: "center"
          }}
          disabled={loading}
          title="Refresh list of saved graphs"
        >
          <svg style={{marginRight: "4px", height: "14px", width: "14px"}} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>
      
      {/* Loading state */}
      {loading && savedGraphs.length === 0 && (
        <div style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "24px",
          backgroundColor: "#F9FAFB"
        }}>
          <svg className="animate-spin" style={{height: "24px", width: "24px", color: "#4F46E5"}} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span style={{marginLeft: "12px", fontSize: "14px", color: "#6B7280"}}>Loading graphs...</span>
        </div>
      )}
      
      {/* Error state */}
      {error && (
        <div style={{
          margin: "12px",
          padding: "12px",
          backgroundColor: "#FEF2F2",
          borderLeft: "4px solid #EF4444",
          borderRadius: "4px"
        }}>
          <p style={{margin: 0, fontSize: "13px", color: "#B91C1C"}}>{error}</p>
        </div>
      )}
      
      {/* Empty state */}
      {!loading && savedGraphs.length === 0 && !error && (
        <div style={{
          padding: "24px",
          textAlign: "center",
          backgroundColor: "#F9FAFB"
        }}>
          <svg style={{height: "32px", width: "32px", color: "#9CA3AF", margin: "0 auto 12px"}} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
          <p style={{fontSize: "14px", color: "#6B7280", marginBottom: "16px"}}>
            No saved graphs yet
          </p>
          <p style={{fontSize: "13px", color: "#9CA3AF"}}>
            Save your graphs to access them later
          </p>
        </div>
      )}

      {/* List of saved graphs */}
      {savedGraphs.length > 0 && (
        <div style={{
          maxHeight: "350px",
          overflowY: "auto",
          backgroundColor: "white"
        }}>
          {savedGraphs.map(graph => (
            <div 
              key={graph.id}
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid #E5E7EB",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                transition: "background-color 0.2s",
                backgroundColor: loadingGraphId === graph.id ? "#F3F4F6" : "white",
                cursor: "pointer"
              }}
              onClick={() => handleLoadGraph(graph.id)}
            >
              <div style={{flexGrow: 1, overflow: "hidden"}}>
                <div style={{
                  fontWeight: "500", 
                  fontSize: "14px", 
                  color: loadingGraphId === graph.id ? "#4F46E5" : "#111827",
                  marginBottom: "4px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}>
                  {loadingGraphId === graph.id ? 'Loading...' : getGraphTitle(graph)}
                </div>
                <div style={{display: "flex", alignItems: "center", fontSize: "12px", color: "#6B7280"}}>
                  <span style={{marginRight: "8px", display: "flex", alignItems: "center"}}>
                    <svg style={{marginRight: "3px", height: "12px", width: "12px"}} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {formatDate(graph.created_at)}
                  </span>
                  <span style={{display: "flex", alignItems: "center"}}>
                    <svg style={{marginRight: "3px", height: "12px", width: "12px"}} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    {getGraphStats(graph)}
                  </span>
                </div>
              </div>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openDeleteConfirm(graph, e);
                }}
                style={{
                  backgroundColor: "#F3F4F6",
                  color: "#EF4444",
                  border: "none",
                  borderRadius: "4px",
                  padding: "6px 10px",
                  fontSize: "13px",
                  fontWeight: "500",
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                  opacity: deletingGraphId === graph.id ? 0.5 : 1
                }}
                disabled={deletingGraphId === graph.id}
                title="Delete this saved graph"
              >
                <svg style={{marginRight: "4px", height: "14px", width: "14px"}} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && graphToDelete && (
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete Graph
              </h3>
              
              <p style={{
                fontSize: "14px",
                color: "#4B5563",
                marginBottom: "20px"
              }}>
                Are you sure you want to delete "{getGraphTitle(graphToDelete)}"? This action cannot be undone.
              </p>
              
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  onClick={cancelDelete}
                  style={{
                    backgroundColor: "#F3F4F6",
                    padding: "8px 16px",
                    color: "#374151",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "14px",
                    fontWeight: "500"
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  style={{
                    backgroundColor: "#EF4444",
                    padding: "8px 16px",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "14px",
                    fontWeight: "500",
                    display: "flex",
                    alignItems: "center"
                  }}
                  disabled={deletingGraphId === graphToDelete.id}
                >
                  {deletingGraphId === graphToDelete.id ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Deleting...
                    </>
                  ) : (
                    'Delete Graph'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SavedGraphsList;