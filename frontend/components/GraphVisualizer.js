import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

export default function GraphVisualizer({ 
  graphData, 
  selectedNode, 
  onNodeSelect, 
  highlightedNodes, 
  showCycles,
  cycles,
  accentedNode
}) {
  const svgRef = useRef(null);
  const containerRef = useRef(null);
  const simulationRef = useRef(null);
  const zoomRef = useRef(null);
  const [renderStats, setRenderStats] = useState({ nodes: 0, edges: 0 });
  const [isInitialized, setIsInitialized] = useState(false);
  // Add state for community toggle
  const [showCommunities, setShowCommunities] = useState(true);
  
  // Find the first paper to use as the seed paper
  const firstPaperId = graphData?.nodes?.find(n => n.type === "paper")?.id;

  // Force reinitialization when graphData changes (for loading different graphs)
  useEffect(() => {
    if (graphData) {
      // Clean up any existing visualization
      if (simulationRef.current) {
        simulationRef.current.stop();
      }
      
      if (svgRef.current) {
        d3.select(svgRef.current).selectAll("*").remove();
      }
      
      // Force reinitialization
      setIsInitialized(false);
      
      console.log("GraphVisualizer: New graph data received, will reinitialize");
    }
  }, [graphData]);

  // First-time initialization and graph rendering
  useEffect(() => {
    if (!graphData || !graphData.nodes || !graphData.edges) return;
    if (isInitialized) return;
    
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
    
    zoomRef.current = zoom;
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
    
    // Create link elements with optimized rendering
    const link = g.append("g")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", d => getLinkWidth(d))
      .attr("stroke", d => getLinkColor(d))
      .attr("marker-end", d => getMarkerEnd(d, svgRef.current))
      .attr("data-source", d => d.source)
      .attr("data-target", d => d.target)
      // Set rendering hint for browser optimization
      .style("will-change", "x1, y1, x2, y2");
    
    // Create node elements with optimized batch updates
    const node = g.append("g")
      .selectAll(".node")
      .data(nodes)
      .join("g")
      .attr("class", "node")
      .attr("data-id", d => d.id)
      .call(createDragBehavior())
      .on("click", (event, d) => {
        event.stopPropagation();
        onNodeSelect(d);
      })
      // Set rendering hint for browser optimization
      .style("will-change", "transform");
    
    // Add circles to nodes
    node.append("circle")
      .attr("r", d => getNodeRadius(d))
      .attr("fill", d => {
        // First check if it's the seed paper
        if (d.id === firstPaperId) return "#FF6B6B";
        
        // If it's a paper with community information and communities are shown, use community color
        if (d.type === "paper" && d.community !== undefined && showCommunities) {
          return getCommunityColor(d.community);
        }
        
        // Otherwise use default colors by type
        return d.type === "author" ? "#90EE90" : 
               d.type === "paper" ? "#87CEEB" : "gray";
      })
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5);
    
    // Add text labels to nodes - only for important nodes to reduce rendering cost
    node.append("text")
      .attr("dx", d => getNodeRadius(d) + 5)
      .attr("dy", ".35em")
      .text(d => shouldShowLabel(d) ? getTruncatedLabel(d) : "")
      .attr("font-size", "10px")
      .attr("pointer-events", "none");

    // Helper functions for initial rendering
    function shouldShowLabel(d) {
      if (d.type === "paper" && parseInt(d.citation_count || 0) > 30) return true;
      if (d.type === "author") return true;
      return false;
    }
    
    function getTruncatedLabel(d) {
      const label = d.title || d.name || d.id;
      return label.length > 25 ? label.substring(0, 23) + "..." : label;
    }

    // Handle node click
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
        is_seed_paper: d.id === firstPaperId, // Mark as seed paper if it's the first paper
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
    
    setIsInitialized(true);
    
    // Cleanup
    return () => {
      if (simulationRef.current) {
        simulationRef.current.stop();
      }
    };
  }, [graphData, onNodeSelect, isInitialized, firstPaperId, showCommunities]);
  
  // Update links and nodes when the community toggle changes
  useEffect(() => {
    if (!svgRef.current || !isInitialized || !graphData) return;
    
    const svg = d3.select(svgRef.current);
    
    // Update paper node colors based on community toggle
    svg.selectAll(".node circle")
      .filter(d => d.type === "paper" && d.community !== undefined)
      .attr("fill", d => {
        if (d.id === firstPaperId) return "#FF6B6B"; // Always keep seed paper color
        return showCommunities ? getCommunityColor(d.community) : "#87CEEB";
      });
    
    // Update link colors based on community toggle
    svg.selectAll("line")
      .attr("stroke", d => {
        if (d.type === "authored") return "#28a745"; // Keep green for authorship
        
        if (d.type === "cites" && showCommunities) {
          // Get source and target nodes
          const sourceNode = typeof d.source === 'object' ? d.source : graphData?.nodes?.find(n => n.id === d.source);
          const targetNode = typeof d.target === 'object' ? d.target : graphData?.nodes?.find(n => n.id === d.target);
          
          // If both papers belong to the same community, color by community
          if (sourceNode && targetNode && 
              sourceNode?.type === 'paper' && targetNode?.type === 'paper' &&
              sourceNode?.community !== undefined && 
              targetNode?.community !== undefined && 
              sourceNode.community === targetNode.community) {
            
            // Generate color based on community ID
            return getCommunityColor(sourceNode.community);
          }
        }
        
        // Default citation colors
        return d.is_influential ? "#6c757d" : "#adb5bd";
      })
      .attr("marker-end", d => getMarkerEnd(d, svgRef.current));
      
  }, [showCommunities, isInitialized, graphData, firstPaperId]);
  
  // Update graph based on selected node - doesn't reinitialize the graph
  useEffect(() => {
    if (!svgRef.current || !graphData || !isInitialized) return;
    
    const svg = d3.select(svgRef.current);
    
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
    
    // Reset all nodes and links - use batch operations for better performance
    svg.selectAll(".node circle")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .attr("r", d => getNodeRadius(d));
    
    svg.selectAll("line")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", d => getLinkWidth(d))
      .attr("stroke", d => getLinkColor(d))
      .attr("marker-end", d => getMarkerEnd(d, svgRef.current));
    
    svg.selectAll(".node text")
      .attr("font-weight", "normal")
      .attr("font-size", "10px")
      .attr("opacity", 1)
      .text(d => shouldShowLabel(d) ? getTruncatedLabel(d) : "");
    
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
      graphData.edges.forEach((link) => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        
        if (sourceId === selectedNode.id || targetId === selectedNode.id) {          
          // Get the connected node id
          const connectedId = sourceId === selectedNode.id ? targetId : sourceId;
          
          // Highlight connected node
          svg.selectAll(`.node[data-id="${connectedId}"] circle`)
            .attr("stroke", "#6c757d")
            .attr("stroke-width", 2);
            
          // Show and highlight connected node labels
          svg.selectAll(`.node[data-id="${connectedId}"] text`)
            .text(d => getTruncatedLabel(d))
            .attr("font-weight", "bold");
            
          // Highlight link - using attribute selectors to find the right link
          svg.selectAll("line")
            .filter(d => {
              const s = typeof d.source === 'object' ? d.source.id : d.source;
              const t = typeof d.target === 'object' ? d.target.id : d.target;
              return (s === sourceId && t === targetId);
            })
            .attr("stroke-opacity", 1)
            .attr("stroke-width", getLinkWidth(link) * 1.5)
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
          const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
          const targetId = typeof d.target === 'object' ? d.target.id : d.target;
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
              const s = typeof d.source === 'object' ? d.source.id : d.source;
              const t = typeof d.target === 'object' ? d.target.id : d.target;
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
        
        // Connect the last node to the first to complete the cycle visualization
        if (cycle.length > 1) {
          const source = cycle[cycle.length - 1];
          const target = cycle[0];
          
          // Highlight the closing link of the cycle
          svg.selectAll("line")
            .filter(d => {
              const s = typeof d.source === 'object' ? d.source.id : d.source;
              const t = typeof d.target === 'object' ? d.target.id : d.target;
              return (s === source && t === target);
            })
            .attr("stroke", "#008080")
            .attr("stroke-width", 2.5)
            .attr("stroke-opacity", 1)
            .attr("marker-end", "url(#arrow-cycle)");
        }
      });
    }
    
  }, [selectedNode, graphData, highlightedNodes, showCycles, cycles, isInitialized, firstPaperId]);
  
  // Handle accented node (highlight without blurring)
  useEffect(() => {
    if (!svgRef.current || !isInitialized) return;
    
    const svg = d3.select(svgRef.current);
    
    // Reset all nodes to normal state first
    svg.selectAll(".node circle")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .attr("r", d => getNodeRadius(d));
    
    // If there's an accented node, highlight it
    if (accentedNode) {
      svg.selectAll(".node")
        .filter(d => d.id === accentedNode.id)
        .select("circle")
        .attr("stroke", "#F59E0B") // Amber color for highlighting
        .attr("stroke-width", 3)
        .attr("r", d => getNodeRadius(d) * 1.2); // Make the node slightly larger
        
      // Add a subtle pulse animation
      svg.selectAll(".node")
        .filter(d => d.id === accentedNode.id)
        .select("circle")
        .interrupt() // Stop any running transitions
        .transition()
        .duration(600)
        .attr("stroke-width", 4)
        .transition()
        .duration(600)
        .attr("stroke-width", 2)
        .on("end", function repeat() {
          d3.select(this)
            .transition()
            .duration(600)
            .attr("stroke-width", 4)
            .transition()
            .duration(600)
            .attr("stroke-width", 2)
            .on("end", repeat);
        });
    }
  }, [accentedNode, isInitialized]);
  
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
    if (d.type === "authored") {
      return "#28a745"; // Keep green for authorship
    }
    
    if (d.type === "cites") {
      // Get source and target nodes - use optional chaining to avoid errors
      const sourceNode = typeof d.source === 'object' ? d.source : graphData?.nodes?.find(n => n.id === d.source);
      const targetNode = typeof d.target === 'object' ? d.target : graphData?.nodes?.find(n => n.id === d.target);
      
      // If both papers belong to the same community, color by community
      if (sourceNode && targetNode && 
          sourceNode?.type === 'paper' && targetNode?.type === 'paper' &&
          sourceNode?.community !== undefined && 
          targetNode?.community !== undefined && 
          sourceNode.community === targetNode.community) {
        
        // Generate color based on community ID
        return getCommunityColor(sourceNode.community);
      }
      
      // Default citation colors
      return d.is_influential ? "#6c757d" : "#adb5bd";
    }
    
    return "#999"; // Default
  }
  
  // Global function for marker ends
  function getMarkerEnd(d, svgElement) {
    if (d.type !== "cites") return null;
    
    // For citation edges between papers in the same community
    const sourceNode = typeof d.source === 'object' ? d.source : graphData?.nodes?.find(n => n.id === d.source);
    const targetNode = typeof d.target === 'object' ? d.target : graphData?.nodes?.find(n => n.id === d.target);
    
    if (sourceNode && targetNode && 
        sourceNode.type === 'paper' && targetNode.type === 'paper' &&
        sourceNode.community !== undefined && 
        targetNode.community !== undefined && 
        sourceNode.community === targetNode.community) {
      
      // Create a specific marker for each community if it doesn't exist
      const communityId = sourceNode.community;
      const markerId = `arrow-community-${communityId}`;
      
      // If we have an SVG element, check and create the marker if needed
      if (svgElement) {
        const svg = d3.select(svgElement);
        if (svg.select(`#${markerId}`).empty()) {
          svg.select("defs")
            .append("marker")
            .attr("id", markerId)
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 15)
            .attr("refY", 0)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("path")
            .attr("fill", getCommunityColor(communityId))
            .attr("d", "M0,-5L10,0L0,5");
        }
      }
      
      return `url(#${markerId})`;
    }
    
    return "url(#arrow)"; // Default arrow
  }
  
  // Global community color function for use outside the useEffect
  function getCommunityColor(communityId) {
    // Define a color palette for communities
    const communityColors = [
      "#1f77b4", // blue
      "#ff7f0e", // orange
      "#2ca02c", // green
      "#d62728", // red
      "#9467bd", // purple
      "#8c564b", // brown
      "#e377c2", // pink
      "#7f7f7f", // gray
      "#bcbd22", // olive
      "#17becf", // teal
      "#aec7e8", // light blue
      "#ffbb78", // light orange
      "#98df8a", // light green
      "#ff9896", // light red
      "#c5b0d5", // light purple
      "#c49c94", // light brown
      "#f7b6d2", // light pink
      "#c7c7c7", // light gray
      "#dbdb8d", // light olive
      "#9edae5"  // light teal
    ];
    
    // Ensure communityId is a number and within range
    const numericId = typeof communityId === 'number' ? communityId : parseInt(communityId, 10);
    if (isNaN(numericId)) return "#999"; // Default gray for invalid IDs
    
    return communityColors[numericId % communityColors.length];
  }
  
  // Create drag behavior with direct reference to simulationRef
  function createDragBehavior() {
    function dragstarted(event, d) {
      if (!event.active && simulationRef.current) {
        simulationRef.current.alphaTarget(0.3).restart();
      }
      d.fx = d.x;
      d.fy = d.y;
    }
    
    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }
    
    function dragended(event, d) {
      if (!event.active && simulationRef.current) {
        simulationRef.current.alphaTarget(0);
      }
      d.fx = null;
      d.fy = null;
    }
    
    return d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended);
  }

  // Add legend with community colors when available
  const getCommunityLegendItems = () => {
    if (!graphData || !graphData.nodes) return [];
    
    // Check if we have any nodes with community information
    const paperNodes = graphData.nodes.filter(n => n.type === 'paper' && n.community !== undefined);
    if (paperNodes.length === 0) return [];
    
    // Get unique community IDs
    const communityIds = [...new Set(paperNodes.map(n => n.community))];
    
    // Return legend items
    return communityIds.map(id => {
      return {
        id: id,
        color: getCommunityColor(id),
        size: paperNodes.filter(n => n.community === id).length
      };
    }).sort((a, b) => b.size - a.size); // Sort by community size
  };

  // Toggle community colors
  const toggleCommunities = () => {
    setShowCommunities(!showCommunities);
  };

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
      
      {/* Legend with inline styles - increased font size */}
      <div style={{
        position: "absolute",
        top: "16px",
        right: "16px",
        backgroundColor: "white",
        opacity: 0.9,
        padding: "12px",
        borderRadius: "6px",
        boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
        fontSize: "14px", // Increased from 12px
        zIndex: 10
      }}>
        <h3 style={{fontWeight: "bold", marginBottom: "8px", fontSize: "16px"}}>Legend</h3>
        <div style={{display: "flex", alignItems: "center", marginBottom: "4px"}}>
          <div style={{
            width: "12px", 
            height: "12px", 
            borderRadius: "50%", 
            backgroundColor: "#FF6B6B", 
            marginRight: "8px"
          }}></div>
          <span>Seed Paper</span>
        </div>
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
          <div style={{display: "flex", alignItems: "center", marginBottom: "4px"}}>
            <div style={{
              width: "16px", 
              height: "0", 
              borderTop: "2px solid #008080", 
              marginRight: "8px"
            }}></div>
            <span>Cycle</span>
          </div>
        )}
        
        {/* Community toggle */}
        {getCommunityLegendItems().length > 0 && (
          <div style={{
            marginTop: "16px",
            padding: "8px 0",
            borderTop: "1px solid #eee",
            borderBottom: getCommunityLegendItems().length > 0 && showCommunities ? "1px solid #eee" : "none"
          }}>
            <button 
              onClick={toggleCommunities}
              style={{
                backgroundColor: showCommunities ? "#4CAF50" : "#f8f9fa",
                border: "1px solid #ced4da",
                borderRadius: "4px",
                padding: "6px 10px",
                fontSize: "14px",
                fontWeight: "bold",
                color: showCommunities ? "white" : "#333",
                cursor: "pointer",
                width: "100%",
                textAlign: "center",
                transition: "background-color 0.3s, color 0.3s"
              }}
            >
              {showCommunities ? "Hide Communities" : "Show Communities"}
            </button>
          </div>
        )}
        
        {/* Community legend items - Only show when communities are enabled */}
        {getCommunityLegendItems().length > 0 && showCommunities && (
          <>
            <h4 style={{fontWeight: "bold", marginTop: "12px", marginBottom: "6px", fontSize: "15px"}}>Communities</h4>
            {getCommunityLegendItems().slice(0, 10).map(community => (
              <div key={`community-${community.id}`} style={{display: "flex", alignItems: "center", marginBottom: "4px"}}>
                <div style={{
                  width: "16px", 
                  height: "16px", 
                  borderRadius: "50%",
                  backgroundColor: community.color, 
                  marginRight: "8px"
                }}></div>
                <span>Community {community.id} ({community.size} papers)</span>
              </div>
            ))}
            {getCommunityLegendItems().length > 10 && (
              <div style={{fontSize: "12px", fontStyle: "italic", marginTop: "4px"}}>
                + {getCommunityLegendItems().length - 10} more communities
              </div>
            )}
          </>
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
        fontSize: '13px', // Increased from 12px
        color: '#4B5563',
        zIndex: 10
      }}>
        Rendering: {renderStats.nodes} nodes, {renderStats.edges} edges
        {renderStats.time > 0 && ` (${renderStats.time}ms)`}
      </div>
    </div>
  );
}