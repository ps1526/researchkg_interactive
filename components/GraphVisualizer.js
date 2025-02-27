import { useEffect, useRef } from 'react';
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
  
  // Process and render the graph
  useEffect(() => {
    if (!graphData || !graphData.nodes || !graphData.edges) return;
    
    // Get the container dimensions
    const container = containerRef.current;
    container.style.width = '100%';
    container.style.height = '100%';
    
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    
    // Clear previous visualization
    d3.select(svgRef.current).selectAll("*").remove();
    
    // Create the SVG element
    const svg = d3.select(svgRef.current)
      .attr("width", width)
      .attr("height", height);
      
    // Add zoom behavior
    const zoom = d3.zoom()
      .extent([[0, 0], [width, height]])
      .scaleExtent([0.1, 8])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });
      
    svg.call(zoom);
    
    // Create a group for zooming
    const g = svg.append("g");
    
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
      .attr("fill", d => d === "arrow-highlighted" ? "#ff6b6b" : d === "arrow-cycle" ? "#ff4500" : "#999")
      .attr("d", "M0,-5L10,0L0,5");
    
    // Process nodes and links for the simulation
    const nodes = graphData.nodes.map(node => ({ ...node }));
    const links = graphData.edges.map(edge => ({ ...edge }));
    
    // Create link elements
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
      .attr("data-target", d => d.target);
    
    // Create node elements
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
      });
    
    // Add circles to nodes
    node.append("circle")
      .attr("r", d => getNodeRadius(d))
      .attr("fill", d => getNodeColor(d))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5);
    
    // Add text labels to nodes
    node.append("text")
      .attr("dx", d => getNodeRadius(d) + 5)
      .attr("dy", ".35em")
      .text(d => getTruncatedLabel(d))
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
    
    // Create the force simulation
    simulationRef.current = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(d => getNodeRadius(d) + 10))
      .on("tick", () => {
        link
          .attr("x1", d => d.source.x)
          .attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x)
          .attr("y2", d => d.target.y);
          
        node
          .attr("transform", d => `translate(${d.x},${d.y})`);
      });
    
    // Add click handler to background for deselecting
    svg.on("click", () => onNodeSelect(null));
    
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
    
    // Create drag behavior
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
    
    // Initial simulation starts
    simulationRef.current.alpha(1).restart();
    
    // Optional: Center the view
    svg.call(zoom.transform, d3.zoomIdentity.translate(width/2, height/2).scale(0.5));
    
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
    
    // Reset all nodes and links
    svg.selectAll(".node circle")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .attr("r", d => getNodeRadius(d));
      
    svg.selectAll("line")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", d => getLinkWidth(d))
      .attr("stroke", d => getLinkColor(d))
      .attr("marker-end", d => getMarkerEnd(d));
    
    svg.selectAll(".node text")
      .attr("font-weight", "normal")
      .attr("font-size", "10px")
      .attr("opacity", 1);
    
    // If a node is selected, highlight it and its connections
    if (selectedNode) {
      // Highlight the selected node
      svg.selectAll(`.node[data-id="${selectedNode.id}"] circle`)
        .attr("stroke", "#ff6b6b")
        .attr("stroke-width", 3)
        .attr("r", d => getNodeRadius(d) * 1.2);
        
      svg.selectAll(`.node[data-id="${selectedNode.id}"] text`)
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
      // Dim non-highlighted nodes
      svg.selectAll(".node")
        .filter(d => !highlightedNodes.has(d.id))
        .attr("opacity", 0.3);
        
      // Ensure highlighted nodes are fully visible
      svg.selectAll(".node")
        .filter(d => highlightedNodes.has(d.id))
        .attr("opacity", 1)
        .select("circle")
        .attr("stroke", d => selectedNode && d.id === selectedNode.id ? "#ff6b6b" : "#ffb703")
        .attr("stroke-width", d => selectedNode && d.id === selectedNode.id ? 3 : 2);
        
      // Dim links that don't connect highlighted nodes
      svg.selectAll("line")
        .attr("opacity", d => {
          const sourceId = d.source.id || d.source;
          const targetId = d.target.id || d.target;
          return highlightedNodes.has(sourceId) && highlightedNodes.has(targetId) ? 1 : 0.2;
        });
    } else {
      // Reset opacity if no highlights
      svg.selectAll(".node").attr("opacity", 1);
      svg.selectAll("line").attr("opacity", 0.6);
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
            .attr("stroke", "#ff4500")
            .attr("stroke-width", 2.5)
            .attr("stroke-opacity", 1)
            .attr("marker-end", "url(#arrow-cycle)");
            
          // Highlight cycle nodes
          svg.selectAll(`.node[data-id="${source}"] circle, .node[data-id="${target}"] circle`)
            .attr("stroke", "#ff4500")
            .attr("stroke-width", 2);
        }
      });
    }
    
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
        height: "100%"
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
              borderTop: "2px solid #ff4500", 
              marginRight: "8px"
            }}></div>
            <span>Cycle</span>
          </div>
        )}
      </div>
    </div>
  );
}