export default function SearchResults({ 
    graphData, 
    nodeById, 
    selectedNode, 
    onNodeSelect, 
    highlightedNodes 
  }) {
    if (!graphData || !graphData.nodes) {
      return (
        <div className="py-3 text-gray-500 text-center italic">
          Upload a JSON file to see results
        </div>
      );
    }
  
    // Filter to show highlighted nodes or all nodes if no highlights
    const nodes = graphData.nodes.filter(node => {
      if (!highlightedNodes || Object.values(highlightedNodes).every(v => !v)) {
        return true;
      }
      
      const isHighlighted = highlightedNodes.has?.(node.id);
      return isHighlighted;
    });
    
    // Sort papers by year (newest first)
    const sortedNodes = [...nodes].sort((a, b) => {
      // First sort by type (papers first)
      if (a.type !== b.type) {
        return a.type === 'paper' ? -1 : 1;
      }
      
      // For papers, sort by year
      if (a.type === 'paper' && b.type === 'paper' && a.year && b.year) {
        return b.year - a.year;
      }
      
      // For authors, sort by name
      if (a.type === 'author' && b.type === 'author') {
        return (a.name || '').localeCompare(b.name || '');
      }
      
      return 0;
    });
  
    if (sortedNodes.length === 0) {
      return (
        <div className="py-3 text-gray-500 text-center italic">
          No matching nodes found
        </div>
      );
    }
  
    return (
      <div className="space-y-1">
        <div className="text-xs text-gray-500 mb-2">
          Showing {sortedNodes.length} {sortedNodes.length === 1 ? 'result' : 'results'}
        </div>
        
        {sortedNodes.map(node => (
          <div 
            key={node.id}
            className={`p-2 rounded-md cursor-pointer hover:bg-gray-100 transition ${
              selectedNode && selectedNode.id === node.id ? 'bg-blue-50 border border-blue-200' : ''
            }`}
            onClick={() => onNodeSelect(node)}
          >
            <div className="flex items-start">
              <span className={`inline-block w-5 h-5 rounded-full mr-2 mt-0.5 flex-shrink-0 ${
                node.type === 'paper' ? 'bg-sky-200' : 'bg-green-200'
              }`}>
                {node.type === 'paper' ? '📄' : '👤'}
              </span>
              <div>
                <div className="font-medium truncate" title={node.title || node.name || node.id}>
                  {node.title || node.name || node.id}
                </div>
                
                {node.type === 'paper' && (
                  <div className="text-xs text-gray-500">
                    {node.year && <span>{node.year} · </span>}
                    {typeof node.citation_count !== 'undefined' && (
                      <span>{node.citation_count} citation{node.citation_count !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                )}
                
                {node.type === 'author' && node.originalData?.affiliations && (
                  <div className="text-xs text-gray-500 truncate" title={getAffiliationsText(node)}>
                    {getAffiliationsText(node)}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }
  
  // Helper function to get affiliations text
  function getAffiliationsText(node) {
    if (!node.originalData?.affiliations) return '';
    
    let affiliations = node.originalData.affiliations;
    if (typeof affiliations === 'string') {
      try {
        affiliations = JSON.parse(affiliations);
      } catch (e) {
        return affiliations;
      }
    }
    
    if (Array.isArray(affiliations)) {
      return affiliations.join(', ');
    }
    
    return String(affiliations);
  }