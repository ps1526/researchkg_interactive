import { useState, useRef, useEffect } from 'react';

export default function ResizableDetailsPanel({ node, nodeById, graphData }) {
  const [width, setWidth] = useState(320); // Initial width
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Early return with a message if node is null or invalid
  if (!node || typeof node !== 'object') {
    return null;
  }

  // Handler for starting the resize
  const handleMouseDown = (e) => {
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none'; // Prevent text selection while dragging
  };

  // Setup mouse move and up listeners
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging) {
        const newWidth = startWidthRef.current - (e.clientX - startXRef.current);
        // Set min and max width limits
        if (newWidth > 200 && newWidth < 600) {
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

  // Safe access of properties
  const nodeType = node.type || 'unknown';
  const nodeTitle = node.title || node.name || node.id || 'Unknown';
  const nodeAbstract = node.abstract || '';
  const nodeYear = node.year || '';
  const nodeVenue = node.venue || '';
  const citationCount = node.citation_count || 0;
  const referenceCount = node.reference_count || 0;
  const fieldsOfStudy = getFieldsOfStudy(node);
  const isOpenAccess = node.is_open_access || false;
  const url = node.url || '';

  // Get authors if available
  const getAuthors = () => {
    if (!graphData || !node || node.type !== 'paper') return [];
    
    const authors = [];
    
    graphData.edges && graphData.edges.forEach(edge => {
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

  return (
    <div ref={panelRef} style={{
      width: `${width}px`,
      height: '100%',
      backgroundColor: 'white',
      borderLeft: '1px solid #e5e7eb',
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Resize handle */}
      <div 
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '5px',
          cursor: 'ew-resize',
          zIndex: 10
        }}
        onMouseDown={handleMouseDown}
      ></div>
      
      {/* Header with title */}
      <div style={{
        padding: '16px',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        background: '#f9fafb'
      }}>
        <span style={{
          display: 'inline-block',
          width: '24px',
          height: '24px',
          borderRadius: '50%',
          marginRight: '12px',
          flexShrink: 0,
          backgroundColor: nodeType === 'paper' ? "#87CEEB" : "#90EE90",
          textAlign: 'center',
          lineHeight: '24px'
        }}>
          {nodeType === 'paper' ? '📄' : '👤'}
        </span>
        <h2 style={{
          fontSize: '18px',
          fontWeight: 'bold',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1
        }}>
          {nodeTitle}
        </h2>
      </div>
      
      {/* Scrollable content area */}
      <div style={{
        padding: '16px',
        overflowY: 'auto',
        flex: 1
      }}>
        {nodeType === 'paper' && (
          <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
            {authorList.length > 0 && (
              <div>
                <h3 style={{fontSize: '16px', fontWeight: '600', color: '#4b5563', marginBottom: '8px'}}>Authors</h3>
                <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px'}}>
                  {authorList.map(author => (
                    <span key={author.id} style={{
                      padding: '4px 10px',
                      backgroundColor: '#e2f0e2',
                      color: '#2d662d',
                      borderRadius: '9999px',
                      fontSize: '14px'
                    }}>
                      {author.name || author.id}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            <div style={{display: 'flex', gap: '16px', flexWrap: 'wrap'}}>
              {nodeYear && (
                <div style={{minWidth: '80px'}}>
                  <h3 style={{fontSize: '14px', fontWeight: '600', color: '#4b5563', marginBottom: '4px'}}>Year</h3>
                  <p style={{fontSize: '14px', color: '#6b7280'}}>{nodeYear}</p>
                </div>
              )}
              
              {citationCount > 0 && (
                <div style={{minWidth: '80px'}}>
                  <h3 style={{fontSize: '14px', fontWeight: '600', color: '#4b5563', marginBottom: '4px'}}>Citations</h3>
                  <p style={{fontSize: '14px', color: '#6b7280'}}>{citationCount}</p>
                </div>
              )}
              
              {referenceCount > 0 && (
                <div style={{minWidth: '80px'}}>
                  <h3 style={{fontSize: '14px', fontWeight: '600', color: '#4b5563', marginBottom: '4px'}}>References</h3>
                  <p style={{fontSize: '14px', color: '#6b7280'}}>{referenceCount}</p>
                </div>
              )}
            </div>
            
            {nodeVenue && (
              <div>
                <h3 style={{fontSize: '14px', fontWeight: '600', color: '#4b5563', marginBottom: '4px'}}>Venue</h3>
                <p style={{fontSize: '14px', color: '#6b7280'}}>{nodeVenue}</p>
              </div>
            )}
            
            {fieldsOfStudy.length > 0 && (
              <div>
                <h3 style={{fontSize: '14px', fontWeight: '600', color: '#4b5563', marginBottom: '8px'}}>Fields of Study</h3>
                <div style={{display: 'flex', flexWrap: 'wrap', gap: '6px'}}>
                  {fieldsOfStudy.map((field, i) => (
                    <span key={i} style={{
                      padding: '4px 10px',
                      backgroundColor: '#e0f2fe',
                      color: '#0369a1',
                      borderRadius: '9999px',
                      fontSize: '14px'
                    }}>
                      {field}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {nodeAbstract && (
              <div>
                <h3 style={{fontSize: '14px', fontWeight: '600', color: '#4b5563', marginBottom: '4px'}}>Abstract</h3>
                <p style={{fontSize: '14px', color: '#6b7280', lineHeight: '1.5'}}>{nodeAbstract}</p>
              </div>
            )}
            
            {isOpenAccess && (
              <div>
                <h3 style={{fontSize: '14px', fontWeight: '600', color: '#4b5563', marginBottom: '4px'}}>Open Access</h3>
                <p style={{fontSize: '14px', color: '#6b7280'}}>
                  This paper is open access
                  {node.originalData?.open_access_pdf_url && (
                    <a 
                      href={node.originalData.open_access_pdf_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{marginLeft: '8px', color: '#3b82f6', textDecoration: 'underline'}}
                    >
                      Download PDF
                    </a>
                  )}
                </p>
              </div>
            )}
            
            {url && (
              <div style={{marginTop: '8px'}}>
                <a 
                  href={url}
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{color: '#3b82f6', textDecoration: 'underline', fontSize: '14px'}} 
                >
                  View Paper
                </a>
              </div>
            )}
          </div>
        )}
        
        {nodeType === 'author' && (
          <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
            {node.originalData?.affiliations && (
              <div>
                <h3 style={{fontSize: '16px', fontWeight: '600', color: '#4b5563', marginBottom: '8px'}}>Affiliations</h3>
                <p style={{fontSize: '14px', color: '#6b7280'}}>{getAffiliationsText(node)}</p>
              </div>
            )}
            
            {url && (
              <div style={{marginTop: '8px'}}>
                <a 
                  href={url}
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{color: '#3b82f6', textDecoration: 'underline', fontSize: '14px'}}
                >
                  View on Semantic Scholar
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper functions
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