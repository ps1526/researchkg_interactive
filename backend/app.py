from flask import Flask, request, jsonify, session, send_file, Response, stream_with_context
from flask_cors import CORS
import os
import json
import traceback
import time
from datetime import datetime, timedelta
from dotenv import load_dotenv
from citation_graph.citation_graph_builder import EnhancedCitationGraphBuilder
from citation_graph.utils import validate_input, format_graph_for_json, get_graph_statistics, format_communities_for_json
from citation_graph.graph_analyzer import GraphAnalyzer
from firebase_config import require_auth, GraphStorage

# Import the graph analyzer 
try:
    print("Using GraphAnalyzer for citation graph analysis")
except Exception as e:
    print(f"ERROR IMPORTING GRAPH ANALYZER: {e}")
    traceback.print_exc()

# Initialize Flask app
app = Flask(__name__)
# Configure CORS properly for your frontend
frontend_url = os.environ.get('FRONTEND_URL', '*')
CORS(app, resources={
    r"/*": {
        "origins": frontend_url,
        "methods": ["GET", "POST", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True,
        "expose_headers": ["Content-Type", "Authorization"]
    }
})
# Load environment variables
load_dotenv()

# Initialize the graph storage
graph_storage = GraphStorage()

# Simple memory cache for API requests
api_cache = {}

# Add debugging route
@app.route('/debug', methods=['GET'])
def debug():
    """Debug endpoint to check if the server is working properly"""
    return jsonify({
        "status": "ok",
        "environment": {
            "api_key_set": bool(os.environ.get("GOOGLE_API_KEY")),
            "python_version": os.sys.version,
            "app_directory": os.getcwd()
        }
    })

@app.before_request
def before_request():
    """Log request details before processing"""
    if request.path == '/analyze' and request.method == 'POST':
        print("\n" + "=" * 80)
        print(f"INCOMING REQUEST: {request.method} {request.path}")
        print(f"Content-Type: {request.headers.get('Content-Type')}")
        print(f"Content-Length: {request.headers.get('Content-Length')}")
        
        # Only print request body for JSON content
        if request.is_json:
            # Get a copy of the raw data
            raw_data = request.get_data()
            print(f"Raw data size: {len(raw_data)} bytes")
            
            # Try to parse and print first 500 characters
            try:
                data = json.loads(raw_data)
                print("Request data overview:")
                if 'graph_data' in data:
                    graph = data['graph_data']
                    nodes = graph.get('nodes', [])
                    edges = graph.get('edges', [])
                    print(f"- Graph data: {len(nodes)} nodes, {len(edges)} edges")
                if 'query' in data:
                    print(f"- Query: {data['query'][:100]}...")
                if 'analysis_type' in data:
                    print(f"- Analysis type: {data['analysis_type']}")
            except Exception as e:
                print(f"Error parsing request data: {e}")
                print(f"Raw data sample: {raw_data[:200]}...")
        
        print("=" * 80)

@app.route('/api/generate_graph', methods=['POST'])
def generate_graph():
    try:
        start_time = time.time()
        
        # Get JSON data from request
        data = request.get_json()
        
        # Extract parameters (with defaults)
        seed_paper = data.get('seedPaper', '')
        max_papers = int(data.get('maxPapers', 20))
        max_citations_per_paper = int(data.get('maxCitationsPerPaper', 3))
        
        # New parameter for controlling cycle detection
        detect_cycles = data.get('detectCycles', True)
        max_cycles = int(data.get('maxCycles', 100))
        
        # New parameter for community detection
        detect_communities = data.get('detectCommunities', True)
        
        # Log processing start
        print(f"Processing graph request: seed={seed_paper}, max_papers={max_papers}, max_citations={max_citations_per_paper}, detect_cycles={detect_cycles}, detect_communities={detect_communities}")
        
        # Validate input
        is_valid, error_message = validate_input(seed_paper, max_papers, max_citations_per_paper)
        if not is_valid:
            return jsonify({'error': error_message}), 400
        
        # Get API key from environment
        api_key = os.environ.get('SEMANTIC_SCHOLAR_API_KEY')
        if not api_key:
            print("Warning: No SEMANTIC_SCHOLAR_API_KEY found in environment")
        
        # Initialize graph builder
        graph_builder = EnhancedCitationGraphBuilder(
            api_key=api_key,
            max_papers=max_papers
        )
        
        # Build the graph
        graph = graph_builder.build_cyclic_citation_graph(
            seed_paper,
            max_per_direction=max_citations_per_paper
        )
        
        # Format graph data for JSON response
        graph_data = format_graph_for_json(graph)
        
        # Add statistics
        stats = get_graph_statistics(graph)
        graph_data["statistics"] = stats
        
        # Format community data if communities were detected
        if detect_communities:
            community_data = format_communities_for_json(graph)
            graph_data["communities"] = community_data
        
        # Find and analyze cycles if requested
        if detect_cycles:
            print("Finding citation cycles in the graph...")
            cycles = find_all_cycles(graph_data["nodes"], graph_data["edges"], max_cycles)
            
            # Create a map of node IDs to node data for cycle analysis
            nodes_map = {node["id"]: node for node in graph_data["nodes"]}
            
            # Analyze the cycles
            cycle_analysis = analyze_cycles(cycles, nodes_map)
            
            graph_data["cycles"] = cycles
            graph_data["cycle_analysis"] = cycle_analysis
            
            # Update statistics
            stats["cycle_count"] = len(cycles)
            if cycles:
                stats["avg_cycle_length"] = cycle_analysis["avg_length"]
                stats["max_cycle_length"] = cycle_analysis["max_length"]
        
        processing_time = time.time() - start_time
        print(f"Graph generation completed in {processing_time:.2f} seconds")
        
        # Add processing time to response
        graph_data["processing_time"] = processing_time
        
        return jsonify(graph_data), 200
        
    except Exception as e:
        print(f"Error generating graph: {str(e)}")
        print(traceback.format_exc())  # More detailed error logging
        return jsonify({'error': f'Failed to generate graph: {str(e)}'}), 500

def find_all_cycles(nodes, edges, max_cycles=-1):
    """
    Find all citation cycles in the graph, not just those connected to the seed paper.
    This algorithm uses Tarjan's algorithm to find strongly connected components, 
    then extracts cycles from each component.
    
    Args:
        nodes: List of nodes in the graph
        edges: List of edges in the graph
        max_cycles: Maximum number of cycles to find (-1 for unlimited)
    
    Returns:
        List of cycles, where each cycle is a list of node IDs
    """
    print(f"Finding cycles in graph with {len(nodes)} nodes and {len(edges)} edges")
    start_time = time.time()
    
    # Create an adjacency list representation of the graph
    graph = {}
    
    # Initialize empty arrays for each node
    for node in nodes:
        graph[node["id"]] = []
    
    # Add directed edges
    for edge in edges:
        if edge["type"] == 'cites' and edge["source"] in graph:
            graph[edge["source"]].append(edge["target"])
    
    # Find strongly connected components using Tarjan's algorithm
    def tarjan_scc():
        index_counter = [0]
        index = {}
        lowlink = {}
        onstack = set()
        stack = []
        scc_list = []
        
        def strongconnect(node):
            # Set the depth index for node
            index[node] = index_counter[0]
            lowlink[node] = index_counter[0]
            index_counter[0] += 1
            stack.append(node)
            onstack.add(node)
            
            # Consider successors of node
            for successor in graph.get(node, []):
                if successor not in index:
                    # Successor has not yet been visited; recurse on it
                    strongconnect(successor)
                    lowlink[node] = min(lowlink[node], lowlink[successor])
                elif successor in onstack:
                    # Successor is in stack and hence in the current SCC
                    # If successor is not on stack, then (node, successor) is a cross-edge in the DFS tree
                    lowlink[node] = min(lowlink[node], index[successor])
            
            # If node is a root node, pop the stack and generate an SCC
            if lowlink[node] == index[node]:
                # Start a new strongly connected component
                scc = []
                while True:
                    successor = stack.pop()
                    onstack.remove(successor)
                    scc.append(successor)
                    if successor == node:
                        break
                scc_list.append(scc)
        
        # Main algorithm: do a DFS on each node
        for node in graph:
            if node not in index:
                strongconnect(node)
        
        return scc_list
    
    # Get strongly connected components
    sccs = tarjan_scc()
    
    # Filter for SCCs of size > 1 (potential cycles)
    potential_cycle_sccs = [scc for scc in sccs if len(scc) > 1]
    
    # Extract actual cycles from each SCC
    all_cycles = []
    
    for scc in potential_cycle_sccs:
        # Create a subgraph containing only nodes in this SCC
        subgraph = {node: [succ for succ in graph.get(node, []) if succ in scc] for node in scc}
        
        # Find cycles in this subgraph
        cycles_in_scc = []
        
        def find_cycles_dfs(node, path, visited):
            # Maximum number of cycles reached
            if max_cycles > 0 and len(all_cycles) + len(cycles_in_scc) >= max_cycles:
                return
            
            path.append(node)
            visited.add(node)
            
            for neighbor in subgraph.get(node, []):
                if neighbor in path:
                    # Found a cycle
                    cycle_start = path.index(neighbor)
                    cycle = path[cycle_start:]
                    cycles_in_scc.append(cycle)
                    if max_cycles > 0 and len(all_cycles) + len(cycles_in_scc) >= max_cycles:
                        return
                elif neighbor not in visited:
                    find_cycles_dfs(neighbor, path[:], visited.copy())
        
        # Start DFS from each node in the SCC
        for node in scc:
            find_cycles_dfs(node, [], set())
            
            # Check if we've reached the maximum number of cycles
            if max_cycles > 0 and len(all_cycles) + len(cycles_in_scc) >= max_cycles:
                break
        
        # Add unique cycles from this SCC to the main list
        for cycle in cycles_in_scc:
            # Check if this cycle (or a rotation of it) is already in all_cycles
            cycle_already_added = False
            cycle_set = set(cycle)
            for existing_cycle in all_cycles:
                if len(cycle) == len(existing_cycle) and set(existing_cycle) == cycle_set:
                    cycle_already_added = True
                    break
            
            if not cycle_already_added:
                all_cycles.append(cycle)
                
            # Check if we've reached the maximum number of cycles
            if max_cycles > 0 and len(all_cycles) >= max_cycles:
                break
        
        # Check if we've reached the maximum number of cycles
        if max_cycles > 0 and len(all_cycles) >= max_cycles:
            break
    
    # Sort cycles by length (shortest first)
    all_cycles.sort(key=len)
    
    print(f"Found {len(all_cycles)} cycles in {time.time() - start_time:.2f} seconds")
    return all_cycles

def analyze_cycles(cycles, nodes_map):
    """
    Analyze the found cycles to provide insights.
    
    Args:
        cycles: List of cycles found
        nodes_map: Map of node IDs to node data
    
    Returns:
        Dictionary with cycle analysis
    """
    # Safety check for inputs
    if not cycles or not isinstance(cycles, list):
        print("Warning: No cycles to analyze or invalid cycles format")
        return {"count": 0}
    if not cycles:
        return {"count": 0}
    
    cycle_lengths = [len(cycle) for cycle in cycles]
    
    # Group cycles by length
    length_groups = {}
    for i, cycle in enumerate(cycles):
        cycle_len = len(cycle)
        if cycle_len not in length_groups:
            length_groups[cycle_len] = []
        length_groups[cycle_len].append(i)  # Store the index of the cycle
    
    # Get years for papers in cycles
    years_by_cycle = []
    for cycle in cycles:
        cycle_years = []
        for node_id in cycle:
            node = nodes_map.get(node_id)
            if node and node.get("type") == 'paper' and node.get("year"):
                try:
                    # Make sure the year is properly converted to integer
                    cycle_years.append(int(node["year"]))
                except (ValueError, TypeError):
                    # Skip years that can't be converted to integers
                    print(f"Warning: Non-integer year value encountered: {node.get('year')}")
                    continue
        years_by_cycle.append(cycle_years)
    
    # Classify cycles by time direction
    chronological_cycles = []
    reversed_cycles = []
    mixed_cycles = []
    
    for i, cycle_years in enumerate(years_by_cycle):
        if len(cycle_years) < 2:
            continue
            
        try:
            # Check if years are strictly increasing or decreasing
            is_increasing = all(cycle_years[j] < cycle_years[j+1] for j in range(len(cycle_years)-1))
            is_decreasing = all(cycle_years[j] > cycle_years[j+1] for j in range(len(cycle_years)-1))
        except TypeError:
            # Skip comparison if years can't be compared
            print(f"Warning: Unable to compare years in cycle {i}: {cycle_years}")
            continue
        
        if is_increasing:
            chronological_cycles.append(i)
        elif is_decreasing:
            reversed_cycles.append(i)
        else:
            mixed_cycles.append(i)
    
    # Identify cycles with influential papers
    influential_cycles = []
    for i, cycle in enumerate(cycles):
        has_influential = False
        for node_id in cycle:
            node = nodes_map.get(node_id)
            if node and node.get("type") == 'paper':
                try:
                    # Ensure citation_count is compared as integer
                    citation_count = int(node.get("citation_count", 0))
                    if citation_count > 100:
                        has_influential = True
                        break
                except (ValueError, TypeError):
                    # Skip if citation_count can't be converted to integer
                    print(f"Warning: Non-integer citation count: {node.get('citation_count')}")
                    continue
        if has_influential:
            influential_cycles.append(i)
    
    return {
        "count": len(cycles),
        "length_distribution": {str(length): len(indices) for length, indices in length_groups.items()},
        "avg_length": sum(cycle_lengths) / len(cycle_lengths),
        "max_length": max(cycle_lengths),
        "min_length": min(cycle_lengths),
        "chronological_cycles": len(chronological_cycles),
        "reversed_cycles": len(reversed_cycles),
        "mixed_cycles": len(mixed_cycles),
        "influential_cycles": len(influential_cycles),
    }

@app.route('/api/test', methods=['GET'])
def test():
    return jsonify({
        "status": "ok", 
        "message": "Flask API is working",
        "environment": "Render" if os.environ.get('RENDER') else "Local"
    })

# Health check endpoint for Render
@app.route('/', methods=['GET'])
def health_check():
    return "Service is up and running", 200

@app.route('/analyze', methods=['POST'])
def analyze_graph():
    try:
        data = request.get_json()
        graph_data = data.get('graph_data')
        query = data.get('query')
        chat_history = data.get('chat_history', [])
            
        # Validate graph data structure
        if not isinstance(graph_data, dict):
            print(f"Invalid graph data type: {type(graph_data)}")
            return jsonify({'error': 'Graph data must be a dictionary'}), 400
            
        if 'nodes' not in graph_data or 'edges' not in graph_data:
            print("Missing nodes or edges in graph data")
            return jsonify({'error': 'Graph data must contain nodes and edges'}), 400
            
        # Debug logging
        print(f"Processing analysis request:")
        print(f"Query: {query}")
        print(f"Number of nodes: {len(graph_data['nodes'])}")
        print(f"Number of edges: {len(graph_data['edges'])}")
        if graph_data['nodes']:
            print(f"Sample node: {graph_data['nodes'][0]}")
        if graph_data['edges']:
            print(f"Sample edge: {graph_data['edges'][0]}")
            
        # Create analyzer instance
        analyzer = GraphAnalyzer()
        
        # Perform analysis
        try:
            result = analyzer.analyze_graph(graph_data, query, chat_history)
            return jsonify({'analysis': result})
        except Exception as e:
            print(f"Error in analysis: {str(e)}")
            traceback.print_exc()
            return jsonify({'error': str(e)}), 500
        
    except Exception as e:
        print(f"Error in /analyze endpoint: {str(e)}")
        traceback.print_exc()  # Print full traceback for debugging
        return jsonify({'error': str(e)}), 500

@app.route('/analyze-stream', methods=['POST'])
def analyze_graph_stream():
    """Stream the analysis of the graph data"""
    try:
        # Parse the request data
        data = request.json
        
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        graph_data = data.get("graph_data")
        query = data.get("query", "")
        chat_history = data.get("chat_history", [])
        
        # Validate the data
        if not graph_data:
            return jsonify({"error": "No graph data provided"}), 400
        
        if not isinstance(graph_data, dict):
            return jsonify({"error": "Graph data must be a dictionary"}), 400
        
        if "nodes" not in graph_data or "edges" not in graph_data:
            return jsonify({"error": "Graph data must contain nodes and edges"}), 400
        
        print(f"Received streaming analysis request. Query: {query}")
        print(f"Graph has {len(graph_data.get('nodes', []))} nodes and {len(graph_data.get('edges', []))} edges")
        print("Using Gemini free tier for analysis")
        
        if len(graph_data.get('nodes', [])) > 0:
            sample_node = graph_data['nodes'][0]
            print(f"Sample node: {json.dumps(sample_node)[:200]}...")
        
        if len(graph_data.get('edges', [])) > 0:
            sample_edge = graph_data['edges'][0]
            print(f"Sample edge: {json.dumps(sample_edge)[:200]}...")
        
        # Initialize the graph analyzer
        analyzer = GraphAnalyzer()
        
        # Define generator function for streaming response
        def generate():
            analysis_result = ""
            
            # Process the analysis in smaller chunks for streaming
            # Get initial context/summary
            yield "Analyzing the citation graph"
            time.sleep(0.5)
            
            # Start forming the response gradually
            intro_text = "Based on the citation graph, "
            for char in intro_text:
                analysis_result += char
                yield char
                time.sleep(0.02)  # Small delay for streaming effect
            
            # Process the actual analysis
            for chunk in analyzer.analyze_graph_stream(graph_data, query):
                yield chunk
        
        # Return the streaming response
        return Response(stream_with_context(generate()), 
                      content_type='text/plain')
                      
    except Exception as e:
        print(f"Error in analyze_graph_stream: {str(e)}")
        return jsonify({"error": str(e)}), 500

# Firebase integration routes
@app.route('/api/graphs', methods=['POST'])
@require_auth
def save_user_graph():
    """
    Save a citation graph for a logged-in user - ultra simplified
    
    Request body should contain the graph data as JSON
    
    Returns:
        JSON object with the ID of the saved graph
    """
    try:
        # Get the user ID from the decoded token
        user_id = request.user['uid']
        
        # Get the graph data from the request
        graph_data = request.get_json()
        
        if not graph_data:
            return jsonify({"error": "No graph data provided"}), 400
        
        # Save the complete graph data
        graph_id = graph_storage.save_graph(user_id, graph_data)
        
        # Return the graph ID
        return jsonify({"id": graph_id, "message": "Graph saved successfully"}), 200
        
    except Exception as e:
        print(f"Error saving graph: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": f"Failed to save graph: {str(e)}"}), 500

