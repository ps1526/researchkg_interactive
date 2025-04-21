import React, { useState, useRef, useEffect } from 'react';

const ChatInterface = ({ graphData, visible, onClose, onHighlightNode, onSelectNode, selectedNode }) => {
  const [messages, setMessages] = useState([
    { role: 'system', content: 'Hi! I can help you analyze and explore this citation graph. What would you like to know?' }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const messagesContainerRef = useRef(null);
  
  // State for resizable window
  const [windowSize, setWindowSize] = useState({
    width: 380,
    height: 500
  });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStartPosition, setResizeStartPosition] = useState({ x: 0, y: 0 });
  const [originalSize, setOriginalSize] = useState({ width: 380, height: 500 });
  
  // Suggested questions to help users get started
  const suggestedQuestions = [
    "What are the main research themes in this graph?",
    "Explain the citation cycles found in this graph",
    "Who are the most influential authors?",
    "How has this research field evolved over time?",
    "Create an advanced literature review with h-index filtering",
    "Summarize the relationship between the most cited papers"
  ];

  // Track if selected node changed to auto-query about it
  useEffect(() => {
    if (selectedNode && visible) {
      const nodeType = selectedNode.type || 'node';
      const nodeTitle = selectedNode.title || selectedNode.name || selectedNode.id;
      
      if (nodeType === 'paper') {
        setInputValue(`Tell me about the paper "${nodeTitle}"`);
      } else if (nodeType === 'author') {
        setInputValue(`Tell me about author ${nodeTitle}`);
      } else {
        setInputValue(`Tell me about this ${nodeType} with id ${selectedNode.id}`);
      }
    }
  }, [selectedNode, visible]);

  // Scroll to bottom of chat when new messages arrive 
  useEffect(() => {
    scrollToBottom();
    
    // We'll let the dedicated click handler handle the clicking functionality
    // This event handler was causing conflicts with the main click handler
  }, [messages, graphData]);

  // Focus input field when component becomes visible
  useEffect(() => {
    if (visible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [visible]);
  
  // Handle resize start
  const handleResizeStart = (e) => {
    e.preventDefault();
    setIsResizing(true);
    setResizeStartPosition({ x: e.clientX, y: e.clientY });
    setOriginalSize({ width: windowSize.width, height: windowSize.height });
    
    // Add event listeners for resize
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', handleResizeEnd);
  };
  
  // Handle resize
  const handleResize = (e) => {
    if (!isResizing) return;
    
    const deltaX = e.clientX - resizeStartPosition.x;
    const deltaY = e.clientY - resizeStartPosition.y;
    
    const newWidth = Math.max(300, originalSize.width - deltaX);
    const newHeight = Math.max(300, originalSize.height + deltaY);
    
    setWindowSize({
      width: newWidth,
      height: newHeight
    });
  };
  
  // Handle resize end
  const handleResizeEnd = () => {
    setIsResizing(false);
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', handleResizeEnd);
  };
  
  // Add event listeners for resize
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleResize);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [isResizing]);

  const scrollToBottom = () => {
    // Only auto-scroll if the user is already near the bottom
    if (!messagesContainerRef.current) return;
    
    const container = messagesContainerRef.current;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
    
    // If user is already near bottom or this is the first message, scroll down
    if (isNearBottom || messages.length <= 1) {
      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
      }, 100);
    }
  };

  const handleInputChange = (e) => {
    setInputValue(e.target.value);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && inputValue.trim()) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Process message text to make papers and authors clickable
  const processMessageText = (text) => {
    if (!graphData || !text) return text;
    
    console.log("Processing message text");
    
    // Clean up the text first - aggressive whitespace cleaning
    let processedText = text
      .replace(/\}">|"}>/g, '') // Remove problematic formatting artifacts
      .replace(/\\"/g, '"')     // Fix escaped quotes
      .replace(/\n{2,}/g, '\n') // Replace all multiple newlines with a single newline
      .replace(/\n\s*\n/g, '\n') // Remove empty paragraphs
      .replace(/\n+(\s*[#]+)/g, '\n$1'); // Remove extra line before headings
    
    // Handle markdown formatting - inline HTML conversion
    // 1. Headers
    processedText = processedText.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
    processedText = processedText.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
    processedText = processedText.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
    
    // 2. Bold text
    processedText = processedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    processedText = processedText.replace(/__(.*?)__/g, '<strong>$1</strong>');
    
    // 3. Italic text
    processedText = processedText.replace(/\*(.*?)\*/g, '<em>$1</em>');
    processedText = processedText.replace(/_(.*?)_/g, '<em>$1</em>');
    
    // 4. Lists
    processedText = processedText.replace(/^- (.*?)$/gm, '<li>$1</li>');
    processedText = processedText.replace(/^• (.*?)$/gm, '<li>$1</li>');
    
    // 5. Paragraphs - wrap text between blocks in p tags
    processedText = processedText.replace(/^([^<\n][^\n]*?)$/gm, '<p>$1</p>');
    
    // 6. Clean up any remaining excessive whitespace
    processedText = processedText.replace(/<\/h1>\s*<p>/g, '</h1>');
    processedText = processedText.replace(/<\/h2>\s*<p>/g, '</h2>');
    processedText = processedText.replace(/<\/h3>\s*<p>/g, '</h3>');
    processedText = processedText.replace(/<\/p>\s*<h/g, '</p><h');
    processedText = processedText.replace(/<\/li>\s*<li>/g, '</li><li>');
    processedText = processedText.replace(/<\/p>\s*<p>/g, '</p><p>');
    
    // 7. Wrap lists in ul tags
    processedText = processedText.replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>');
    processedText = processedText.replace(/<\/ul>\s*<ul>/g, '');
    
    // Get paper and author nodes
    const paperNodes = graphData.nodes.filter(node => node.type === 'paper');
    const authorNodes = graphData.nodes.filter(node => node.type === 'author');
    
    // Process papers - start with longest titles first to avoid partial matches
    paperNodes
      .sort((a, b) => (b.title?.length || 0) - (a.title?.length || 0))
      .forEach(paper => {
        if (!paper.title) return;
        
        const title = paper.title.trim();
        const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Create span for this paper
        const paperSpan = `<span class="clickable-reference paper-reference" data-node-id="${paper.id}" data-node-type="paper">${title}</span>`;
        
        // 1. Replace titles in double quotes
        const quotedPattern = new RegExp(`"${escapedTitle}"`, 'g');
        processedText = processedText.replace(quotedPattern, `"${paperSpan}"`);
        
        // 2. Replace titles in single quotes
        const singleQuotedPattern = new RegExp(`'${escapedTitle}'`, 'g');
        processedText = processedText.replace(singleQuotedPattern, `'${paperSpan}'`);
        
        // 3. Special case for common problematic titles
        if (title === "Attention is All you Need" || 
            title === "Google's Neural Machine Translation System" || 
            title === "Convolutional Sequence to Sequence Learning" ||
            title === "BERT" ||
            title === "GPT" ||
            title === "Transformer" ||
            title.includes("Neural")) {
          
          const specialPattern = new RegExp(escapedTitle, 'g');
          processedText = processedText.replace(specialPattern, match => {
            // Skip if it's already in a span or tag
            if (processedText.indexOf(`<`, Math.max(0, processedText.indexOf(match) - 100)) > 
                processedText.indexOf(match)) {
              return match;
            }
            return paperSpan;
          });
        }
        
        // 4. Match titles as standalone words if not already done
        const wordBoundaryPattern = new RegExp(`\\b${escapedTitle}\\b(?![^<]*>)`, 'g');
        processedText = processedText.replace(wordBoundaryPattern, paperSpan);
      });
    
    // Process authors - similarly, start with longest names first
    authorNodes
      .sort((a, b) => (b.name?.length || 0) - (a.name?.length || 0))
      .forEach(author => {
        if (!author.name) return;
        
        const name = author.name.trim();
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Create span for this author
        const authorSpan = `<span class="clickable-reference author-reference" data-node-id="${author.id}" data-node-type="author">${name}</span>`;
        
        // Match author names as whole words, but not if they're already in a span
        const namePattern = new RegExp(`\\b${escapedName}\\b(?![^<]*>)`, 'g');
        processedText = processedText.replace(namePattern, authorSpan);
      });
    
    return processedText;
  };

  const handleReferenceClick = (e) => {
    const clickableRef = e.target.closest('.clickable-reference');
    if (!clickableRef) return;
    
    e.preventDefault();
    console.log("Reference clicked via direct handler");
    
    const nodeId = clickableRef.dataset.nodeId;
    if (nodeId && graphData) {
      const node = graphData.nodes.find(n => n.id === nodeId);
      if (node) {
        // Use the selection function to fully select the node
        onSelectNode(node);
      }
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;
    
    const userMessage = inputValue.trim();
    setInputValue('');
    setError(null);
    
    // Add user message to chat
    const newMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    
    // Show loading state
    setIsLoading(true);
    
    try {
      // Check if graphData is valid
      if (!graphData || !graphData.nodes || !graphData.edges) {
        console.error("Invalid graph data:", graphData);
        throw new Error("Invalid graph data structure");
      }
      
      // Deep clone the graph data to avoid any reference issues
      const graphDataToSend = JSON.parse(JSON.stringify(graphData));
      
      console.log(`Sending analysis request with ${graphDataToSend.nodes.length} nodes and ${graphDataToSend.edges.length} edges`);
      
      // Test the backend connection first
      try {
        const testResponse = await fetch('/debug', { method: 'GET' });
        if (!testResponse.ok) {
          throw new Error(`Backend server not available (${testResponse.status}). Make sure the Flask backend is running.`);
        }
        console.log("Backend connection test successful");
      } catch (connectionError) {
        console.error("Backend connection test failed:", connectionError);
        throw new Error(`Cannot connect to backend server. Make sure the Flask backend is running on port 5000. Details: ${connectionError.message}`);
      }
      
      // Add assistant message placeholder for streaming
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      setIsStreaming(true);
      
      try {
        // Use streaming endpoint
        const response = await fetch('/analyze-stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            graph_data: graphDataToSend,
            query: userMessage,
            chat_history: messages
          }),
        });

        if (!response.ok) {
          throw new Error(`Analysis request failed: ${response.status} ${response.statusText}`);
        }

        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let partialText = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          
          // Decode the chunk and append to partial text
          const chunk = decoder.decode(value, { stream: true });
          partialText += chunk;
          
          // Update the assistant message with accumulated text
          setMessages(prev => {
            const newHistory = [...prev];
            newHistory[newHistory.length - 1] = {
              role: 'assistant',
              content: partialText
            };
            return newHistory;
          });
        }
      } catch (streamError) {
        console.log("Streaming failed, falling back to regular request:", streamError);
        
        // Fallback to non-streaming endpoint if streaming fails
        const response = await fetch('/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            graph_data: graphDataToSend,
            query: userMessage,
            chat_history: messages
          }),
        });

        if (!response.ok) {
          console.error(`Analysis request failed with status: ${response.status}`);
          throw new Error(`Analysis request failed: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        console.log("Analysis result:", result);
        
        // Update the last message (assistant's message) with the result
        setMessages(prev => {
          const newHistory = [...prev];
          newHistory[newHistory.length - 1] = {
            role: 'assistant',
            content: result.analysis || "I couldn't analyze the graph."
          };
          return newHistory;
        });
      }

    } catch (error) {
      console.error('Error:', error);
      // Update the last message with the error
      setMessages(prev => {
        const newHistory = [...prev];
        newHistory[newHistory.length - 1] = {
          role: 'assistant',
          content: `Error: ${error.message}`
        };
        return newHistory;
      });
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  const handleSuggestedQuestion = (question) => {
    setInputValue(question);
    inputRef.current?.focus();
  };
  
  // Toggle between compact and expanded view
  const toggleExpand = () => {
    if (windowSize.width === 380 && windowSize.height === 500) {
      // Expand
      setWindowSize({
        width: 600,
        height: 700
      });
    } else {
      // Collapse to default
      setWindowSize({
        width: 380,
        height: 500
      });
    }
  };

  // Set up event delegation for clickable references
  useEffect(() => {
    const handleClick = (e) => {
      // Find the closest clickable reference
      const clickableRef = e.target.closest('.clickable-reference');
      if (clickableRef) {
        e.preventDefault();
        console.log("Clickable reference clicked:", clickableRef);
        
        // Try to get node data from different attributes
        const nodeId = clickableRef.dataset.nodeId;
        const nodeType = clickableRef.dataset.nodeType;
        
        console.log("Node ID from data attribute:", nodeId);
        
        // Prioritize finding by ID if we have it
        if (nodeId && graphData) {
          console.log("Looking for node with ID:", nodeId);
          const node = graphData.nodes.find(n => n.id === nodeId);
          
          if (node) {
            console.log("Found node:", node);
            // Actively select the node when clicked in chat
            onSelectNode(node);
            return;
          } else {
            console.log("Node not found in graphData.nodes");
          }
        }
        
        // If node lookup by ID failed, try using the data-node-data attribute
        try {
          if (clickableRef.dataset.nodeData) {
            const nodeData = JSON.parse(clickableRef.dataset.nodeData.replace(/&quot;/g, '"'));
            console.log("Parsed node data:", nodeData);
            
            // If we have an ID, try finding the complete node
            if (nodeData.id && graphData) {
              const node = graphData.nodes.find(n => n.id === nodeData.id);
              if (node) {
                console.log("Found node using nodeData ID:", node);
                onSelectNode(node);
                return;
              }
            }
            
            // As a last resort, construct a minimal node from the data
            const minimalNode = {
              id: nodeData.id,
              type: nodeData.type || (nodeData.name ? 'author' : 'paper'),
              title: nodeData.title,
              name: nodeData.name
            };
            
            console.log("Using minimal node:", minimalNode);
            onSelectNode(minimalNode);
          }
        } catch (error) {
          console.error("Error parsing node data:", error);
        }
      }
    };
    
    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener('click', handleClick);
      console.log("Added click event listener to messages container");
    } else {
      console.warn("Messages container ref is null, couldn't add click listener");
    }
    
    return () => {
      if (container) {
        container.removeEventListener('click', handleClick);
        console.log("Removed click event listener from messages container");
      }
    };
  }, [graphData, onSelectNode, messagesContainerRef]);

  if (!visible) return null;

  return (
    <div className="chat-interface" style={{
      position: 'absolute',
      right: '20px',
      bottom: '20px',
      width: `${windowSize.width}px`,
      maxWidth: 'calc(100vw - 40px)',
      height: `${windowSize.height}px`,
      maxHeight: 'calc(100vh - 100px)',
      backgroundColor: 'white',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 1000,
      overflow: 'hidden',
      transition: isResizing ? 'none' : 'width 0.3s ease, height 0.3s ease'
    }}>
      {/* Resize handle */}
      <div 
        className="resize-handle"
        onMouseDown={handleResizeStart}
        style={{
          position: 'absolute',
          left: '0',
          top: '0',
          width: '16px',
          height: '16px',
          cursor: 'nwse-resize',
          zIndex: 1001
        }}
      />
      
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #E5E7EB',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '16px',
          fontWeight: '600',
          color: '#111827'
        }}>
          Graph Analysis Assistant
        </h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={toggleExpand}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#6B7280',
              padding: '4px'
            }}
          >
            {windowSize.width === 380 ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
              </svg>
            )}
          </button>
          <button 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#6B7280',
              padding: '4px'
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>
      
      {/* Messages Area */}
      <div 
        ref={messagesContainerRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}
      >
        {messages.map((message, index) => (
          <div 
            key={index}
            style={{
              alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: message.role === 'user' ? '80%' : '90%',
              padding: message.role === 'user' ? '10px 14px' : '8px 12px',
              borderRadius: message.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              backgroundColor: message.role === 'user' ? '#3B82F6' : '#F3F4F6',
              color: message.role === 'user' ? 'white' : '#1F2937',
              wordWrap: 'break-word',
              fontSize: '14px',
              lineHeight: '1.4',
              whiteSpace: 'pre-wrap'
            }}
            className={message.role === 'assistant' ? 'assistant-message' : ''}
            dangerouslySetInnerHTML={
              message.role === 'assistant' 
                ? { __html: processMessageText(message.content) } 
                : { __html: message.content }
            }
          />
        ))}
        
        {isLoading && (
          <div style={{
            alignSelf: 'flex-start',
            padding: '10px 14px',
            borderRadius: '18px 18px 18px 4px',
            backgroundColor: '#F3F4F6',
            color: '#6B7280',
            fontSize: '14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="typing-indicator" style={{
                display: 'flex',
                gap: '4px'
              }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#6B7280',
                  animation: 'typing 1s infinite ease-in-out',
                  animationDelay: '0s'
                }}></span>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#6B7280',
                  animation: 'typing 1s infinite ease-in-out',
                  animationDelay: '0.2s'
                }}></span>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#6B7280',
                  animation: 'typing 1s infinite ease-in-out',
                  animationDelay: '0.4s'
                }}></span>
              </div>
              <span>{isStreaming ? "Streaming response..." : "Analyzing graph..."}</span>
            </div>
          </div>
        )}
        
        {/* Suggested questions (only show near beginning of conversation) */}
        {messages.length <= 2 && (
          <div style={{
            marginTop: '12px',
            padding: '12px',
            backgroundColor: '#F9FAFB',
            borderRadius: '8px',
            border: '1px solid #E5E7EB'
          }}>
            <p style={{
              margin: '0 0 8px 0',
              fontSize: '13px',
              fontWeight: '500',
              color: '#4B5563'
            }}>
              Suggested questions:
            </p>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              {suggestedQuestions.map((question, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestedQuestion(question)}
                  style={{
                    backgroundColor: '#EFF6FF',
                    color: '#3B82F6',
                    border: '1px solid #DBEAFE',
                    borderRadius: '4px',
                    padding: '6px 10px',
                    fontSize: '13px',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Error message */}
        {error && (
          <div style={{
            marginTop: '12px',
            padding: '10px',
            backgroundColor: '#FEF2F2',
            color: '#B91C1C',
            borderRadius: '4px',
            fontSize: '13px'
          }}>
            {error}
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input Area */}
      <div style={{
        borderTop: '1px solid #E5E7EB',
        padding: '12px 16px',
        backgroundColor: '#F9FAFB'
      }}>
        <div style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center'
        }}>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this citation graph..."
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '9999px',
              border: '1px solid #D1D5DB',
              fontSize: '14px',
              outline: 'none',
              boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.05)'
            }}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#3B82F6',
              color: 'white',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              border: 'none',
              cursor: !inputValue.trim() || isLoading ? 'not-allowed' : 'pointer',
              opacity: !inputValue.trim() || isLoading ? 0.6 : 1
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>

      {/* CSS for the typing animation and clickable references */}
      <style jsx>{`
        @keyframes typing {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-4px); }
        }
        
        .clickable-reference {
          cursor: pointer;
          text-decoration: underline;
          color: #2563EB;
          transition: all 0.2s ease;
          padding: 0 2px;
          border-radius: 3px;
          position: relative;
          font-weight: 500;
        }
        
        .paper-reference {
          color: #2563EB;
          border-color: #3B82F6;
        }
        
        .paper-reference:hover {
          background-color: rgba(219, 234, 254, 0.4);
          text-decoration: underline;
          box-shadow: 0 1px 2px rgba(37, 99, 235, 0.1);
        }
        
        .paper-reference::after {
          content: '📄';
          font-size: 10px;
          margin-left: 2px;
          opacity: 0.7;
          vertical-align: super;
        }
        
        .author-reference {
          color: #7C3AED;
          border-color: #8B5CF6;
        }
        
        .author-reference:hover {
          background-color: rgba(237, 233, 254, 0.4);
          text-decoration: underline;
          box-shadow: 0 1px 2px rgba(124, 58, 237, 0.1);
        }
        
        .author-reference::after {
          content: '👤';
          font-size: 10px;
          margin-left: 2px;
          opacity: 0.7;
          vertical-align: super;
        }
        
        /* Add a tooltip to show that clicking will select the node */
        .clickable-reference::before {
          content: 'Click to select node';
          position: absolute;
          background-color: #1F2937;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 10px;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          white-space: nowrap;
          opacity: 0;
          visibility: hidden;
          transition: all 0.2s;
          z-index: 1100;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
          pointer-events: none;
        }
        
        .clickable-reference:hover::before {
          opacity: 1;
          visibility: visible;
          bottom: calc(100% + 5px);
        }
        
        /* Message styling improvements */
        h1, h2, h3 {
          margin-top: 0.35em;
          margin-bottom: 0.15em;
          font-weight: 600;
          line-height: 1.05;
        }
        
        h1 {
          font-size: 1.1em;
          color: #111827;
        }
        
        h2 {
          font-size: 0.95em;
          color: #1F2937;
        }
        
        h3 {
          font-size: 0.9em;
          color: #374151;
        }
        
        strong {
          font-weight: 600;
          color: #111827;
        }
        
        em {
          font-style: italic;
          color: #4B5563;
        }
        
        p {
          margin-top: 0.2em;
          margin-bottom: 0.2em;
        }
        
        /* Assistant message styling */
        .assistant-message {
          line-height: 1.2;
        }
        
        .assistant-message p {
          margin-top: 0;
          margin-bottom: 0.3em;
        }
        
        .assistant-message ul { 
          padding-left: 1em;
          margin: 0.2em 0;
        }
        
        .assistant-message li {
          margin-bottom: 0.1em;
          line-height: 1.2;
        }
        
        .assistant-message h2 {
          margin-top: 0.5em;
          margin-bottom: 0.1em;
        }
        
        /* Eliminate excessive whitespace */
        .assistant-message br {
          display: none;
        }
        
        .assistant-message h2 + p {
          margin-top: 0.1em;
        }
        
        .assistant-message p:empty {
          display: none;
        }
        
        .resize-handle {
          opacity: 0;
        }
        
        .chat-interface:hover .resize-handle {
          opacity: 0.3;
        }
        
        .resize-handle:hover, 
        .resize-handle:active {
          opacity: 0.7;
        }
      `}</style>
    </div>
  );
};

export default ChatInterface; 