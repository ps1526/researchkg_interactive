from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
import traceback
from dotenv import load_dotenv
from citation_graph.citation_graph_builder import EnhancedCitationGraphBuilder
from citation_graph.utils import validate_input, format_graph_for_json, get_graph_statistics

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "https://researchkg.onrender.com"}})
load_dotenv()
@app.route('/api/generate_graph', methods=['POST'])
def generate_graph():
    try:
        # Get JSON data from request
        data = request.get_json()
        
        # Extract parameters (with defaults)
        seed_paper = data.get('seedPaper', '')
        max_papers = int(data.get('maxPapers', 20))
        max_citations_per_paper = int(data.get('maxCitationsPerPaper', 3))
        
        # Validate input
        is_valid, error_message = validate_input(seed_paper, max_papers, max_citations_per_paper)
        if not is_valid:
            return jsonify({'error': error_message}), 400
        
        # Get API key from environment
        api_key =  os.environ.get('SEMANTIC_SCHOLAR_API_KEY')
        
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
        
        return jsonify(graph_data), 200
        
    except Exception as e:
        print(f"Error generating graph: {str(e)}")
        return jsonify({'error': f'Failed to generate graph: {str(e)}'}), 500

@app.route('/api/test', methods=['GET'])
def test():
    return jsonify({"status": "ok", "message": "Flask API is working"})

# For local development
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting Flask server on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=True)