export default function NeighborsList({ 
    graphData, 
    nodeById, 
    selectedNode, 
    onNodeSelect 
  }) {
    if (!graphData || !selectedNode) {
      return (
        <div className="py-3 text-gray-500 text-center italic">
          Select a node to see connected papers
        </div>
      );
    }
  
    // Find connected nodes
    const connectedNodes = [];
    
    graphData.edges.forEach(link => {
      // Get source and target IDs
      const sourceId = link.source.id || link.source;
      const targetId = link.target.id || link.target;
      
      // Check if this link involves the selected node
      if (sourceId === selectedNode.id) {
        const targetNode = nodeById.get(targetId);
        if (targetNode) {
          connectedNodes.push({
            node: targetNode,
            relationship: link.type === 'cites' ? 'cites' : 'authored by',
            direction: 'outgoing'
          });
        }
      } else if (targetId === selectedNode.id) {
        const sourceNode = nodeById.get(sourceId);
        if (sourceNode) {
          connectedNodes.push({
            node: sourceNode,
            relationship: link.type === 'cites' ? 'cited by' : 'author of',
            direction: 'incoming'
          });
        }
      }
    });
  
    // Group by relationship type
    const grouped = {
      'cites': connectedNodes.filter(c => c.relationship === 'cites'),
      'cited by': connectedNodes.filter(c => c.relationship === 'cited by'),
      'authored by': connectedNodes.filter(c => c.relationship === 'authored by'),
      'author of': connectedNodes.filter(c => c.relationship === 'author of')
    };
    
    if (connectedNodes.length === 0) {
      return (
        <div className="py-3 text-gray-500 text-center italic">
          No connected nodes found
        </div>
      );
    }
  
    return (
      <div className="space-y-4">
        <div className="text-xs text-gray-500 mb-2">
          {connectedNodes.length} connected {connectedNodes.length === 1 ? 'node' : 'nodes'}
        </div>
        
        {Object.entries(grouped).map(([relation, connections]) => {
          if (connections.length === 0) return null;
          
          return (
            <div key={relation} className="space-y-1">
              <h3 className="text-sm font-medium text-gray-700 capitalize mb-1">{relation}</h3>
              
              {connections.map(({ node }) => (
                <div 
                  key={node.id}
                  className="p-2 rounded-md cursor-pointer hover:bg-gray-100 transition"
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
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  }