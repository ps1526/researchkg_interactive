#!/usr/bin/env python
import json
import argparse
import os
import sys
import traceback
from citation_graph_builder import EnhancedCitationGraphBuilder

def main():
    # Redirect print statements to stderr
    # This ensures only the JSON output goes to stdout
    original_stdout = sys.stdout
    sys.stdout = sys.stderr
    
    try:
        # Parse command line arguments
        parser = argparse.ArgumentParser(description='Generate citation graph')
        parser.add_argument('--seed', required=True, help='Seed paper title, DOI, or search term')
        parser.add_argument('--max-papers', type=int, default=20, help='Maximum number of papers')
        parser.add_argument('--max-citations', type=int, default=3, help='Maximum citations per paper')
        args = parser.parse_args()
        
        # Log parameters to stderr
        print(f"Resolving seed paper: {args.seed}", file=sys.stderr)
        print(f"Max papers: {args.max_papers}", file=sys.stderr)
        print(f"Max citations per paper: {args.max_citations}", file=sys.stderr)
        
        # Get API key from environment
        api_key = os.environ.get('SEMANTIC_SCHOLAR_API_KEY')
        
        # Initialize graph builder
        graph_builder = EnhancedCitationGraphBuilder(
            api_key=api_key,
            max_papers=args.max_papers
        )
        
        # Build the graph
        graph = graph_builder.build_cyclic_citation_graph(
            args.seed,
            max_per_direction=args.max_citations
        )
        
        # Convert graph to JSON format
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
        
        # Restore stdout for JSON output
        sys.stdout = original_stdout
        
        # Output the graph data as JSON to stdout with compact encoding
        # Use a clean print statement to avoid any leading/trailing whitespace or text
        print(json.dumps(graph_data, separators=(',', ':')))
        
    except Exception as e:
        # Print error message to stderr
        print(f"Error: {str(e)}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
    finally:
        # Restore stdout in case of early return
        sys.stdout = original_stdout

if __name__ == "__main__":
    main()