@app.route('/api/graphs', methods=['GET'])
@require_auth
def list_user_graphs():
    """
    Get a list of all graphs created by the logged-in user
    
    Returns:
        JSON array of graph metadata
    """
    try:
        # Get the user ID from the decoded token
        user_id = request.user['uid']
        
        # Get the list of graphs
        graphs = graph_storage.list_user_graphs(user_id)
        
        # Return the list
        return jsonify({"graphs": graphs}), 200
        
    except Exception as e:
        print(f"Error listing graphs: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": f"Failed to list graphs: {str(e)}"}), 500

@app.route('/api/graphs/<graph_id>', methods=['GET'])
@require_auth
def get_user_graph(graph_id):
    """
    Get a specific graph by ID - ultra simplified
    
    Args:
        graph_id: ID of the graph to retrieve
        
    Returns:
        JSON object containing the complete graph data
    """
    try:
        # Get the user ID from the decoded token
        user_id = request.user['uid']
        
        # Get the document containing the graph
        doc = graph_storage.get_graph(graph_id, user_id)
        
        if not doc:
            return jsonify({"error": "Graph not found or access denied"}), 404
        
        # Get the graph data from the document
        if 'graph_data' not in doc:
            return jsonify({"error": "Graph data is missing from document"}), 500
        
        # Return the complete graph data exactly as stored
        return jsonify({"graph": doc['graph_data']}), 200
        
    except Exception as e:
        print(f"Error retrieving graph: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": f"Failed to retrieve graph: {str(e)}"}), 500

