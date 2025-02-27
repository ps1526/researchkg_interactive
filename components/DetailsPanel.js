export default function DetailsPanel({ node, nodeById, graphData }) {
    if (!node || typeof node !== 'object') {
      return (
        <div style={{
          height: "150px", 
          backgroundColor: "white", 
          borderTop: "1px solid #e5e7eb",
          padding: "16px",
          overflow: "auto"
        }}>
          <p>Select a node to view details</p>
        </div>
      );
    }

    const nodeType = node.type || 'unknown';
    const nodeTitle = node.title || node.name || node.id || 'Unknown';
    const nodeAbstract = node.abstract || '';
    const nodeYear = node.year || '';
    const nodeVenue = node.venue || '';

  
    // Get citation context if available
    const getCitationContexts = () => {
      if (!graphData || !node || node.type !== 'paper') return [];
      
      const contexts = [];
      
      graphData.edges.forEach(edge => {
        if (edge.type !== 'cites') return;
        
        const sourceId = edge.source.id || edge.source;
        const targetId = edge.target.id || edge.target;
        
        // If this paper is cited by another paper
        if (targetId === node.id && edge.contexts) {
          const citingPaper = nodeById.get(sourceId);
          if (citingPaper) {
            let contextList = edge.contexts;
            if (typeof contextList === 'string') {
              try {
                contextList = JSON.parse(contextList);
              } catch (e) {
                contextList = [contextList];
              }
            }
            
            if (Array.isArray(contextList) && contextList.length > 0) {
              contexts.push({
                paper: citingPaper,
                contexts: contextList
              });
            }
          }
        }
      });
      
      return contexts;
    };
  
    // Get authors if available
    const getAuthors = () => {
      if (!graphData || !node || node.type !== 'paper') return [];
      
      const authors = [];
      
      graphData.edges.forEach(edge => {
        if (edge.type !== 'authored') return;
        
        const sourceId = edge.source.id || edge.source;
        const targetId = edge.target.id || edge.target;
        
        // If this paper has an author
        if (targetId === node.id) {
          const author = nodeById.get(sourceId);
          if (author) {
            authors.push(author);
          }
        }
      });
      
      return authors;
    };
  
    const authorList = getAuthors();
    const citationContexts = getCitationContexts();
  
    return (
      <div style={{
        height: "200px", 
        backgroundColor: "white", 
        borderTop: "1px solid #e5e7eb",
        padding: "16px",
        overflow: "auto"
      }}>
        <div style={{display: "flex", alignItems: "center", marginBottom: "12px"}}>
          <span style={{
            display: "inline-block",
            width: "24px",
            height: "24px",
            borderRadius: "50%",
            marginRight: "12px",
            flexShrink: 0,
            backgroundColor: nodeType === 'paper' ? "#87CEEB" : "#90EE90"
          }}>
            {nodeType === 'paper' ? '📄' : '👤'}
          </span>
          <h2 style={{fontSize: "18px", fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>
            {nodeTitle}
          </h2>
        </div>
        
        {nodeType === 'paper' && (
          <div style={{marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px"}}>
            {nodeYear && (
              <div>
                <h3 style={{fontSize: "14px", fontWeight: "600", color: "#4b5563", marginBottom: "2px"}}>Year</h3>
                <p style={{fontSize: "14px", color: "#6b7280"}}>{nodeYear}</p>
              </div>
            )}
            
            {nodeVenue && (
              <div>
                <h3 style={{fontSize: "14px", fontWeight: "600", color: "#4b5563", marginBottom: "2px"}}>Venue</h3>
                <p style={{fontSize: "14px", color: "#6b7280"}}>{nodeVenue}</p>
              </div>
            )}
            
            {nodeAbstract && (
              <div>
                <h3 style={{fontSize: "14px", fontWeight: "600", color: "#4b5563", marginBottom: "2px"}}>Abstract</h3>
                <p style={{
                  fontSize: "14px", 
                  color: "#6b7280",
                  display: "-webkit-box",
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden"
                }}>{nodeAbstract}</p>
              </div>
            )}
            
            {/* Add any other paper details as needed */}
          </div>
        )}
        
        {nodeType === 'author' && (
          <div style={{marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px"}}>
            {/* Author specific details */}
            {node.originalData?.affiliations && (
              <div>
                <h3 style={{fontSize: "14px", fontWeight: "600", color: "#4b5563", marginBottom: "2px"}}>Affiliations</h3>
                <p style={{fontSize: "14px", color: "#6b7280"}}>{getAffiliationsText(node)}</p>
              </div>
            )}
          </div>
        )}
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

   // Helper function to get fields of study
   function getFieldsOfStudy(node) {
    if (!node.fields_of_study) return [];
    
    let fields = node.fields_of_study;
    if (typeof fields === 'string') {
      try {
        fields = JSON.parse(fields);
      } catch (e) {
        return [fields];
      }
    }
    
    if (Array.isArray(fields)) {
      return fields;
    }
    
    return [String(fields)];
  }