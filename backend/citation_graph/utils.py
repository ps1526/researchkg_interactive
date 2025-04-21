import os
import json
import networkx as nx
from typing import Dict, List, Any, Optional

def validate_input(seed_paper: str, max_papers: int, max_citations_per_paper: int) -> tuple:
    """
    Validate user inputs for citation graph generation
    
    Args:
        seed_paper: The seed paper title or ID
        max_papers: Maximum number of papers to include
        max_citations_per_paper: Maximum citations per paper to include
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not seed_paper or seed_paper.strip() == "":
        return (False, "Please provide a seed paper title or ID")
    
    try:
        max_papers_int = int(max_papers)
        if max_papers_int < 1 or max_papers_int > 200:
            return (False, "Maximum papers must be between 1 and 200")
    except (ValueError, TypeError):
        return (False, "Maximum papers must be a number")
    
    try:
        max_citations_int = int(max_citations_per_paper)
        if max_citations_int < 1 or max_citations_int > 50:
            return (False, "Maximum citations per paper must be between 1 and 50")
    except (ValueError, TypeError):
        return (False, "Maximum citations per paper must be a number")
    
    return (True, "")

def format_graph_for_json(graph: nx.DiGraph) -> Dict:
    """
    Format NetworkX graph for JSON serialization
    
    Args:
        graph: NetworkX DiGraph object
        
    Returns:
        Dictionary with nodes and edges formatted for JSON
    """
    # Format nodes
    nodes = []
    for node_id, attrs in graph.nodes(data=True):
        node_data = {"id": node_id}
        node_data.update(attrs)
        nodes.append(node_data)
    
    # Format edges
    edges = []
    for source, target, attrs in graph.edges(data=True):
        edge_data = {
            "source": source,
            "target": target
        }
        edge_data.update(attrs)
        edges.append(edge_data)
    
    return {
        "nodes": nodes,
        "edges": edges
    }

def format_communities_for_json(graph: nx.DiGraph) -> Dict:
    """
    Format community data from graph for JSON serialization
    
    Args:
        graph: NetworkX DiGraph object with community attributes
        
    Returns:
        Dictionary with community information formatted for JSON
    """
    # Extract community information from nodes
    communities = {}
    community_sizes = {}
    
    for node_id, attrs in graph.nodes(data=True):
        if attrs.get('type') == 'paper' and 'community' in attrs:
            community_id = attrs['community']
            
            # Initialize community if not seen before
            if community_id not in communities:
                communities[community_id] = []
                community_sizes[community_id] = 0
            
            # Add node to community
            communities[community_id].append({
                "id": node_id,
                "title": attrs.get('title', ''),
                "year": attrs.get('year', ''),
                "citation_count": attrs.get('citation_count', 0)
            })
            
            community_sizes[community_id] += 1
    
    # Sort communities by size
    sorted_communities = sorted(
        [(community_id, papers) for community_id, papers in communities.items()],
        key=lambda x: len(x[1]),
        reverse=True
    )
    
    # Calculate statistics
    result = {
        "total_communities": len(communities),
        "communities": [
            {
                "id": community_id,
                "size": len(papers),
                "papers": sorted(papers, key=lambda p: p.get('citation_count', 0), reverse=True)
            }
            for community_id, papers in sorted_communities
        ],
        "stats": {
            "largest_community_size": max(community_sizes.values()) if community_sizes else 0,
            "smallest_community_size": min(community_sizes.values()) if community_sizes else 0,
            "average_community_size": sum(community_sizes.values()) / len(community_sizes) if community_sizes else 0,
            "distribution": community_sizes
        }
    }
    
    return result

def get_graph_statistics(graph: nx.DiGraph) -> Dict:
    """
    Compute statistics for the graph
    
    Args:
        graph: NetworkX DiGraph object
        
    Returns:
        Dictionary with graph statistics
    """
    paper_nodes = [n for n, attrs in graph.nodes(data=True) if attrs.get('type') == 'paper']
    author_nodes = [n for n, attrs in graph.nodes(data=True) if attrs.get('type') == 'author']
    
    citation_edges = [e for e in graph.edges() if graph.edges[e].get('type') == 'cites']
    authorship_edges = [e for e in graph.edges() if graph.edges[e].get('type') == 'authored']
    
    # Find oldest and newest papers
    # Handle both string and integer year values
    years = []
    for n, attrs in graph.nodes(data=True):
        if attrs.get('type') == 'paper' and attrs.get('year'):
            year_value = attrs.get('year')
            if isinstance(year_value, int):
                years.append(year_value)
            elif isinstance(year_value, str) and year_value.isdigit():
                years.append(int(year_value))
    
    oldest_year = min(years) if years else None
    newest_year = max(years) if years else None
    year_span = newest_year - oldest_year if oldest_year and newest_year else None
    
    # Find papers with most citations
    citation_counts = {n: attrs.get('citation_count', 0) 
                      for n, attrs in graph.nodes(data=True) 
                      if attrs.get('type') == 'paper'}
    
    most_cited_paper = max(citation_counts.items(), key=lambda x: x[1])[0] if citation_counts else None
    most_cited_count = citation_counts.get(most_cited_paper, 0) if most_cited_paper else 0
    
    # Find authors with most papers
    author_paper_counts = {}
    for author in author_nodes:
        author_paper_counts[author] = len(list(graph.neighbors(author)))
    
    most_prolific_author = max(author_paper_counts.items(), key=lambda x: x[1])[0] if author_paper_counts else None
    most_prolific_count = author_paper_counts.get(most_prolific_author, 0) if most_prolific_author else 0
    
    return {
        "paper_count": len(paper_nodes),
        "author_count": len(author_nodes),
        "citation_edge_count": len(citation_edges),
        "authorship_edge_count": len(authorship_edges),
        "oldest_paper_year": oldest_year,
        "newest_paper_year": newest_year,
        "year_span": year_span,
        "most_cited_paper": most_cited_paper,
        "most_cited_count": most_cited_count,
        "most_prolific_author": most_prolific_author,
        "most_prolific_count": most_prolific_count
    }