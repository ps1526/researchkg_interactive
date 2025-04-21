import { useState, useRef, useEffect } from 'react';
import SearchResults from './SearchResults';
import NeighborsList from './NeighborsList';
import AuthorLeaderboard from './AuthorLeaderboard';
import CycleAnalysis from './CycleAnalysis';

// Default empty filter state to prevent undefined errors
const DEFAULT_FILTERS = {
  searchTerm: '',
  nodeType: 'all',
  minYear: '',
  authorName: '',
  fieldsOfStudy: '',
  isOpenAccess: false,
  highlighted: new Set()
};

export default function ResizableSidebar({
  onFileUpload,
  graphData,
  nodeById,
  selectedNode,
  onNodeSelect,
  filterOptions = DEFAULT_FILTERS, // Provide default value
  onFilterChange,
  onToggleCycles,
  showCycles,
  onReset,
  cycleCount
}) {
  // State for sidebar width and drag operation
  const [width, setWidth] = useState(320); // Initial width
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState('search');
  const [localFilters, setLocalFilters] = useState({...DEFAULT_FILTERS, ...filterOptions});
  const [statsData, setStatsData] = useState({
    paperCount: 0,
    authorCount: 0,
    citationCount: 0,
    avgCitations: 0
  });
  // Add state for calculated author rankings
  const [calculatedRankings, setCalculatedRankings] = useState(null);

  // Refs for drag operation
  const sidebarRef = useRef(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Update local filters when props change, with null safety
  useEffect(() => {
    if (filterOptions) {
      setLocalFilters({...DEFAULT_FILTERS, ...filterOptions});
    }
  }, [filterOptions]);
  
  // Calculate stats and generate author rankings if they don't exist
  useEffect(() => {
    if (!graphData || !graphData.nodes || !graphData.edges) return;
    
    // Calculate basic stats
    let papers = 0;
    let authors = 0;
    let totalCitations = 0;
    
    // For author rankings
    const authorMap = new Map();
    
    graphData.nodes.forEach(node => {
      if (node.type === 'paper') {
        papers++;
        totalCitations += node.citation_count || 0;
      } else if (node.type === 'author') {
        authors++;
        // Initialize author data for rankings
        authorMap.set(node.id, {
          id: node.id,
          name: node.name || node.id,
          papers: 0,
          citations: 0,
          node: node // Store the original node
        });
      }
    });
    
    // Calculate author ranking if not already present in graphData
    if (!graphData.rankings) {
      console.log("Calculating author rankings as they weren't provided by the backend");
      
      // Find authored edges to connect authors to papers
      graphData.edges.forEach(edge => {
        if (edge.type === 'authored') {
          // Get source and target IDs, handling both string IDs and object references
          const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source;
          const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target;
          
          // The source should be the author, target should be the paper
          const author = authorMap.get(sourceId);
          
          if (author) {
            author.papers++;
            
            // Find the paper node to get its citation count
            const paperNode = graphData.nodes.find(node => node.id === targetId);
            if (paperNode && paperNode.type === 'paper') {
              author.citations += paperNode.citation_count ? Number(paperNode.citation_count) : 0;
            }
          }
        }
      });
      
      // Function to calculate h-index for an author
      const calculateHIndex = (authorId) => {
        // Get all papers authored by this author
        const authoredPaperIds = [];
        
        graphData.edges.forEach(edge => {
          if (edge.type === 'authored') {
            const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source;
            if (sourceId === authorId) {
              const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target;
              authoredPaperIds.push(targetId);
            }
          }
        });
        
        // Get citation counts for these papers
        const citationCounts = [];
        authoredPaperIds.forEach(paperId => {
          const paperNode = graphData.nodes.find(node => node.id === paperId);
          if (paperNode && paperNode.type === 'paper') {
            citationCounts.push(paperNode.citation_count || 0);
          }
        });
        
        // Calculate h-index
        citationCounts.sort((a, b) => b - a);
        let hIndex = 0;
        for (let i = 0; i < citationCounts.length; i++) {
          if (citationCounts[i] >= i + 1) {
            hIndex = i + 1;
          } else {
            break;
          }
        }
        
        return hIndex;
      };
      
      // Function to get most cited papers
      const getMostCitedPapers = (limit = 10) => {
        return graphData.nodes
          .filter(node => node.type === 'paper')
          .sort((a, b) => (b.citation_count || 0) - (a.citation_count || 0))
          .slice(0, limit)
          .map((paper, index) => ({
            id: paper.id,
            title: paper.title || 'Untitled Paper',
            year: paper.year,
            citations: paper.citation_count || 0
          }));
      };
      
      // Create by_citations array
      const byCitations = Array.from(authorMap.values())
        .filter(author => author.papers > 0)
        .map(author => {
          const hIndex = calculateHIndex(author.id);
          return {
            id: author.id,
            name: author.name,
            total_citations: author.citations,
            paper_count: author.papers,
            h_index: hIndex
          };
        })
        .sort((a, b) => b.total_citations - a.total_citations);
      
      // Create by_papers array (same authors, different sort)
      const byPapers = [...byCitations]
        .sort((a, b) => b.paper_count - a.paper_count);
      
      // Create by_h_index array (same authors, different sort)
      const byHIndex = [...byCitations]
        .sort((a, b) => b.h_index - a.h_index);
      
      // Create the format expected by the AuthorLeaderboard component
      const formattedRankings = {
        authors: {
          by_citations: byCitations,
          by_papers: byPapers,
          by_h_index: byHIndex
        },
        papers: {
          most_cited: getMostCitedPapers()
        }
      };
      
      setCalculatedRankings(formattedRankings);
      console.log(`Generated rankings for ${byCitations.length} authors`);
    }
    
    setStatsData({
      paperCount: papers,
      authorCount: authors,
      citationCount: graphData.edges.filter(e => e.type === 'cites').length,
      avgCitations: papers > 0 ? (totalCitations / papers).toFixed(2) : 0
    });
  }, [graphData]);

  // Handle mouse down for starting resize
  const handleMouseDown = (e) => {
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none'; // Prevent text selection while dragging
  };

  // Setup mouse move and up listeners for resizing
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging) {
        // For right edge drag, we're resizing from the right edge
        // So we add the difference to the width
        const newWidth = startWidthRef.current + (e.clientX - startXRef.current);
        
        // Set min and max width limits
        if (newWidth > 250 && newWidth < 600) {
          setWidth(newWidth);
        }
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto'; // Restore text selection
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);
  
  // Handle filter changes
  const handleFilterChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    
    const newFilters = {
      ...localFilters,
      [name]: newValue
    };
    
    setLocalFilters(newFilters);
  };
  
  // Apply filters with null safety
  const applyFilters = () => {
    if (onFilterChange) {
      onFilterChange(localFilters);
    }
  };
  
  // Reset filters
  const resetFilters = () => {
    const emptyFilters = {
      ...DEFAULT_FILTERS
    };
    
    setLocalFilters(emptyFilters);
    
    if (onFilterChange) {
      onFilterChange(emptyFilters);
    }
  };
  
  // Handle author click for highlighting
  const handleAuthorClick = (author) => {
    if (!author || !graphData) return;
    
    // Get the actual author node data from nodeById if available
    const authorNode = nodeById ? nodeById.get(author.id) : author;
    
    // Set the author as selected node
    if (onNodeSelect) {
      onNodeSelect(authorNode || author);
    }
    
    // Find all papers by this author and highlight them
    const authorPapers = new Set();
    
    // Add the author node itself
    authorPapers.add(author.id);
    
    // Find edges connecting author to papers
    if (graphData && graphData.edges) {
      graphData.edges.forEach(edge => {
        if (edge.type === 'authored') {
          const sourceId = typeof edge.source === 'object' ? edge.source.id : edge.source;
          if (sourceId === author.id) {
            const targetId = typeof edge.target === 'object' ? edge.target.id : edge.target;
            authorPapers.add(targetId);
          }
        }
      });
    }
    
    // Create a filter that highlights these papers
    const highlightFilter = {
      ...localFilters,
      highlighted: authorPapers
    };
    
    setLocalFilters(highlightFilter);
    
    if (onFilterChange) {
      onFilterChange(highlightFilter);
    }
  };

  // Get rankings to display - use calculated ones if none provided by backend
  // This will handle null cases properly
  const hasAuthorRankings = !!(
    (graphData?.rankings && graphData.rankings.authors) || 
    (calculatedRankings && calculatedRankings.authors)
  );

  // FIX: Check for cycles in both places they might exist
  const hasCycleAnalysis = graphData?.cycle_analysis != null;
  const hasCycles = graphData?.cycles?.length > 0 || graphData?.cycle_analysis?.cycles?.length > 0;
  
  // FIX: Determine cycle count properly
  const actualCycleCount = cycleCount || 
    (graphData?.cycle_analysis?.count) || 
    (graphData?.cycles?.length) || 
    0;

  return (
    <div 
      ref={sidebarRef} 
      style={{
        width: `${width}px`,
        height: '100%',
        backgroundColor: 'white',
        borderRight: '1px solid #e5e7eb',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: isDragging ? 'none' : 'width 0.15s ease'
      }}
    >
      {/* Resize handle on the right edge */}
      <div 
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: '5px',
          cursor: 'ew-resize',
          zIndex: 10
        }}
        onMouseDown={handleMouseDown}
      ></div>
      
      {/* Sidebar content container with padding */}
      <div style={{
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden'
      }}>
        {/* Tab navigation */}
        <div style={{
          marginBottom: '16px',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <div style={{
            display: 'flex',
            marginBottom: '-1px'
          }}>
            <button
              style={{
                padding: '8px 16px',
                fontWeight: '500',
                fontSize: '14px',
                outline: 'none',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: activeTab === 'search' ? '#2563eb' : '#6b7280',
                borderBottom: activeTab === 'search' ? '2px solid #2563eb' : 'none'
              }}
              onClick={() => setActiveTab('search')}
            >
              Search
            </button>
            <button
              style={{
                padding: '8px 16px',
                fontWeight: '500',
                fontSize: '14px',
                outline: 'none',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: activeTab === 'neighbors' ? '#2563eb' : '#6b7280',
                borderBottom: activeTab === 'neighbors' ? '2px solid #2563eb' : 'none',
                opacity: !selectedNode ? 0.5 : 1
              }}
              onClick={() => setActiveTab('neighbors')}
              disabled={!selectedNode}
            >
              Neighbors
            </button>
            <button
              style={{
                padding: '8px 16px',
                fontWeight: '500',
                fontSize: '14px',
                outline: 'none',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: activeTab === 'authors' ? '#2563eb' : '#6b7280',
                borderBottom: activeTab === 'authors' ? '2px solid #2563eb' : 'none'
              }}
              onClick={() => setActiveTab('authors')}
            >
              Authors
            </button>
            <button
              style={{
                padding: '8px 16px',
                fontWeight: '500',
                fontSize: '14px',
                outline: 'none', 
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: activeTab === 'cycles' ? '#2563eb' : '#6b7280',
                borderBottom: activeTab === 'cycles' ? '2px solid #2563eb' : 'none'
              }}
              onClick={() => setActiveTab('cycles')}
            >
              Cycles
            </button>
          </div>
        </div>
        
        {/* Display controls */}
        <div style={{
          marginBottom: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{
            display: 'flex',
            gap: '8px'
          }}>
            <button 
              onClick={onReset}
              style={{
                flex: 1,
                padding: '8px 16px',
                backgroundColor: '#f3f4f6',
                color: '#4b5563',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px',
                opacity: !graphData ? 0.5 : 1
              }}
              disabled={!graphData}
            >
              Reset View
            </button>
            <button 
              onClick={onToggleCycles}
              style={{
                flex: 1,
                padding: '8px 16px',
                backgroundColor: showCycles ? '#f59e0b' : '#f3f4f6',
                color: showCycles ? 'white' : '#4b5563',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '14px',
                // FIX: Use actualCycleCount instead of cycleCount
                opacity: !graphData || actualCycleCount === 0 ? 0.5 : 1
              }}
              disabled={!graphData || actualCycleCount === 0}
            >
              {showCycles ? 'Hide Cycles' : 'Show Cycles'}
            </button>
          </div>
          {/* FIX: Show cycle count if any cycles exist */}
          {graphData && actualCycleCount > 0 && (
            <p style={{
              fontSize: '12px',
              color: '#6b7280'
            }}>
              {actualCycleCount} citation cycles found
            </p>
          )}
        </div>
        
        {/* Search and filters - only show in search tab */}
        {activeTab === 'search' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            marginBottom: '16px'
          }}>
            <h2 style={{
              fontWeight: '600',
              fontSize: '16px',
              color: '#111827'
            }}>
              Search & Filters
            </h2>
            
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                color: '#4b5563',
                marginBottom: '4px'
              }}>
                Search Term
              </label>
              <input 
                type="text" 
                name="searchTerm"
                value={localFilters.searchTerm || ''}
                onChange={handleFilterChange}
                placeholder="Search papers by title, abstract..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  outline: 'none',
                  fontSize: '14px'
                }}
              />
            </div>
            
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                color: '#4b5563',
                marginBottom: '4px'
              }}>
                Author Name
              </label>
              <input 
                type="text" 
                name="authorName"
                value={localFilters.authorName || ''}
                onChange={handleFilterChange}
                placeholder="Search by author name"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  outline: 'none',
                  fontSize: '14px'
                }}
              />
            </div>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px'
            }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#4b5563',
                  marginBottom: '4px'
                }}>
                  Node Type
                </label>
                <select 
                  name="nodeType"
                  value={localFilters.nodeType || 'all'}
                  onChange={handleFilterChange}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    outline: 'none',
                    fontSize: '14px',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="all">All</option>
                  <option value="paper">Papers Only</option>
                  <option value="author">Authors Only</option>
                </select>
              </div>
              
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#4b5563',
                  marginBottom: '4px'
                }}>
                  Min Year
                </label>
                <input 
                  type="number" 
                  name="minYear"
                  value={localFilters.minYear || ''}
                  onChange={handleFilterChange}
                  placeholder="Min Year"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    outline: 'none',
                    fontSize: '14px'
                  }}
                />
              </div>
            </div>
            
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: '500',
                color: '#4b5563',
                marginBottom: '4px'
              }}>
                Fields of Study
              </label>
              <input 
                type="text" 
                name="fieldsOfStudy"
                value={localFilters.fieldsOfStudy || ''}
                onChange={handleFilterChange}
                placeholder="e.g. Computer Science, Physics"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  outline: 'none',
                  fontSize: '14px'
                }}
              />
              <p style={{
                fontSize: '12px',
                color: '#6b7280',
                marginTop: '4px'
              }}>
                Separate with commas
              </p>
            </div>
            
            <div style={{
              display: 'flex',
              alignItems: 'center'
            }}>
              <input 
                type="checkbox" 
                id="isOpenAccess" 
                name="isOpenAccess"
                checked={localFilters.isOpenAccess || false}
                onChange={handleFilterChange}
                style={{
                  height: '16px',
                  width: '16px',
                  borderRadius: '4px',
                  border: '1px solid #d1d5db'
                }}
              />
              <label 
                htmlFor="isOpenAccess" 
                style={{
                  marginLeft: '8px',
                  fontSize: '14px',
                  color: '#4b5563'
                }}
              >
                Open Access Only
              </label>
            </div>
            
            <div style={{
              display: 'flex',
              gap: '8px'
            }}>
              <button 
                onClick={applyFilters}
                style={{
                  flex: 1,
                  padding: '8px 16px',
                  backgroundColor: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '14px'
                }}
              >
                Apply Filters
              </button>
              <button 
                onClick={resetFilters}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f3f4f6',
                  color: '#4b5563',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '14px'
                }}
              >
                Reset
              </button>
            </div>
          </div>
        )}
        
        {/* Tab content - Scrollable area */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          marginBottom: '16px'
        }}>
          {activeTab === 'search' && graphData && (
            <SearchResults 
              graphData={graphData}
              nodeById={nodeById}
              selectedNode={selectedNode}
              onNodeSelect={onNodeSelect}
              highlightedNodes={localFilters.highlighted}
            />
          )}
          
          {activeTab === 'neighbors' && graphData && selectedNode && (
            <NeighborsList 
              graphData={graphData}
              nodeById={nodeById}
              selectedNode={selectedNode}
              onNodeSelect={onNodeSelect}
            />
          )}
          
          {activeTab === 'authors' && (
            <AuthorLeaderboard 
              rankings={graphData?.rankings || calculatedRankings}
              onAuthorClick={handleAuthorClick}
            />
          )}
          
          {/* FIX: Simplified cycle tab logic */}
          {activeTab === 'cycles' && graphData && (
            hasCycleAnalysis ? (
              <CycleAnalysis 
                cycleAnalysis={graphData.cycle_analysis}
                onToggleCycles={onToggleCycles}
                showCycles={showCycles}
              />
            ) : hasCycles ? (
              <CycleAnalysis 
                cycleAnalysis={{
                  count: actualCycleCount,
                  length_distribution: {},
                  avg_length: 0,
                  max_length: 0,
                  min_length: 0
                }}
                onToggleCycles={onToggleCycles}
                showCycles={showCycles}
              />
            ) : (
              <div style={{
                padding: '16px',
                color: '#6b7280',
                textAlign: 'center'
              }}>
                <p>No citation cycles found in this graph.</p>
                <p style={{
                  fontSize: '14px',
                  marginTop: '8px'
                }}>
                  Citation cycles occur when papers form a loop of references to each other.
                </p>
              </div>
            )
          )}
        </div>
        
        {/* Statistics footer */}
        {graphData && (
          <div style={{
            padding: '12px',
            borderTop: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb',
            borderRadius: '6px',
            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.05)'
          }}>
            <h3 style={{
              fontSize: '12px',
              fontWeight: '600',
              color: '#4b5563',
              marginBottom: '8px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              Graph Statistics
            </h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px'
            }}>
              <div style={{
                backgroundColor: 'white',
                padding: '8px',
                borderRadius: '6px',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
              }}>
                <p style={{
                  fontSize: '12px',
                  color: '#6b7280'
                }}>
                  Papers
                </p>
                <p style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#111827'
                }}>
                  {statsData.paperCount}
                </p>
              </div>
              <div style={{
                backgroundColor: 'white',
                padding: '8px',
                borderRadius: '6px',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
              }}>
                <p style={{
                  fontSize: '12px',
                  color: '#6b7280'
                }}>
                  Authors
                </p>
                <p style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#111827'
                }}>
                  {statsData.authorCount}
                </p>
              </div>
              <div style={{
                backgroundColor: 'white',
                padding: '8px',
                borderRadius: '6px',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
              }}>
                <p style={{
                  fontSize: '12px',
                  color: '#6b7280'
                }}>
                  Citations
                </p>
                <p style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#111827'
                }}>
                  {statsData.citationCount}
                </p>
              </div>
              <div style={{
                backgroundColor: 'white',
                padding: '8px',
                borderRadius: '6px',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
              }}>
                <p style={{
                  fontSize: '12px',
                  color: '#6b7280'
                }}>
                  Avg Citations/Paper
                </p>
                <p style={{
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#111827'
                }}>
                  {statsData.avgCitations}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}