@app.route('/api/graphs/<graph_id>', methods=['DELETE'])
@require_auth
def delete_user_graph(graph_id):
    """
    Delete a specific graph by ID
    
    Args:
        graph_id: ID of the graph to delete
        
    Returns:
        JSON object with success message
    """
    try:
        # Get the user ID from the decoded token
        user_id = request.user['uid']
        
        # Delete the graph
        success = graph_storage.delete_graph(graph_id, user_id)
        
        if not success:
            return jsonify({"error": "Graph not found or access denied"}), 404
            
        # Return success message
        return jsonify({"message": "Graph deleted successfully"}), 200
        
    except Exception as e:
        print(f"Error deleting graph: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": f"Failed to delete graph: {str(e)}"}), 500

@app.route('/api/user', methods=['GET'])
@require_auth
def get_user_profile():
    """
    Get the profile of the logged-in user
    
    Returns:
        JSON object containing user profile information
    """
    try:
        # Get the user ID from the decoded token
        user_id = request.user['uid']
        
        # Get user info from the decoded token
        user_info = {
            'uid': user_id,
            'email': request.user.get('email', ''),
            'name': request.user.get('name', ''),
            'picture': request.user.get('picture', '')
        }
        
        return jsonify({"user": user_info}), 200
        
    except Exception as e:
        print(f"Error getting user profile: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": f"Failed to get user profile: {str(e)}"}), 500

# Run the app
if __name__ == '__main__':
    import argparse
    
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Run the ResearchKG backend server')
    parser.add_argument('--port', type=int, default=8080, help='Port to run the server on')
    args = parser.parse_args()
    
    port = args.port
    print(f"Starting backend server on port {port}")
    
    try:
        app.run(debug=True, host='0.0.0.0', port=port)
    except OSError as e:
        if "Address already in use" in str(e):
            alt_port = 8081 if port == 8080 else 8080
            print(f"Port {port} is already in use. Trying alternative port {alt_port}...")
            try:
                app.run(debug=True, host='0.0.0.0', port=alt_port)
            except Exception as e2:
                print(f"Failed to start server on alternative port: {e2}")
        else:
            print(f"Error starting server: {e}")