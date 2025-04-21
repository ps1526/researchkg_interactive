# Citation Graph Analyzer

This tool allows you to create and analyze citation graphs for academic papers. It uses the Semantic Scholar API to retrieve paper data and build a citation graph, and can optionally use Google's Gemini to perform analysis of the graph.

## Features

- Generate citation graphs from a seed paper
- Visualize citation networks and relationships
- Identify citation cycles and research communities
- Analyze citation data using LLM (Gemini)
- Generate literature reviews of research domains

## LLM Analysis Features

The tool now supports advanced analysis of citation graphs using Google's Gemini LLM:

1. **Literature Review**: Generate comprehensive literature reviews based on the graph
2. **Citation Cycle Analysis**: Analyze what citation cycles mean in the research community
3. **Custom Analysis**: Ask any question about the citation graph

## Setup

### Prerequisites

- Node.js (16+)
- Python (3.8+)
- API keys (optional):
  - Semantic Scholar API key for higher rate limits
  - Google API key for Gemini access

### Environment Variables

Create a `.env` file in the root directory with the following variables:

```
SEMANTIC_SCHOLAR_API_KEY=your_semantic_scholar_api_key
GOOGLE_API_KEY=your_gemini_api_key
```

### Installation

1. Clone the repository
2. Install backend dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```
3. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```

## Usage

### Web Interface

1. Start the development server:
   ```bash
   cd frontend
   npm run dev
   ```
2. Open your browser and navigate to `http://localhost:3000`
3. Upload a citation graph JSON file or generate a new one
4. Use the analysis tools in the interface

### Command Line

You can also use the tool from the command line:

```bash
# Generate a citation graph
python backend/run_citation_graph.py --seed "Attention is All You Need" --max-papers 30 --max-citations 5 > citation_graph.json

# Generate a graph with LLM analysis
python backend/run_citation_graph.py --seed "Attention is All You Need" --max-papers 30 --max-citations 5 --analyze --analysis-type literature > citation_graph_with_analysis.json

# Analyze citation cycles
python backend/run_citation_graph.py --seed "Attention is All You Need" --max-papers 30 --max-citations 5 --analyze --analysis-type cycles > citation_cycles_analysis.json

# Custom analysis
python backend/run_citation_graph.py --seed "Attention is All You Need" --max-papers 30 --max-citations 5 --analyze --analysis-type custom --analysis-query "How has the transformer architecture evolved over time?" > custom_analysis.json
```

## Implementation Notes

The LLM integration uses a cost-effective approach:
- In-memory processing of graph data instead of ElasticSearch
- Caching of analysis results to minimize API calls
- Chunking of large graphs to stay within context limits
- Efficient graph summarization to reduce token usage 