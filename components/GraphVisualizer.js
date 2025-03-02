import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

export default function GraphVisualizer({ 
  graphData, 
  selectedNode, 
  onNodeSelect, 
  highlightedNodes, 
  showCycles,
  cycles
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const simulationRef = useRef(null);
  const [renderStats, setRenderStats] = useState({ nodes: 0, edges: 0 });
  
  // Process and render the graph
  useEffect(() => {
    if (!graphData || !graphData.nodes || !graphData.edges) return;
    
    const startTime = performance.now();
    
    // Get the container dimensions
    const container = containerRef.current;
    container.style.width = '100%';
    container.style.height = '100%';
    
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    
    // Clear previous visualization
    d3.select(svgRef.current).selectAll("*").remove();
    
    // Create the SVG element with hardware acceleration enabled
    const svg = d3.select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      // Enable hardware acceleration with CSS
      .style("transform", "translate3d(0,0,0)")
      .style("-webkit-transform", "translate3d(0,0,0)")
      .style("backface-visibility", "hidden")
      .style("-webkit-backface-visibility", "hidden");
  
    // Add zoom behavior
    const zoom = d3.zoom()
      .extent([[0, 0], [width, height]])
      .scaleExtent([0.1, 8])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
      
    svg.call(zoom);

    // Create a group for zooming and center it initially
    const g = svg.append("g")
      .attr("transform", `translate(${width/2}, ${height/2})`);
        
    // Prepare the arrow marker for links
    svg.append("defs").selectAll("marker")
      .data(["arrow", "arrow-highlighted", "arrow-cycle"])
      .enter().append("marker")
      .attr("id", d => d)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 15)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("fill", d => d === "arrow-highlighted" ? "#008080" : d === "arrow-cycle" ? "#ff4500" : "#999")
      .attr("d", "M0,-5L10,0L0,5");
    
    // Process nodes and links for the simulation
    const nodes = graphData.nodes.map(node => ({ ...node }));
    const links = graphData.edges.map(edge => ({ ...edge }));
    
    // Create object pools to reduce garbage collection
    const linkElements = new Map();
    const nodeElements = new Map();
    
    // Create link elements with optimized rendering
    const link = g.append("g")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", d => getLinkWidth(d))
      .attr("stroke", d => getLinkColor(d))
      .attr("marker-end", d => getMarkerEnd(d))
      .attr("data-source", d => d.source)
      .attr("data-target", d => d.target)
      // Set rendering hint for browser optimization
      .style("will-change", "x1, y1, x2, y2");
    
    // Store link elements in map for quick access
    link.each(function(d) {
      linkElements.set(d, d3.select(this));
    });
    
    // Create node elements with optimized batch updates
    const node = g.append("g")
      .selectAll(".node")
      .data(nodes)
      .join("g")
      .attr("class", "node")
      .attr("data-id", d => d.id)
      .call(drag(simulationRef))
      .on("click", (event, d) => {
        event.stopPropagation();
        onNodeSelect(d);
      })
      // Set rendering hint for browser optimization
      .style("will-change", "transform");
    
    // Store node elements in map for quick access
    node.each(function(d) {
      nodeElements.set(d, d3.select(this));
    });
    
    // Add circles to nodes
    node.append("circle")
      .attr("r", d => getNodeRadius(d))
      .attr("fill", d => getNodeColor(d))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5);
    
    // Add text labels to nodes - only for important nodes to reduce rendering cost
    node.append("text")
      .attr("dx", d => getNodeRadius(d) + 5)
      .attr("dy", ".35em")
      .text(d => shouldShowLabel(d) ? getTruncatedLabel(d) : "")
      .attr("font-size", "10px")
      .attr("pointer-events", "none");

    node.on("click", (event, d) => {
      event.stopPropagation();
      // Make a clean copy of the node data to avoid D3 internal properties
      const nodeCopy = {
        id: d.id,
        type: d.type,
        title: d.title || '',
        name: d.name || '',
        abstract: d.abstract || '',
        year: d.year || null,
        venue: d.venue || '',
        citation_count: d.citation_count || 0,
        reference_count: d.reference_count || 0,
        url: d.url || '',
        is_open_access: d.is_open_access || false,
        fields_of_study: d.fields_of_study || [],
        // Include any other properties you need
        originalData: d  // Keep the original data as well
      };
      onNodeSelect(nodeCopy);
    });
    
    // Create the force simulation with optimized settings
    simulationRef.current = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(0, 0))
      .force("collision", d3.forceCollide().radius(d => getNodeRadius(d) + 15))
      .stop(); // Start manually for better control
    
    // Manually warm up and run the simulation for better performance
    simulationRef.current.alpha(1);
    
    // Run more iterations at once for better initial layout
    for (let i = 0; i < 120; i++) {
      simulationRef.current.tick();
    }
    
    // After initial layout, set up the tick function
    simulationRef.current.on("tick", () => {
      // Use batch updates for better performance
      // Update links in chunks to avoid layout thrashing
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
        
      // Update nodes in transform for better performance
      node
        .attr("transform", d => `translate(${d.x},${d.y})`);
    });
    
    // Run the simulation with less iterations for interaction
    simulationRef.current.restart();

    svg.call(zoom.transform, d3.zoomIdentity.translate(width/2, height/2).scale(0.6));
    
    // Add click handler to background for deselecting
    svg.on("click", () => onNodeSelect(null));
    
    // Update render stats
    setRenderStats({
      nodes: nodes.length,
      edges: links.length,
      time: Math.round(performance.now() - startTime)
    });
    
    // Helper functions
    function getNodeRadius(d) {
      if (d.type === "author") {
        return 8;
      } else if (d.type === "paper") {
        // Scale by citation count
        const baseSize = 10;
        const scale = d.citation_count ? Math.min(20, Math.sqrt(d.citation_count) / 2) : 0;
        return baseSize + scale;
      } else {
        return 8;
      }
    }
    
    function getNodeColor(d) {
      if (d.type === "author") {
        return "#90EE90"; // lightgreen
      } else if (d.type === "paper") {
        return "#87CEEB"; // skyblue
      } else {
        return "gray";
      }
    }
    
    function getLinkWidth(d) {
      if (d.type === "cites" && d.is_influential) {
        return 2;
      }
      return 1;
    }
    
    function getLinkColor(d) {
      if (d.type === "cites") {
        return d.is_influential ? "#6c757d" : "#adb5bd";
      } else if (d.type === "authored") {
        return "#28a745";
      } else {
        return "#999";
      }
    }
    
    function getMarkerEnd(d) {
      return d.type === "cites" ? "url(#arrow)" : null;
    }
    
    function getTruncatedLabel(d) {
      const label = d.title || d.name || d.id;
      return label.length > 25 ? label.substring(0, 23) + "..." : label;
    }
    
    // Only show labels for important nodes to reduce rendering overhead
    function shouldShowLabel(d) {
      if (d.type === "paper" && parseInt(d.citation_count || 0) > 30) return true;
      if (d.type === "author") return true;
      return false;
    }
    
    // Create drag behavior with optimization
    function drag(simulation) {
      function dragstarted(event, d) {
        if (!event.active) simulation.current.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      }
      
      function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
      }
      
      function dragended(event, d) {
        if (!event.active) simulation.current.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }
      
      return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
    }
    
    // Cleanup
    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop();
      }
    };
  }, [graphData]);
  
  // Update graph based on selected node
  useEffect(() => {
    if (!svgRef.current || !graphData) return;
    
    const svg = d3.select(svgRef.current);
    
    // Reset all nodes and links - use batch operations for better performance
    const resetNodes = () => {
      svg.selectAll(".node circle")
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5)
        .attr("r", d => getNodeRadius(d));
    };
    
    const resetLinks = () => {
      svg.selectAll("line")
        .attr("stroke-opacity", 0.6)
        .attr("stroke-width", d => getLinkWidth(d))
        .attr("stroke", d => getLinkColor(d))
        .attr("marker-end", d => getMarkerEnd(d));
    };
    
    const resetLabels = () => {
      svg.selectAll(".node text")
        .attr("font-weight", "normal")
        .attr("font-size", "10px")
        .attr("opacity", 1)
        .text(d => shouldShowLabel(d) ? getTruncatedLabel(d) : "");
    };
    
    // Use requestAnimationFrame for smoother rendering
    requestAnimationFrame(() => {
      resetNodes();
      resetLinks();
      resetLabels();
      
      // If a node is selected, highlight it and its connections
      if (selectedNode) {
        // Highlight the selected node
        svg.selectAll(`.node[data-id="${selectedNode.id}"] circle`)
          .attr("stroke", "#ff6b6b")
          .attr("stroke-width", 3)
          .attr("r", d => getNodeRadius(d) * 1.2);
          
        // Always show and highlight the selected node's label
        svg.selectAll(`.node[data-id="${selectedNode.id}"] text`)
          .text(d => getTruncatedLabel(d))
          .attr("font-weight", "bold")
          .attr("font-size", "12px");
        
        // Highlight connected links and nodes
        const connectedLinks = [];
        
        graphData.edges.forEach((link, i) => {
          if (link.source === selectedNode.id || link.target === selectedNode.id ||
              (link.source.id && link.source.id === selectedNode.id) ||
              (link.target.id && link.target.id === selectedNode.id)) {
            connectedLinks.push(i);
            
            // Get the connected node id
            const connectedId = link.source === selectedNode.id || (link.source.id && link.source.id === selectedNode.id)
              ? (link.target.id || link.target)
              : (link.source.id || link.source);
            
            // Highlight connected node
            svg.selectAll(`.node[data-id="${connectedId}"] circle`)
              .attr("stroke", "#6c757d")
              .attr("stroke-width", 2);
              
            // Show and highlight connected node labels
            svg.selectAll(`.node[data-id="${connectedId}"] text`)
              .text(d => getTruncatedLabel(d))
              .attr("font-weight", "bold");
              
            // Highlight link
            svg.selectAll(`line[data-source="${link.source}"][data-target="${link.target}"]`)
              .attr("stroke-opacity", 1)
              .attr("stroke-width", d => getLinkWidth(d) * 1.5)
              .attr("stroke", "#ff6b6b")
              .attr("marker-end", "url(#arrow-highlighted)");
          }
        });
      }
      
      // If nodes are highlighted by search/filter
      if (highlightedNodes && highlightedNodes.size > 0) {
        // Make non-highlighted nodes very transparent
        svg.selectAll(".node")
          .filter(d => !highlightedNodes.has(d.id))
          .attr("opacity", 0.15); // Much more transparent
        
        // Make non-highlighted links nearly invisible  
        svg.selectAll("line")
          .attr("opacity", d => {
            const sourceId = d.source.id || d.source;
            const targetId = d.target.id || d.target;
            return highlightedNodes.has(sourceId) && highlightedNodes.has(targetId) ? 1 : 0.1;
          });
          
        // Make highlighted nodes stand out more
        svg.selectAll(".node")
          .filter(d => highlightedNodes.has(d.id))
          .attr("opacity", 1)
          .select("circle")
          .attr("stroke", d => selectedNode && d.id === selectedNode.id ? "#ff6b6b" : "#ffb703")
          .attr("stroke-width", d => selectedNode && d.id === selectedNode.id ? 3 : 2.5)
          .attr("r", d => getNodeRadius(d) * 1.2); // Make highlighted nodes 20% larger
        
        // Show and make highlighted node labels more visible
        svg.selectAll(".node")
          .filter(d => highlightedNodes.has(d.id))
          .select("text")
          .text(d => getTruncatedLabel(d))
          .attr("font-weight", "bold");
      } else {
        // Reset opacity if no highlights
        svg.selectAll(".node").attr("opacity", 1);
        svg.selectAll("line").attr("opacity", 0.6);
        svg.selectAll(".node circle").attr("r", d => getNodeRadius(d));
        svg.selectAll(".node text").attr("font-weight", "normal");
      }
      
      // Show cycles if enabled
      if (showCycles && cycles && cycles.length > 0) {
        cycles.forEach(cycle => {
          for (let i = 0; i < cycle.length - 1; i++) {
            const source = cycle[i];
            const target = cycle[i + 1];
            
            // Highlight cycle links
            svg.selectAll("line")
              .filter(d => {
                const s = d.source.id || d.source;
                const t = d.target.id || d.target;
                return (s === source && t === target);
              })
              .attr("stroke", "#008080")
              .attr("stroke-width", 2.5)
              .attr("stroke-opacity", 1)
              .attr("marker-end", "url(#arrow-cycle)");
              
            // Highlight cycle nodes
            svg.selectAll(`.node[data-id="${source}"] circle, .node[data-id="${target}"] circle`)
              .attr("stroke", "#008080")
              .attr("stroke-width", 2);
              
            // Show cycle node labels
            svg.selectAll(`.node[data-id="${source}"] text, .node[data-id="${target}"] text`)
              .text(d => getTruncatedLabel(d));
          }
        });
      }
    });
    
    // Helper functions
    function getNodeRadius(d) {
      if (d.type === "author") {
        return 8;
      } else if (d.type === "paper") {
        const baseSize = 10;
        const scale = d.citation_count ? Math.min(20, Math.sqrt(d.citation_count) / 2) : 0;
        return baseSize + scale;
      } else {
        return 8;
      }
    }
    
    function getLinkWidth(d) {
      if (d.type === "cites" && d.is_influential) {
        return 2;
      }
      return 1;
    }
    
    function getLinkColor(d) {
      if (d.type === "cites") {
        return d.is_influential ? "#6c757d" : "#adb5bd";
      } else if (d.type === "authored") {
        return "#28a745";
      } else {
        return "#999";
      }
    }
    
    function getMarkerEnd(d) {
      return d.type === "cites" ? "url(#arrow)" : null;
    }
    
    // Only show labels for certain nodes to reduce rendering overhead
    function shouldShowLabel(d) {
      // Always show label for selected node
      if (selectedNode && d.id === selectedNode.id) return true;
      
      // Always show label for highlighted nodes
      if (highlightedNodes && highlightedNodes.has(d.id)) return true;
      
      // For others, be selective
      if (d.type === "paper" && parseInt(d.citation_count || 0) > 30) return true;
      if (d.type === "author") return true;
      
      return false;
    }
    
    function getTruncatedLabel(d) {
      const label = d.title || d.name || d.id;
      return label.length > 25 ? label.substring(0, 23) + "..." : label;
    }
    
  }, [selectedNode, graphData, highlightedNodes, showCycles, cycles]);

  return (
    <div ref={containerRef} style={{
      width: "100%", 
      height: "100%", 
      position: "relative",
      minHeight: "500px" // Ensure minimum height
    }}>
      <svg ref={svgRef} style={{
        width: "100%", 
        height: "100%",
        // WebGL acceleration hints
        transform: "translate3d(0,0,0)",
        backfaceVisibility: "hidden"
      }}></svg>
      
      {/* Legend with inline styles */}
      <div style={{
        position: "absolute",
        top: "16px",
        right: "16px",
        backgroundColor: "white",
        opacity: 0.9,
        padding: "12px",
        borderRadius: "6px",
        boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
        fontSize: "12px",
        zIndex: 10
      }}>
        <h3 style={{fontWeight: "bold", marginBottom: "8px"}}>Legend</h3>
        <div style={{display: "flex", alignItems: "center", marginBottom: "4px"}}>
          <div style={{
            width: "12px", 
            height: "12px", 
            borderRadius: "50%", 
            backgroundColor: "#87CEEB", 
            marginRight: "8px"
          }}></div>
          <span>Paper</span>
        </div>
        <div style={{display: "flex", alignItems: "center", marginBottom: "4px"}}>
          <div style={{
            width: "12px", 
            height: "12px", 
            borderRadius: "50%", 
            backgroundColor: "#90EE90", 
            marginRight: "8px"
          }}></div>
          <span>Author</span>
        </div>
        <div style={{display: "flex", alignItems: "center", marginBottom: "4px"}}>
          <div style={{
            width: "16px", 
            height: "0", 
            borderTop: "2px solid #6c757d", 
            marginRight: "8px"
          }}></div>
          <span>Citation</span>
        </div>
        <div style={{display: "flex", alignItems: "center", marginBottom: "4px"}}>
          <div style={{
            width: "16px", 
            height: "0", 
            borderTop: "2px solid #28a745", 
            marginRight: "8px"
          }}></div>
          <span>Authorship</span>
        </div>
        {showCycles && (
          <div style={{display: "flex", alignItems: "center"}}>
            <div style={{
              width: "16px", 
              height: "0", 
              borderTop: "2px solid #008080", 
              marginRight: "8px"
            }}></div>
            <span>Cycle</span>
          </div>
        )}
      </div>
      
      {/* Performance stats indicator */}
      <div style={{
        position: 'absolute',
        bottom: '10px',
        left: '10px',
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        color: '#4B5563',
        zIndex: 10
      }}>
        Rendering: {renderStats.nodes} nodes, {renderStats.edges} edges
        {renderStats.time > 0 && ` (${renderStats.time}ms)`}
      </div>
    </div>
  );
}