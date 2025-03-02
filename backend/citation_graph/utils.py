import os
import json
import networkx as nx
from typing import Dict, List, Any, Optional

def validate_input(seed_paper: str, max_papers: int, max_citations_per_paper: int) -> tuple:
    """
    Validate API input parameters
    
    Returns:
        tuple: (is_valid, error_message)
    """
    if not seed_paper or len(seed_paper.strip()) < 5:
        return False, "Invalid seed paper. Please provide a valid title, DOI, or search term (at least 5 characters)"
    
    if max_papers < 1 or max_papers > 5000:
        return False, "Max papers must be between 1 and 5000"
        
    if max_citations_per_paper < 1 or max_citations_per_paper > 100:
        return False, "Max citations per paper must be between 1 and 100"
        
    return True, None

def format_graph_for_json(graph: nx.DiGraph) -> Dict[str, List[Dict[str, Any]]]:
    """
    Convert a NetworkX graph to a JSON-serializable format
    
    Args:
        graph: NetworkX DiGraph object
        
    Returns:
        Dict with nodes and edges lists
    """
    graph_data = {
        "nodes": [],
        "edges": []
    }
    
    # Add nodes to the response
    for node_id, attributes in graph.nodes(data=True):
        if node_id is None:
            continue
            
        node_data = {"id": node_id}
        for key, value in attributes.items():
            # Ensure all values are JSON serializable
            if isinstance(value, (dict, list)):
                node_data[key] = value
            else:
                node_data[key] = str(value)
        graph_data["nodes"].append(node_data)
    
    # Add edges to the response
    for source, target, attributes in graph.edges(data=True):
        if source is None or target is None:
            continue
            
        edge_data = {"source": source, "target": target}
        for key, value in attributes.items():
            # Ensure all values are JSON serializable
            if isinstance(value, (dict, list)):
                edge_data[key] = value
            else:
                edge_data[key] = str(value)
        graph_data["edges"].append(edge_data)
        
    return graph_data

def get_graph_statistics(graph: nx.DiGraph) -> Dict[str, Any]:
    """
    Calculate statistics about the graph
    
    Args:
        graph: NetworkX DiGraph object
        
    Returns:
        Dict with statistics
    """
    paper_nodes = [n for n, attrs in graph.nodes(data=True) if attrs.get('type') == 'paper']
    author_nodes = [n for n, attrs in graph.nodes(data=True) if attrs.get('type') == 'author']
    
    try:
        cycles = list(nx.simple_cycles(graph))
        cycle_count = len(cycles)
    except:
        cycle_count = 0
    
    return {
        "node_count": graph.number_of_nodes(),
        "edge_count": graph.number_of_edges(),
        "paper_count": len(paper_nodes),
        "author_count": len(author_nodes),
        "cycle_count": cycle_count
    }