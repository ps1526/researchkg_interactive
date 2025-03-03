from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
import traceback
import time
from dotenv import load_dotenv
from citation_graph.citation_graph_builder import EnhancedCitationGraphBuilder
from citation_graph.utils import validate_input, format_graph_for_json, get_graph_statistics

# Initialize Flask app
app = Flask(__name__)

# Configure CORS properly for your Next.js frontend
frontend_url = os.environ.get('FRONTEND_URL', '*')
CORS(app, resources={r"/api/*": {"origins": frontend_url}})

# Load environment variables
load_dotenv()

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
        
        # Log processing start
        print(f"Processing graph request: seed={seed_paper}, max_papers={max_papers}, max_citations={max_citations_per_paper}")
        
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
        
        # Calculate processing time
        processing_time = time.time() - start_time
        print(f"Graph generated successfully in {processing_time:.2f} seconds")
        
        return jsonify(graph_data), 200
    except Exception as e:
        print(f"Error generating graph: {str(e)}")
        print(traceback.format_exc())  # More detailed error logging
        return jsonify({'error': f'Failed to generate graph: {str(e)}'}), 500

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

# For local development
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting Flask server on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=True)