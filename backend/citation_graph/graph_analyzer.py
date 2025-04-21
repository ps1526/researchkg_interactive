import json
import os
from typing import Dict, List, Any, Optional
import google.generativeai as genai
from functools import lru_cache
import re
from sklearn.metrics.pairwise import cosine_similarity
import traceback
from dotenv import load_dotenv
import networkx as nx
import time
import bisect
import numpy as np
from collections import defaultdict

class GraphAnalyzer:
    """
    A class that analyzes citation graphs using Google's Gemini API.
    This implementation focuses on cost-efficiency by:
    1. Using in-memory processing instead of ElasticSearch
    2. Caching results to minimize API calls
    3. Chunking large graphs to stay within context limits
    """

    def __init__(self):
        """Initialize the GraphAnalyzer with a Gemini model."""
        load_dotenv()
        
        self.genai = genai
        # Check for both environment variable names
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("Google/Gemini API key not found in environment. Please set GOOGLE_API_KEY or GEMINI_API_KEY.")
            
        self.genai.configure(api_key=api_key)
        print(f"Initialized GraphAnalyzer with Gemini API")
        
        # Try with more cost-effective models first
        model_priority = [
            'gemini-1.5-flash-8b',      # First priority (most cost-effective)
            'gemini-1.5-flash',
            'gemini-1.0-flash',
            'gemini-pro',               # Fallback options
            'models/gemini-pro',
            'gemini-1.0-pro'
        ]
        
        # Try models in priority order
        for model_name in model_priority:
            try:
                print(f"Attempting to initialize model: {model_name}")
                self.model = genai.GenerativeModel(model_name)
                print(f"Successfully using {model_name} model")
                break
            except Exception as e:
                print(f"Error initializing {model_name}: {e}")
        else:
            # If all specified models fail, try listing available models
            print("All specified models failed. Listing available models...")
            try:
                available_models = self.genai.list_models()
                model_names = [model.name for model in available_models]
                print(f"Available models: {model_names}")
                
                if model_names:
                    self.model = genai.GenerativeModel(model_names[0])
                    print(f"Using first available model: {model_names[0]}")
                else:
                    raise ValueError("No models available")
            except Exception as list_error:
                print(f"Error listing models: {list_error}")
                raise ValueError("Could not initialize any Gemini model")
                
        self.analysis_cache = {}
        
        # Cache for graph summary
        self._graph_summary = None
        self._current_graph_id = None
        
        # For advanced literature reviews
        self.paper_vectors = {}
        self.author_vectors = {}
        
    def _get_gemini_completion(self, prompt):
        """Get a completion from the Gemini model."""
        try:
            # Try to generate content with standard generation config
            try:
                # Parameters optimized for flash models (less tokens, higher temperature for creativity)
                response = self.model.generate_content(
                    prompt,
                    generation_config={
                        "temperature": 0.9,      # Higher temperature for flash models
                        "top_p": 0.9,            # Higher top_p for more diversity
                        "top_k": 40,
                        "max_output_tokens": 800,  # Reduced token limit for cost efficiency
                    }
                )
                return response.text
            except Exception as config_error:
                # If generation config parameters fail, try without them
                print(f"Error with generation config: {config_error}")
                print("Trying without generation config...")
                response = self.model.generate_content(prompt)
                return response.text
                
        except Exception as e:
            error_message = str(e)
            print(f"Error getting completion from Gemini: {error_message}")
            
            # Check for specific error types
            if "404" in error_message and "not found" in error_message:
                # List available models and try to use a different one
                try:
                    print("Model not found error. Listing available models...")
                    available_models = self.genai.list_models()
                    model_names = [model.name for model in available_models]
                    print(f"Available models: {model_names}")
                    
                    # Try with each available model
                    for model_name in model_names:
                        try:
                            print(f"Attempting to use model: {model_name}")
                            self.model = genai.GenerativeModel(model_name)
                            response = self.model.generate_content(prompt)
                            return response.text
                        except Exception as model_error:
                            print(f"Failed with model {model_name}: {model_error}")
                            continue
                            
                except Exception as list_error:
                    print(f"Error listing models: {list_error}")
            
            # If we can't recover, return a helpful error message
            return f"I encountered an error analyzing the graph. The error was: {error_message}"
    
    def _get_cached_result(self, query):
        """Get a cached result for a query if it exists."""
        cache_key = query.lower().strip()
        return self.analysis_cache.get(cache_key)
    
    def _cache_result(self, query, result):
        """Cache a result for a query."""
        cache_key = query.lower().strip()
        if len(self.analysis_cache) >= 20:  # Limit cache size
            self.analysis_cache.pop(next(iter(self.analysis_cache)))
        self.analysis_cache[cache_key] = result
        
    def _vectorize_graph(self, graph_data):
        """
        Create vector representations of papers and authors for efficient retrieval.
        
        Args:
            graph_data: The citation graph data
        """
        print("Creating vector representations of papers and authors...")
        
        # Reset vectors
        self.paper_vectors = {}
        self.author_vectors = {}
        
        # Extract nodes
        nodes = graph_data.get("nodes", [])
        edges = graph_data.get("edges", [])
        
        # Create paper vectors
        for node in nodes:
            if node.get("type") == "paper":
                paper_id = node.get("id")
                if not paper_id:
                    continue
                
                # Basic paper features
                citation_count = int(node.get("citation_count", 0)) if node.get("citation_count") is not None else 0
                year = int(node.get("year", 0)) if node.get("year") is not None else 0
                
                # Create feature vector
                features = [
                    citation_count,  # Citation count
                    year,            # Publication year
                    1.0              # Paper node type
                ]
                
                # Store paper data
                self.paper_vectors[paper_id] = {
                    "id": paper_id,
                    "title": node.get("title", ""),
                    "abstract": node.get("abstract", ""),
                    "year": node.get("year"),
                    "features": features,
                    "fields": node.get("fields_of_study", []),
                    "authors": []
                }
        
        # Create author vectors
        for node in nodes:
            if node.get("type") == "author":
                author_id = node.get("id")
                if not author_id:
                    continue
                
                # Basic author features
                h_index = int(node.get("h_index", 0)) if node.get("h_index") is not None else 0
                
                # Create feature vector
                features = [
                    0,      # Paper count (to be updated)
                    0,      # Total citations (to be updated)
                    h_index,  # H-index
                    0.0     # Author node type
                ]
                
                # Store author data
                self.author_vectors[author_id] = {
                    "id": author_id,
                    "name": node.get("name", ""),
                    "features": features,
                    "papers": []
                }
        
        # Process edges to connect papers and authors
        for edge in edges:
            edge_type = edge.get("type", "")
            source = edge.get("source")
            target = edge.get("target")
            
            if edge_type == "authored" or edge_type == "author":
                # Author to paper or paper to author edge
                author_id = source if edge_type == "author" else target
                paper_id = target if edge_type == "author" else source
                
                # Add author to paper
                if paper_id in self.paper_vectors and author_id in self.author_vectors:
                    # Connect paper to author
                    self.paper_vectors[paper_id]["authors"].append(author_id)
                    
                    # Connect author to paper
                    self.author_vectors[author_id]["papers"].append(paper_id)
            
        # Update paper count and citation counts for authors
        for author_id, author_data in self.author_vectors.items():
            papers = author_data["papers"]
            total_citations = 0
            
            for paper_id in papers:
                if paper_id in self.paper_vectors:
                    citation_count = self.paper_vectors[paper_id]["features"][0]
                    total_citations += citation_count
            
            # Update features
            author_data["features"][0] = len(papers)  # Paper count
            author_data["features"][1] = total_citations  # Total citations
            
        print(f"Created vectors for {len(self.paper_vectors)} papers and {len(self.author_vectors)} authors")
        return True
    
    def _prepare_graph_summary(self, graph_data):
        """
        Prepare a summary of the graph data for the language model.
        
        Args:
            graph_data (dict): The graph data containing nodes and edges
            
        Returns:
            str: A summary of the graph data
        """
        try:
            # Compute a hash of the graph data to identify if we need to regenerate the summary
            graph_id = str(hash(str(graph_data)))
            
            # If we already have a summary for this graph, return it
            if self._graph_summary and self._current_graph_id == graph_id:
                return self._graph_summary
                
            # Check if we have valid graph data
            if not graph_data:
                print("Warning: Empty graph data provided")
                self._graph_summary = "No graph data available."
                self._current_graph_id = graph_id
                return self._graph_summary
                
            if "nodes" not in graph_data or "edges" not in graph_data:
                print("Warning: Invalid graph data structure - missing nodes or edges")
                self._graph_summary = "Invalid graph data structure."
                self._current_graph_id = graph_id
                return self._graph_summary
                
            nodes = graph_data["nodes"]
            edges = graph_data["edges"]
            
            if not nodes or not edges:
                print("Warning: Empty nodes or edges lists")
                self._graph_summary = f"Graph has {len(nodes)} nodes and {len(edges)} edges."
                self._current_graph_id = graph_id
                return self._graph_summary
            
            # Count papers, authors, and other node types
            papers = [n for n in nodes if n.get("type") == "paper"]
            authors = [n for n in nodes if n.get("type") == "author"]
            
            # If no node has a type, assume they're all papers
            if not papers and not authors:
                print("Warning: No paper or author nodes found, assuming all nodes are papers")
                papers = nodes
            
            # Get citation counts for papers
            paper_citations = {}
            for edge in edges:
                if edge.get("source") and edge.get("target"):
                    # Assuming edges from papers to papers are citations
                    target = edge.get("target")
                    if target in paper_citations:
                        paper_citations[target] += 1
                    else:
                        paper_citations[target] = 1
            
            # Sort papers by citation count
            papers_with_citations = [(p, paper_citations.get(p.get("id"), 0)) for p in papers]
            top_papers = sorted(papers_with_citations, key=lambda x: x[1], reverse=True)[:50]  # Limit to top 50
            
            # Get author paper counts
            author_papers = {}
            for p in papers:
                author_id = p.get("author")
                if author_id:
                    if author_id in author_papers:
                        author_papers[author_id] += 1
                    else:
                        author_papers[author_id] = 1
            
            # Sort authors by paper count
            authors_with_papers = [(a, author_papers.get(a.get("id"), 0)) for a in authors]
            top_authors = sorted(authors_with_papers, key=lambda x: x[1], reverse=True)[:20]  # Limit to top 20
            
            # Find citation cycles (simplified approach)
            cycles = []
            try:
                # Convert to a directed graph
                G = nx.DiGraph()
                for edge in edges:
                    if edge.get("source") and edge.get("target"):
                        G.add_edge(edge["source"], edge["target"])
                
                # Find simple cycles
                cycles = list(nx.simple_cycles(G))
                # Limit to a reasonable number of cycles
                cycles = cycles[:5]
            except Exception as e:
                print(f"Error finding citation cycles: {str(e)}")
            
            # Build the summary text
            summary_parts = []
            
            # Basic graph info
            summary_parts.append(f"- This citation graph contains {len(papers)} papers and {len(authors)} authors.")
            summary_parts.append(f"- There are {len(edges)} citation connections between nodes.")
            
            if cycles:
                summary_parts.append(f"- The graph contains {len(cycles)} citation cycles.")
                
            # Top cited papers
            if top_papers:
                summary_parts.append("\nTop cited papers:")
                for i, (paper, citations) in enumerate(top_papers[:10]):  # Show only top 10
                    if i >= 10:
                        break
                    title = paper.get("title", "Untitled")
                    year = paper.get("year", "Unknown year")
                    summary_parts.append(f"- \"{title}\" ({year}): {citations} citations")
            
            # Top authors
            if top_authors:
                summary_parts.append("\nTop authors by publication count:")
                for i, (author, paper_count) in enumerate(top_authors[:5]):  # Show only top 5
                    if i >= 5:
                        break
                    name = author.get("name", "Unknown")
                    summary_parts.append(f"- {name}: {paper_count} papers")
            
            # Citation cycles
            if cycles:
                summary_parts.append("\nExample citation cycles:")
                for i, cycle in enumerate(cycles[:3]):  # Show only top 3
                    if i >= 3:
                        break
                    cycle_papers = []
                    for node_id in cycle:
                        # Find the corresponding paper
                        for paper in papers:
                            if paper.get("id") == node_id:
                                cycle_papers.append(paper.get("title", node_id))
                                break
                    summary_parts.append(f"- Cycle {i+1}: {' → '.join(cycle_papers)} → [back to first]")
            
            self._graph_summary = "\n".join(summary_parts)
            self._current_graph_id = graph_id
            return self._graph_summary
            
        except Exception as e:
            print(f"Error preparing graph summary: {str(e)}")
            error_summary = f"Error preparing graph summary: {str(e)}"
            self._graph_summary = error_summary
            self._current_graph_id = str(hash(str(graph_data)))
            return error_summary
    
    def _find_citation_cycles(self, graph_data: Dict[str, List[Dict[str, Any]]]) -> List[List[str]]:
        """
        Find citation cycles in the graph.
        
        Args:
            graph_data: The citation graph data with nodes and edges
            
        Returns:
            A list of cycles, where each cycle is a list of paper IDs
        """
        # Build an adjacency list
        adjacency = {}
        paper_titles = {}
        
        # Map paper IDs to titles
        for node in graph_data.get("nodes", []):
            if node.get("type") == "paper":
                paper_titles[node.get("id")] = node.get("title", "Unknown")
                adjacency[node.get("id")] = []
        
        # Add citation edges
        for edge in graph_data.get("edges", []):
            source = edge.get("source")
            target = edge.get("target")
            if source in adjacency and target in adjacency:
                adjacency[source].append(target)
        
        # Find cycles using DFS
        cycles = []
        visited = set()
        rec_stack = set()
        
        def dfs(node, path):
            if node in rec_stack:
                # Found a cycle
                cycle_start = path.index(node)
                cycle = path[cycle_start:]
                
                # Convert IDs to titles for readability
                cycle_with_titles = [{
                    "id": paper_id,
                    "title": paper_titles.get(paper_id, "Unknown")
                } for paper_id in cycle]
                
                cycles.append(cycle_with_titles)
                return
                
            if node in visited:
                return
                
            visited.add(node)
            rec_stack.add(node)
            path.append(node)
            
            for neighbor in adjacency.get(node, []):
                dfs(neighbor, path.copy())
                
            rec_stack.remove(node)
        
        # Start DFS from each node
        for node in adjacency:
            if node not in visited:
                dfs(node, [])
                
        return cycles
    
    def _extract_chat_context(self, query: str) -> tuple:
        """
        Extract chat history and current question from a formatted query.
        
        Args:
            query: The query string potentially containing chat history
            
        Returns:
            A tuple of (chat_history, current_question)
        """
        chat_history = []
        current_question = query
        
        # Check if this is a chat-style query with history
        if "CHAT HISTORY:" in query and "CURRENT QUESTION:" in query:
            # Extract the current question
            current_question_match = re.search(r'CURRENT QUESTION:(.*?)(?:\n\n|$)', query, re.DOTALL)
            if current_question_match:
                current_question = current_question_match.group(1).strip()
            
            # Extract chat history
            chat_history_match = re.search(r'CHAT HISTORY:(.*?)CURRENT QUESTION:', query, re.DOTALL)
            if chat_history_match:
                chat_history_text = chat_history_match.group(1).strip()
                # Parse messages in format "role: content"
                messages = re.findall(r'(user|assistant):(.*?)(?=\n\n(?:user|assistant):|$)', chat_history_text, re.DOTALL)
                chat_history = [{"role": role, "content": content.strip()} for role, content in messages]
                
        return chat_history, current_question
    
    def analyze_graph(self, graph_data, query, chat_history=None):
        # next step - > have llm feed input to itself and then create a feedback loop that helps it analyze the graph better 
        """
        Analyze the citation graph based on the user's query.
        Returns a text response from the language model.
        
        Args:
            graph_data (dict): The graph data containing nodes and edges
            query (str): The user's question or query about the graph
            chat_history (list, optional): List of previous messages
            
        Returns:
            str: The analysis result
        """
        try:
            # Check if we have a cached result for this query
            cached_result = self._get_cached_result(query)
            if cached_result:
                print("Using cached result for query")
                return cached_result
            
            # Prepare graph summary if not already cached
            if self._graph_summary is None or self._current_graph_id != str(hash(str(graph_data))):
                self._prepare_graph_summary(graph_data)
            
            # Check for paper-specific queries
            paper_query_patterns = [
                r"(?:tell me about|analyze|describe|explain|summarize|what is|information on|details about|abstract of)(?:\s+the\s+paper)?\s+[\"']([^\"']+)[\"']",
                r"(?:paper|article|publication|research)\s+[\"']([^\"']+)[\"']",
                r"(?:what does|can you analyze|abstract for|summary of)\s+[\"']([^\"']+)[\"']"
            ]
            
            # Check if this is a paper-specific query
            paper_title = None
            for pattern in paper_query_patterns:
                match = re.search(pattern, query, re.IGNORECASE)
                if match:
                    paper_title = match.group(1)
                    break
            
            # If paper title not found in patterns, check if any paper titles from the graph match the query
            if not paper_title and graph_data:
                for node in graph_data.get("nodes", []):
                    if node.get("type") == "paper" and node.get("title"):
                        title = node.get("title")
                        # If the title is a substantial part of the query
                        if title.lower() in query.lower() and len(title) > 15:  # Only match reasonably specific titles
                            paper_title = title
                            break
            
            # If a paper title was found, perform paper-specific analysis
            if paper_title:
                print(f"Detected paper-specific query for: {paper_title}")
                
                # Generate paper-specific context
                paper_context = self._prepare_paper_analysis(graph_data, paper_title)
                
                # Create a prompt focused on paper analysis
                prompt = f"""Citation Graph Paper Analysis:
{paper_context}

Question: {query}

IMPORTANT FORMATTING INSTRUCTIONS:
1. ALWAYS place paper titles in simple double quotes like "Paper Title"
2. NEVER use special formatting characters like brackets, braces, or angle brackets around paper titles
3. Use proper Markdown formatting:
   - For headings use: # Main Heading, ## Subheading
   - For bold text use: **bold text**
   - For italic text use: *italic text*
   - For bullet points use: - item or * item
4. Format author names as plain text without any special formatting
5. When mentioning paper titles, ALWAYS use the exact format: "Title of Paper"
6. Use clean, consistent formatting throughout your response
7. AVOID excessive whitespace or empty lines between paragraphs
8. Use at most ONE blank line between sections, never multiple blank lines
9. Place headings immediately after the previous paragraph with just one line break

Based on the information provided about the paper, please analyze:
1. The key contributions and innovations of this paper
2. How this paper relates to the broader research context in the citation graph
3. The significance of this work relative to the field
4. Any notable insights from its citation patterns (what papers it cites and what papers cite it)
5. Whether this appears to be foundational work or building on other research

Please provide your analysis in clear, well-formatted Markdown:

Analysis:"""

                # Get completion from the language model
                response_text = self._get_gemini_completion(prompt)
                
                # Cache the response
                if not response_text.startswith("I encountered an error"):
                    self._cache_result(query, response_text)
                
                return response_text
                
            # Determine if this is a graph-specific query or a general knowledge query
            graph_related_terms = ['graph', 'citation', 'paper', 'author', 'research', 'publication', 
                                  'literature', 'field', 'cite', 'cited', 'citing', 'references', 
                                  'theme', 'topic', 'relationship', 'network', 'connection', 'cycle']
            
            # Check if query contains graph-related terms
            is_graph_query = any(term in query.lower() for term in graph_related_terms)
            
            # If it's not clearly a graph query, check if it's asking about specific papers or authors in the graph
            if not is_graph_query and graph_data:
                paper_titles = []
                author_names = []
                
                for node in graph_data.get("nodes", []):
                    if node.get("type") == "paper" and node.get("title"):
                        paper_titles.append(node.get("title").lower())
                    elif node.get("type") == "author" and node.get("name"):
                        author_names.append(node.get("name").lower())
                
                # Check if query mentions any specific papers or authors
                query_lower = query.lower()
                if any(title in query_lower for title in paper_titles) or any(name in query_lower for name in author_names):
                    is_graph_query = True
            
            # Create appropriate prompt based on query type
            if is_graph_query:
                # Graph-specific prompt
                prompt = f"""Citation Graph:{self._graph_summary}
Question: {query}

IMPORTANT FORMATTING INSTRUCTIONS:
1. ALWAYS place paper titles in simple double quotes like "Paper Title"
2. NEVER use special formatting characters like brackets, braces, or angle brackets around paper titles
3. Use proper Markdown formatting:
   - For headings use: # Main Heading, ## Subheading
   - For bold text use: **bold text**
   - For italic text use: *italic text*
   - For bullet points use: - item or * item
4. Format author names as plain text without any special formatting
5. When mentioning paper titles, ALWAYS use the exact format: "Title of Paper"
6. Use clean, consistent formatting throughout your response
7. AVOID excessive whitespace or empty lines between paragraphs
8. Use at most ONE blank line between sections, never multiple blank lines
9. Place headings immediately after the previous paragraph with just one line break

Examples of CORRECT formatting:
- The paper "Attention is All You Need" by Vaswani et al.
- **Main findings**: "BERT" introduced a new approach to language modeling.
- ## Top Papers
- The researchers from Google published "Neural Machine Translation".

Examples of INCORRECT formatting:
- The paper "{{Attention is All You Need}}" by Vaswani et al.
- The paper >Attention is All You Need< by Vaswani et al.
- The paper Attention is All You Need by Vaswani et al.

IMPORTANT: Your analysis should be based ONLY on the citation graph data provided. If you don't find relevant information in the data, state that clearly.

Please provide your analysis in clear, well-formatted Markdown:

Analysis:"""
            else:
                # General knowledge prompt
                prompt = f"""Question: {query}

You are an AI research assistant specialized in academic research. You can answer general questions about science, research, academic topics, and technical subjects even if they're not related to the citation graph. 

IMPORTANT FORMATTING INSTRUCTIONS:
1. ALWAYS place paper titles in simple double quotes like "Paper Title"
2. Use proper Markdown formatting:
   - For headings use: # Main Heading, ## Subheading
   - For bold text use: **bold text**
   - For italic text use: *italic text*
   - For bullet points use: - item or * item
3. Keep your response clean and concise
4. AVOID excessive whitespace or empty lines between paragraphs

Please respond to the question based on your knowledge:

Analysis:"""
                print("Handling as a general knowledge query")
            
            # Get completion from the language model
            response_text = self._get_gemini_completion(prompt)
            
            # Only cache if it's not an error response
            if not response_text.startswith("I encountered an error analyzing the graph"):
                self._cache_result(query, response_text)
            
            # If it's a general query, add a prefatory note
            if not is_graph_query:
                response_text = "I don't see information about this in the citation graph, but I can answer based on my general knowledge:\n\n" + response_text
            
            return response_text
            
        except Exception as e:
            print(f"Error in analyze_graph: {str(e)}")
            import traceback
            traceback.print_exc()
            return f"I encountered an error while analyzing the graph: {str(e)}"
    
    def analyze_literature(self, graph_data: Dict[str, List[Dict[str, Any]]]) -> str:
        """
        Generate a literature review from the citation graph.
        This function creates a comprehensive literature review by:
        1. Sampling papers across different time periods
        2. Prioritizing papers by various importance metrics
        3. Analyzing citation patterns and research evolution
        
        Args:
            graph_data: The citation graph data with nodes and edges
            
        Returns:
            A literature review based on the citation graph
        """
        # Start by vectorizing the graph if not already done
        if not self.paper_vectors:
            self._vectorize_graph(graph_data)
            
        # Extract papers and ensure we have years
        papers_with_years = []
        for paper_id, paper_data in self.paper_vectors.items():
            if paper_data.get("year"):
                try:
                    year = int(paper_data.get("year"))
                    papers_with_years.append((paper_id, paper_data, year))
                except:
                    pass
                    
        # Sort by year
        papers_with_years.sort(key=lambda x: x[2])
        
        if not papers_with_years:
            return "Unable to generate a literature review as no papers with publication years were found."
            
        # Calculate time range and create bins
        earliest_year = papers_with_years[0][2]
        latest_year = papers_with_years[-1][2]
        time_span = latest_year - earliest_year
        
        # Create time periods (try to create 3-5 periods)
        num_periods = min(max(3, time_span // 5), 5)
        if num_periods <= 1:
            num_periods = 1
            period_size = time_span + 1
        else:
            period_size = time_span / num_periods
            
        time_periods = []
        for i in range(num_periods):
            start_year = earliest_year + int(i * period_size)
            end_year = earliest_year + int((i + 1) * period_size)
            if i == num_periods - 1:
                end_year = latest_year + 1  # Include the last year
            time_periods.append((start_year, end_year))
            
        # Calculate h-index for authors
        author_citation_counts = {}
        for author_id, author_data in self.author_vectors.items():
            papers = author_data.get("papers", [])
            if not papers:
                continue
                
            # Get citation counts for all papers
            citations = []
            for paper_id in papers:
                paper_data = self.paper_vectors.get(paper_id)
                if paper_data:
                    citation_count = paper_data["features"][0]  # citation count
                    citations.append(citation_count)
                    
            # Calculate h-index
            if citations:
                citations.sort(reverse=True)
                h_index = 0
                for i, count in enumerate(citations):
                    if count >= i + 1:
                        h_index = i + 1
                    else:
                        break
                        
                author_citation_counts[author_id] = {
                    "name": author_data.get("name", "Unknown"),
                    "h_index": h_index,
                    "total_citations": author_data["features"][1],
                    "paper_count": author_data["features"][0]
                }
        
        # Score papers based on multiple factors
        scored_papers = []
        
        for paper_id, paper_data, year in papers_with_years:
            citation_count = paper_data["features"][0]
            author_importance = 0
            
            # Calculate author importance based on h-index
            for author_id in paper_data.get("authors", []):
                author_data = author_citation_counts.get(author_id, {})
                author_importance += author_data.get("h_index", 0)
                
            # Calculate recency score (newer papers get higher score)
            recency = (year - earliest_year) / max(1, time_span)
            
            # Calculate final score as weighted sum of factors
            score = (
                citation_count * 0.5 +          # 50% weight on citations
                author_importance * 0.3 +       # 30% weight on author importance
                recency * 0.2                   # 20% weight on recency
            )
            
            scored_papers.append({
                "id": paper_id,
                "title": paper_data.get("title", "Unknown"),
                "year": year,
                "citation_count": citation_count,
                "score": score,
                "authors": paper_data.get("authors", []),
                "fields": paper_data.get("fields", [])
            })
            
        # Sample papers for the literature review, ensuring good distribution across time periods
        sampled_papers = []
        
        # Determine how many papers to sample (up to 50% of total, but at least 20 papers if available)
        total_papers = len(scored_papers)
        sample_size = min(total_papers, max(20, total_papers // 2))
        
        # Calculate how many papers to sample from each period
        papers_per_period = sample_size // num_periods
        
        # Ensure we sample at least one paper per period
        if papers_per_period == 0 and num_periods > 0:
            papers_per_period = 1
            
        # Group papers by time period
        papers_by_period = [[] for _ in range(num_periods)]
        
        for paper in scored_papers:
            year = paper["year"]
            for i, (start_year, end_year) in enumerate(time_periods):
                if start_year <= year < end_year:
                    papers_by_period[i].append(paper)
                    break
        
        # Sample top-scored papers from each period
        remaining_to_sample = sample_size
        
        for period_papers in papers_by_period:
            # Sort papers in this period by score
            period_papers.sort(key=lambda p: p["score"], reverse=True)
            
            # Determine how many to sample from this period
            to_sample = min(papers_per_period, len(period_papers), remaining_to_sample)
            
            # Sample top papers from this period
            sampled_papers.extend(period_papers[:to_sample])
            remaining_to_sample -= to_sample
            
        # If we have remaining slots, fill with highest scored papers overall
        if remaining_to_sample > 0:
            # Sort all papers by score
            all_papers_sorted = sorted(scored_papers, key=lambda p: p["score"], reverse=True)
            
            # Create a set of sampled paper IDs for quick lookup
            sampled_ids = {p["id"] for p in sampled_papers}
            
            # Add highest scored papers that aren't already sampled
            for paper in all_papers_sorted:
                if paper["id"] not in sampled_ids and remaining_to_sample > 0:
                    sampled_papers.append(paper)
                    remaining_to_sample -= 1
                    
                if remaining_to_sample == 0:
                    break
        
        # Sort sampled papers by year
        sampled_papers.sort(key=lambda p: p["year"])
        
        # Create literature review structure
        lit_review = {
            "time_span": f"{earliest_year} to {latest_year}",
            "total_papers": total_papers,
            "sampled_papers": len(sampled_papers),
            "time_periods": [
                {
                    "period": f"{start_year}-{end_year-1}",
                    "papers": [p for p in sampled_papers if start_year <= p["year"] < end_year]
                }
                for start_year, end_year in time_periods
            ],
            "top_authors": sorted(
                author_citation_counts.values(),
                key=lambda a: a["h_index"],
                reverse=True
            )[:10],  # Top 10 authors by h-index
            "research_evolution": {
                "earliest_papers": [p for p in sampled_papers if p["year"] == earliest_year],
                "latest_papers": [p for p in sampled_papers if p["year"] == latest_year]
            }
        }
        
        # Prepare a detailed time-based summary
        time_summary = []
        for period_info in lit_review["time_periods"]:
            period = period_info["period"]
            period_papers = period_info["papers"]
            
            if not period_papers:
                continue
                
            # Sort period papers by citation count
            period_papers_sorted = sorted(period_papers, key=lambda p: p["citation_count"], reverse=True)
            
            # Get top authors in this period
            period_author_counts = {}
            for paper in period_papers:
                for author_id in paper["authors"]:
                    author_data = self.author_vectors.get(author_id, {})
                    author_name = author_data.get("name", "Unknown")
                    if author_name in period_author_counts:
                        period_author_counts[author_name] += 1
                    else:
                        period_author_counts[author_name] = 1
                        
            top_period_authors = sorted(
                [(name, count) for name, count in period_author_counts.items()],
                key=lambda x: x[1],
                reverse=True
            )[:5]  # Top 5 authors in this period
            
            # Identify common fields in this period
            period_fields = {}
            for paper in period_papers:
                for field in paper["fields"]:
                    if field in period_fields:
                        period_fields[field] += 1
                    else:
                        period_fields[field] = 1
                        
            top_period_fields = sorted(
                [(field, count) for field, count in period_fields.items()],
                key=lambda x: x[1],
                reverse=True
            )[:5]  # Top 5 fields in this period
            
            period_summary = {
                "period": period,
                "paper_count": len(period_papers),
                "top_papers": period_papers_sorted[:min(5, len(period_papers))],
                "top_authors": top_period_authors,
                "top_fields": top_period_fields
            }
            
            time_summary.append(period_summary)
        
        # Prepare the final literature review as a JSON string
        lit_review_json = json.dumps({
            "summary": {
                "time_span": lit_review["time_span"],
                "total_papers": lit_review["total_papers"],
                "sampled_papers": lit_review["sampled_papers"],
                "top_authors_by_h_index": [
                    {"name": author["name"], "h_index": author["h_index"]}
                    for author in lit_review["top_authors"]
                ]
            },
            "time_periods": time_summary
        }, indent=2)
        
        # Create the prompt for the LLM
        prompt = f"""
        You are a research assistant creating a comprehensive literature review.
        Below is a structured summary of a citation graph containing research papers across different time periods.
        
        The data includes:
        - Paper details across different time periods
        - Top authors by h-index (a measure of research impact)
        - Research evolution over time
        - Important papers in each time period
        
        Please create a thorough literature review that:
        1. Discusses the evolution of research from {earliest_year} to {latest_year}
        2. Highlights key papers and their contributions in each time period
        3. Identifies influential authors and their impact
        4. Analyzes how research themes have changed over time
        5. Provides a synthesis of the field based on citation patterns
        
        DATA:
        {lit_review_json}
        
        Create a well-structured literature review with clear sections for different time periods and research themes.
        """
        
        # Make the API call to Gemini
        try:
            print(f"Generating literature review for citation graph with {total_papers} papers...")
            response = self.model.generate_content(prompt)
            return response.text
                
        except Exception as e:
            error_msg = f"Error generating literature review: {str(e)}"
            print(error_msg)
            traceback.print_exc()
            return error_msg
    
    def explain_cycles(self, graph_data: Dict[str, List[Dict[str, Any]]]) -> str:
        """Analyze citation cycles in the graph using Gemini."""
        # Find citation cycles
        try:
            cycles = self._find_citation_cycles(graph_data)
        except Exception as e:
            return f"Error finding citation cycles: {str(e)}"
            
        if not cycles:
            return "No citation cycles were found in this graph."
            
        # Prepare a summary of the cycles
        cycle_summary = {"cycles": cycles[:10]}  # Limit to first 10 cycles
        
        # Create a prompt for Gemini
        prompt = f"""
        You are analyzing a citation graph to explain citation cycles.
        
        Below are citation cycles found in the graph:
        {json.dumps(cycle_summary, indent=2)}
        
        A citation cycle occurs when Paper A cites Paper B which cites Paper C which cites back to Paper A (or longer cycles).
        
        Please explain:
        1. What these citation cycles might mean in the research context
        2. Possible reasons why these cycles exist (e.g., collaborative research, incremental work)
        3. Potential relationships between the papers in each cycle
        4. How ideas might have evolved through these citation patterns
        
        Focus on the specific papers in the cycles and their relationships rather than general statements about citation cycles.
        """
        
        # Make the API call to Gemini
        try:
            response = self.model.generate_content(prompt)
            return response.text
                
        except Exception as e:
            error_msg = f"Error analyzing citation cycles with Gemini: {str(e)}"
            print(error_msg)
            traceback.print_exc()
            return error_msg
            
    def create_advanced_literature_review(self, graph_data: Dict[str, List[Dict[str, Any]]]) -> str:
        """
        Generate an advanced literature review with h-index filtering and time-based sampling.
        This method focuses specifically on sampling 50% of papers while ensuring time distribution.
        
        Args:
            graph_data: The citation graph data with nodes and edges
            
        Returns:
            A comprehensive literature review based on the citation graph
        """
        # Create or update vector representations
        if not self.paper_vectors:
            self._vectorize_graph(graph_data)
            
        # Ensure we have papers with years
        papers_with_years = []
        for paper_id, paper_data in self.paper_vectors.items():
            paper_year = paper_data.get("year")
            if paper_year:
                try:
                    year = int(paper_year)
                    papers_with_years.append((paper_id, paper_data, year))
                except ValueError:
                    continue
        
        if not papers_with_years:
            return "Unable to create a literature review: no papers with publication years found in the graph."
            
        # Sort papers by year
        papers_by_year = sorted(papers_with_years, key=lambda x: x[2])
        
        # Calculate the time span
        earliest_year = papers_by_year[0][2]
        latest_year = papers_by_year[-1][2]
        time_span = max(1, latest_year - earliest_year + 1)  # Ensure at least 1
        
        # Create time bins (chunks of years)
        num_bins = min(max(3, time_span // 3), 8)  # Between 3-8 bins
        bin_size = time_span / num_bins
        
        # Map papers to bins
        bins = [[] for _ in range(num_bins)]
        for paper_id, paper_data, year in papers_by_year:
            bin_index = min(num_bins - 1, int((year - earliest_year) / bin_size))
            bins[bin_index].append((paper_id, paper_data, year))
            
        # Calculate h-index for authors
        author_h_indices = {}
        
        for author_id, author_data in self.author_vectors.items():
            author_papers = author_data.get("papers", [])
            if not author_papers:
                continue
                
            # Get citation counts for papers
            citations = []
            for paper_id in author_papers:
                paper = self.paper_vectors.get(paper_id)
                if paper:
                    citation_count = paper["features"][0]  # First feature is citation count
                    citations.append(citation_count)
                    
            # Calculate h-index
            if citations:
                citations.sort(reverse=True)
                h_index = 0
                for i, count in enumerate(citations):
                    if count >= i + 1:
                        h_index = i + 1
                    else:
                        break
                        
                author_h_indices[author_id] = {
                    "author_id": author_id,
                    "name": author_data.get("name", "Unknown"),
                    "h_index": h_index
                }
        
        # Define paper scoring function based on multiple factors
        def score_paper(paper_data, year):
            # Basic citation score
            citation_count = paper_data["features"][0]
            
            # Author importance score (average h-index of authors)
            author_score = 0
            authors = paper_data.get("authors", [])
            if authors:
                total_h_index = 0
                author_count = 0
                for author_id in authors:
                    if author_id in author_h_indices:
                        total_h_index += author_h_indices[author_id]["h_index"]
                        author_count += 1
                if author_count > 0:
                    author_score = total_h_index / author_count
            
            # Year recency score (more recent = higher score)
            # Scaled between 0-1 based on the time span
            recency_score = (year - earliest_year) / time_span if time_span > 0 else 0
            
            # Combined score (weighted)
            return (
                0.5 * citation_count +  # 50% weight on citations
                0.3 * author_score +    # 30% weight on author importance
                0.2 * recency_score     # 20% weight on recency
            )
        
        # Score papers in each bin
        scored_papers_by_bin = []
        for bin_index, bin_papers in enumerate(bins):
            scored_papers = []
            for paper_id, paper_data, year in bin_papers:
                score = score_paper(paper_data, year)
                
                paper_info = {
                    "id": paper_id,
                    "title": paper_data.get("title", "Unknown"),
                    "year": year,
                    "citation_count": paper_data["features"][0],
                    "fields": paper_data.get("fields", []),
                    "score": score,
                    "authors": []
                }
                
                # Add author information
                for author_id in paper_data.get("authors", []):
                    if author_id in author_h_indices:
                        paper_info["authors"].append({
                            "id": author_id,
                            "name": author_h_indices[author_id]["name"],
                            "h_index": author_h_indices[author_id]["h_index"]
                        })
                
                scored_papers.append(paper_info)
                
            # Sort papers within bin by score
            scored_papers.sort(key=lambda p: p["score"], reverse=True)
            scored_papers_by_bin.append(scored_papers)
        
        # Calculate how many papers to sample (50% of total)
        total_papers = sum(len(bin_papers) for bin_papers in scored_papers_by_bin)
        target_sample_size = total_papers // 2  # 50% of total
        
        # Ensure reasonable minimum/maximum
        target_sample_size = max(min(target_sample_size, 100), 20)  # Between 20-100 papers
        
        # Distribute sample size proportionally across bins
        papers_to_sample_by_bin = []
        for bin_papers in scored_papers_by_bin:
            bin_size = len(bin_papers)
            if total_papers > 0:
                bin_proportion = bin_size / total_papers
                bin_samples = max(1, round(target_sample_size * bin_proportion))
                bin_samples = min(bin_samples, bin_size)  # Can't sample more than we have
            else:
                bin_samples = 0
            papers_to_sample_by_bin.append(bin_samples)
            
        # Sample papers from each bin
        sampled_papers = []
        for bin_index, bin_papers in enumerate(scored_papers_by_bin):
            num_to_sample = papers_to_sample_by_bin[bin_index]
            sampled_papers.extend(bin_papers[:num_to_sample])
            
        # Prepare years for binning
        year_ranges = []
        for bin_index in range(num_bins):
            start_year = earliest_year + int(bin_index * bin_size)
            end_year = earliest_year + int((bin_index + 1) * bin_size)
            if bin_index == num_bins - 1:
                end_year = latest_year + 1  # Include the last year
            year_ranges.append((start_year, end_year - 1))
            
        # Group sampled papers by time period
        papers_by_period = []
        for bin_index, (start_year, end_year) in enumerate(year_ranges):
            period_papers = [p for p in sampled_papers if start_year <= p["year"] <= end_year]
            
            # Get field distribution for this period
            field_counts = {}
            for paper in period_papers:
                for field in paper.get("fields", []):
                    field_counts[field] = field_counts.get(field, 0) + 1
                    
            # Get top fields
            top_fields = sorted(
                [(field, count) for field, count in field_counts.items()],
                key=lambda x: x[1],
                reverse=True
            )[:5]
            
            # Get author counts for this period
            author_counts = {}
            for paper in period_papers:
                for author in paper.get("authors", []):
                    author_name = author.get("name", "Unknown")
                    if author_name in author_counts:
                        author_counts[author_name]["count"] += 1
                        author_counts[author_name]["h_index"] = author.get("h_index", 0)
                    else:
                        author_counts[author_name] = {
                            "count": 1,
                            "h_index": author.get("h_index", 0)
                        }
                        
            # Get top authors
            top_authors = sorted(
                [(name, data) for name, data in author_counts.items()],
                key=lambda x: (x[1]["h_index"], x[1]["count"]),
                reverse=True
            )[:5]
            
            # Add to periods
            if period_papers:
                papers_by_period.append({
                    "period": f"{start_year}-{end_year}",
                    "papers": sorted(period_papers, key=lambda p: p["year"]),
                    "paper_count": len(period_papers),
                    "top_fields": top_fields,
                    "top_authors": [{"name": name, "papers": data["count"], "h_index": data["h_index"]} for name, data in top_authors]
                })
        
        # Create the final structured data for the LLM
        lit_review_data = {
            "overview": {
                "time_span": f"{earliest_year}-{latest_year}",
                "total_papers": total_papers,
                "selected_papers": len(sampled_papers),
                "selection_criteria": "Papers were selected based on citation count, author h-index, and temporal distribution"
            },
            "time_periods": papers_by_period
        }
        
        # Create prompt for the LLM
        prompt = f"""
        You are a research expert creating a comprehensive literature review.
        
        Below is a structured dataset representing a citation graph with {total_papers} total papers, 
        of which {len(sampled_papers)} representative papers have been selected spanning from {earliest_year} to {latest_year}.
        
        Papers were selected using a sophisticated algorithm that considers:
        1. Citation count (impact of the paper)
        2. Author h-index (author's overall research impact)
        3. Temporal distribution (ensuring coverage across different time periods)
        
        DATA:
        {json.dumps(lit_review_data, indent=2)}
        
        Please create a detailed literature review that:
        1. Discusses how the research field has evolved over time
        2. Identifies key papers and their contributions in each time period
        3. Highlights influential authors and their impact
        4. Analyzes shifts in research focus and methodology over time
        5. Synthesizes the overall trajectory and themes of the field
        
        Structure your literature review with clear sections for each time period,
        and provide insightful analysis rather than just listing papers.
        """
        
        # Make the API call to Gemini
        try:
            print(f"Generating advanced literature review for {len(sampled_papers)} papers across {len(papers_by_period)} time periods...")
            response = self.model.generate_content(prompt)
            return response.text
                
        except Exception as e:
            error_msg = f"Error generating literature review: {str(e)}"
            print(error_msg)
            traceback.print_exc()
            return error_msg

    def _prepare_graph_summary_for_query(self, graph_data, query):
        """Prepare a targeted summary based on the query type"""
        # Extract query intent
        if "author" in query.lower() or "researcher" in query.lower():
            # Focus on author information, limit paper details
            return self._prepare_author_focused_summary(graph_data)
        elif "cycle" in query.lower() or "circular" in query.lower():
            # Focus on citation cycles
            return self._prepare_cycle_focused_summary(graph_data)
        elif "trend" in query.lower() or "time" in query.lower() or "year" in query.lower():
            # Focus on temporal trends
            return self._prepare_temporal_summary(graph_data)
        else:
            # General summary with balanced information
            return self._prepare_general_summary(graph_data)

    def analyze_graph_stream(self, graph_data, query, chat_history=None):
        """
        Stream the analysis of a citation graph based on a user query.
        Used by the streaming endpoint to provide a character-by-character response.
        
        Args:
            graph_data: The citation graph data
            query: The user's query
            chat_history: Optional list of previous messages
            
        Yields:
            Text chunks for the streaming response
        """
        try:
            # Check cache first
            cached_result = self._get_cached_result(query)
            if cached_result:
                print("Using cached result for streaming query")
                # Return the cached result as a single chunk
                yield cached_result
                return

            # Vectorize the graph data into chunks
            chunks = self._vectorize_and_chunk_graph(graph_data)
            
            # Find the most relevant chunks for this query
            relevant_chunks = self.find_relevant_chunks(chunks, query, top_k=5)
            
            # Extract relevant content from chunks
            context = "\n\n".join([chunk.get("text", "") for chunk in relevant_chunks])
            
            # Create a prompt with the relevant context
            prompt = f"""Citation Graph Analysis Query

CONTEXT INFORMATION:
{context}

USER QUERY:
{query}

IMPORTANT FORMATTING INSTRUCTIONS:
1. ALWAYS place paper titles in simple double quotes like "Paper Title"
2. NEVER use special formatting characters like brackets, braces, or angle brackets around paper titles
3. Use proper Markdown formatting:
   - For headings use: # Main Heading, ## Subheading
   - For bold text use: **bold text**
   - For italic text use: *italic text*
   - For bullet points use: - item or * item
4. Format author names as plain text without any special formatting
5. When mentioning paper titles, ALWAYS use the exact format: "Title of Paper"
6. Use clean, consistent formatting throughout your response
7. AVOID excessive whitespace or empty lines between paragraphs
8. Use at most ONE blank line between sections, never multiple blank lines
9. Place headings immediately after the previous paragraph with just one line break

Please provide a detailed, accurate, and insightful response to the query based ONLY on the context information provided. 
If the context doesn't contain sufficient information to answer the query, clearly state what information is missing.

Your answer should be clear, concise, and directly address the user's query. Prioritize accuracy over comprehensiveness.

Analysis:"""

            # Get the full response 
            result = self._get_gemini_completion(prompt)
            
            # Check if the result is an error message
            if result.startswith("I encountered an error"):
                print("Error response from model, will stream as is")
                yield result
                return
            
            # Cache the result for future use if it's not an error
            self._cache_result(query, result)
            
            # Yield an introductory message based on the query and context
            if any(chunk.get("type") == "paper" for chunk in relevant_chunks):
                # If we're analyzing a specific paper
                paper_chunks = [c for c in relevant_chunks if c.get("type") == "paper"]
                if paper_chunks:
                    paper_title = paper_chunks[0].get("metadata", {}).get("title", "")
                    if paper_title:
                        yield f"Analyzing paper \"{paper_title}\": "
                    else:
                        yield "Analyzing paper: "
            else:
                # General query introduction
                yield "Analyzing the citation graph: "
            
            # Stream the result character by character
            for char in result:
                yield char
                time.sleep(0.01)  # Small delay to simulate typing

        except Exception as e:
            print(f"Error in analyze_graph_stream: {str(e)}")
            traceback.print_exc()
            error_msg = f"Error analyzing graph: {str(e)}"
            yield error_msg

    def _prepare_paper_analysis(self, graph_data, paper_title):
        """
        Prepare a detailed analysis of a specific paper including abstract and contextual analysis.
        
        Args:
            graph_data: The citation graph data
            paper_title: The title of the paper to analyze
            
        Returns:
            A detailed analysis context focusing on the specific paper
        """
        try:
            # Extract nodes and edges
            nodes = graph_data.get("nodes", [])
            edges = graph_data.get("edges", [])
            
            # Find the paper by title (case insensitive match)
            paper_title_lower = paper_title.lower()
            target_paper = None
            similar_papers = []
            
            for node in nodes:
                if node.get("type") == "paper" and node.get("title"):
                    if node.get("title").lower() == paper_title_lower:
                        target_paper = node
                        break
                    # Store similar titles for fuzzy matching
                    elif paper_title_lower in node.get("title").lower():
                        similar_papers.append(node)
                    # Also check for similar titles using TF-IDF or word overlap
                    elif self._calculate_title_similarity(paper_title_lower, node.get("title").lower()) > 0.7:
                        similar_papers.append(node)
            
            # If exact match not found, use the most similar paper
            if not target_paper and similar_papers:
                # Sort by similarity score
                similar_papers.sort(key=lambda p: self._calculate_title_similarity(
                    paper_title_lower, p.get("title", "").lower()), reverse=True)
                target_paper = similar_papers[0]
                print(f"Using similar paper: {target_paper.get('title')}")
            
            if not target_paper:
                return f"Paper titled '{paper_title}' not found in the citation graph. Please check the paper title and try again."
            
            paper_id = target_paper.get("id")
            
            # Get paper details
            paper_details = {
                "title": target_paper.get("title", "Unknown"),
                "year": target_paper.get("year", "Unknown"),
                "abstract": target_paper.get("abstract", "Abstract not available"),
                "citation_count": target_paper.get("citation_count", "0"),
                "fields": target_paper.get("fields_of_study", []),
                "is_open_access": target_paper.get("is_open_access", False),
                "url": target_paper.get("url", ""),
                "venue": target_paper.get("venue", "Unknown"),
                "doi": target_paper.get("doi", ""),
                "references_count": target_paper.get("references_count", 0)
            }
            
            # Find paper authors
            author_nodes = []
            for edge in edges:
                if edge.get("type") == "authored" and edge.get("target") == paper_id:
                    # Find author node
                    author_id = edge.get("source")
                    for node in nodes:
                        if node.get("id") == author_id:
                            author_nodes.append(node)
                            break
                elif edge.get("type") == "author" and edge.get("source") == paper_id:
                    # Alternative edge direction
                    author_id = edge.get("target")
                    for node in nodes:
                        if node.get("id") == author_id:
                            author_nodes.append(node)
                            break
            
            # Find author collaborations - authors who have worked with these authors on other papers
            author_collaborators = {}
            for author in author_nodes:
                author_id = author.get("id")
                collaborators = set()
                
                # Find papers authored by this author
                authored_papers = []
                for edge in edges:
                    if ((edge.get("type") == "authored" and edge.get("source") == author_id) or
                        (edge.get("type") == "author" and edge.get("target") == author_id)):
                        paper_node_id = edge.get("target") if edge.get("type") == "authored" else edge.get("source")
                        if paper_node_id != paper_id:  # Skip the current paper
                            authored_papers.append(paper_node_id)
                
                # Find co-authors of those papers
                for paper_node_id in authored_papers:
                    for edge in edges:
                        if ((edge.get("type") == "authored" and edge.get("target") == paper_node_id) or
                            (edge.get("type") == "author" and edge.get("source") == paper_node_id)):
                            co_author_id = edge.get("source") if edge.get("type") == "authored" else edge.get("target")
                            if co_author_id != author_id:  # Skip the author himself
                                # Find co-author node
                                for node in nodes:
                                    if node.get("id") == co_author_id:
                                        collaborators.add(node.get("name", "Unknown"))
                                        break
                
                author_collaborators[author.get("name", "Unknown")] = list(collaborators)
            
            # Find papers that cite this paper (incoming citations)
            citing_papers = []
            for edge in edges:
                if (edge.get("target") == paper_id and edge.get("type") == "cites") or \
                   (edge.get("source") == paper_id and edge.get("type") == "cited_by"):
                    source_id = edge.get("source") if edge.get("type") == "cites" else edge.get("target")
                    for node in nodes:
                        if node.get("id") == source_id and node.get("type") == "paper":
                            citing_papers.append(node)
                            break
            
            # Find papers cited by this paper (outgoing citations)
            cited_papers = []
            for edge in edges:
                if (edge.get("source") == paper_id and edge.get("type") == "cites") or \
                   (edge.get("target") == paper_id and edge.get("type") == "cited_by"):
                    target_id = edge.get("target") if edge.get("type") == "cites" else edge.get("source")
                    for node in nodes:
                        if node.get("id") == target_id and node.get("type") == "paper":
                            cited_papers.append(node)
                            break
            
            # Find second-level citation network (papers that cite papers that cite this paper)
            second_level_citations = []
            for citing_paper in citing_papers:
                citing_paper_id = citing_paper.get("id")
                for edge in edges:
                    if (edge.get("target") == citing_paper_id and edge.get("type") == "cites") or \
                       (edge.get("source") == citing_paper_id and edge.get("type") == "cited_by"):
                        paper_id_2nd = edge.get("source") if edge.get("type") == "cites" else edge.get("target")
                        if paper_id_2nd != paper_id:  # Avoid cycles
                            for node in nodes:
                                if node.get("id") == paper_id_2nd and node.get("type") == "paper":
                                    second_level_citations.append(node)
                                    break
            
            # Sort citing/cited papers by year if available and citation count
            citing_papers.sort(key=lambda p: (p.get("year", "0"), int(p.get("citation_count", 0))), reverse=True)
            cited_papers.sort(key=lambda p: (p.get("year", "0"), int(p.get("citation_count", 0))), reverse=True)
            
            # Limit to top papers for each
            top_citing_papers = citing_papers[:5]
            top_cited_papers = cited_papers[:5]
            
            # Get most influential citing papers (highest citation count)
            influential_citing = sorted(citing_papers, key=lambda p: int(p.get("citation_count", 0)), reverse=True)[:3]
            
            # Get most influential cited papers
            influential_cited = sorted(cited_papers, key=lambda p: int(p.get("citation_count", 0)), reverse=True)[:3]
            
            # Calculate citation impact over time
            citation_years = {}
            for paper in citing_papers:
                year = paper.get("year")
                if year and year.isdigit():
                    year = int(year)
                    if year in citation_years:
                        citation_years[year] += 1
                    else:
                        citation_years[year] = 1
            
            # Find related papers based on shared citations
            related_papers = []
            # Papers that cite at least 2 of the same papers as the target paper
            common_citation_threshold = 2
            paper_citations = {p.get("id"): p for p in cited_papers}
            
            for node in nodes:
                if node.get("type") == "paper" and node.get("id") != paper_id:
                    # Check how many common citations this paper has with the target paper
                    common_citations = 0
                    for edge in edges:
                        if ((edge.get("source") == node.get("id") and edge.get("type") == "cites") or
                            (edge.get("target") == node.get("id") and edge.get("type") == "cited_by")):
                            cited_id = edge.get("target") if edge.get("type") == "cites" else edge.get("source")
                            if cited_id in paper_citations:
                                common_citations += 1
                    
                    if common_citations >= common_citation_threshold:
                        related_papers.append((node, common_citations))
            
            # Sort related papers by number of common citations
            related_papers.sort(key=lambda x: x[1], reverse=True)
            top_related_papers = [p[0] for p in related_papers[:5]]
            
            # Determine if paper is recent (in the top 25% by year)
            all_years = [int(node.get("year", 0)) for node in nodes if node.get("type") == "paper" and node.get("year") and node.get("year").isdigit()]
            all_years.sort()
            if all_years:
                recent_threshold = all_years[int(len(all_years) * 0.75)]
                paper_year = int(target_paper.get("year", 0)) if target_paper.get("year") and target_paper.get("year").isdigit() else 0
                is_recent = paper_year >= recent_threshold
            else:
                is_recent = False
            
            # Check if highly cited (in the top 25% by citation count)
            all_citation_counts = [int(node.get("citation_count", 0)) for node in nodes if node.get("type") == "paper" and node.get("citation_count") and str(node.get("citation_count")).isdigit()]
            all_citation_counts.sort()
            if all_citation_counts:
                high_citation_threshold = all_citation_counts[int(len(all_citation_counts) * 0.75)]
                paper_citations = int(target_paper.get("citation_count", 0)) if target_paper.get("citation_count") and str(target_paper.get("citation_count")).isdigit() else 0
                is_highly_cited = paper_citations >= high_citation_threshold
            else:
                is_highly_cited = False
            
            # Check if it's a foundational paper (highly cited, older, and cited by other highly cited papers)
            if paper_year > 0 and all_years:
                # Consider foundational if in oldest 40% of papers and in top 25% of citations
                age_percentile = bisect.bisect_left(all_years, paper_year) / len(all_years)
                citation_percentile = bisect.bisect_left(all_citation_counts, paper_citations) / len(all_citation_counts) if all_citation_counts else 0
                is_foundational = age_percentile < 0.4 and citation_percentile > 0.75
                
                # Or if it's cited by many highly-cited papers
                highly_cited_citers = sum(1 for p in citing_papers if int(p.get("citation_count", 0)) >= high_citation_threshold)
                is_foundational = is_foundational or (highly_cited_citers >= 3)
            else:
                is_foundational = False
            
            # Find common themes among citing papers
            citing_fields = {}
            for paper in citing_papers:
                for field in paper.get("fields_of_study", []):
                    if field in citing_fields:
                        citing_fields[field] += 1
                    else:
                        citing_fields[field] = 1
            
            # Get top fields that cite this paper
            top_citing_fields = sorted([(field, count) for field, count in citing_fields.items()], 
                                      key=lambda x: x[1], reverse=True)[:5]
            
            # Identify potential research gaps
            cited_fields = {}
            for paper in cited_papers:
                for field in paper.get("fields_of_study", []):
                    if field in cited_fields:
                        cited_fields[field] += 1
                    else:
                        cited_fields[field] = 1
            
            # Fields that are in cited papers but not in citing papers could indicate research gaps
            potential_gaps = []
            for field, count in cited_fields.items():
                if field not in citing_fields and count >= 2:
                    potential_gaps.append(field)
            
            # Build the summary text
            summary_parts = []
            
            # Basic info
            summary_parts.append(f"## Paper Details: \"{paper_details['title']}\"")
            summary_parts.append(f"- Published: {paper_details['year']}")
            summary_parts.append(f"- Citations: {paper_details['citation_count']}")
            
            if paper_details['venue']:
                summary_parts.append(f"- Venue: {paper_details['venue']}")
                
            if paper_details['fields']:
                summary_parts.append(f"- Fields: {', '.join(paper_details['fields'])}")
                
            if paper_details['is_open_access']:
                summary_parts.append(f"- Open Access: Yes")
                if paper_details['url']:
                    summary_parts.append(f"- URL: {paper_details['url']}")
                    
            if paper_details['doi']:
                summary_parts.append(f"- DOI: {paper_details['doi']}")
            
            # Authors
            if author_nodes:
                summary_parts.append("\n## Authors:")
                for author in author_nodes:
                    author_name = author.get('name', 'Unknown')
                    summary_parts.append(f"- {author_name}")
                    
                    # Add notable collaborators for each author
                    collaborators = author_collaborators.get(author_name, [])
                    if collaborators:
                        top_collaborators = collaborators[:3]
                        if top_collaborators:
                            summary_parts.append(f"  - Notable collaborators: {', '.join(top_collaborators)}")
            
            # Abstract
            if paper_details['abstract'] and paper_details['abstract'] != "Abstract not available":
                summary_parts.append("\n## Abstract:")
                summary_parts.append(paper_details['abstract'])
            
            # Research Context and Impact
            summary_parts.append("\n## Research Context and Impact:")
            
            # Recency and impact
            context_points = []
            if is_recent:
                context_points.append("This is a recent paper in the citation graph")
            if is_highly_cited:
                context_points.append("This paper is highly cited relative to others in the graph")
            if is_foundational:
                context_points.append("This appears to be a foundational paper in its field")
                
            if context_points:
                summary_parts.append("- " + ", and ".join(context_points) + ".")
            
            # Citation trend
            if citation_years:
                summary_parts.append("\n### Citation Trend:")
                # Sort by year
                sorted_years = sorted(citation_years.items())
                trend_desc = ", ".join([f"{year}: {count} citations" for year, count in sorted_years])
                summary_parts.append(f"- Citations by year: {trend_desc}")
                
                # Calculate growth rate
                if len(sorted_years) > 1:
                    first_year = sorted_years[0][0]
                    last_year = sorted_years[-1][0]
                    year_span = last_year - first_year
                    if year_span > 0:
                        total_citations = sum(count for _, count in sorted_years)
                        avg_growth = total_citations / year_span
                        recent_growth = sorted_years[-1][1] / max(1, (sorted_years[-2][1] if len(sorted_years) > 1 else 1))
                        
                        if avg_growth > 2:
                            summary_parts.append("- Citation growth: Strong and consistent interest over time")
                        elif recent_growth > 1.5:
                            summary_parts.append("- Citation growth: Recent increased interest in this work")
                        elif recent_growth < 0.5:
                            summary_parts.append("- Citation growth: Declining interest in recent years")
            
            # Field impact
            if top_citing_fields:
                summary_parts.append("\n### Field Impact:")
                summary_parts.append("- This paper has the most impact in these fields:")
                for field, count in top_citing_fields:
                    summary_parts.append(f"  - {field}: {count} citing papers")
            
            # Research evolution
            summary_parts.append("\n## Research Evolution:")
            
            # Foundational papers (those cited by this paper)
            if top_cited_papers:
                summary_parts.append("\n### Foundation (papers cited by this work):")
                for paper in top_cited_papers:
                    summary_parts.append(f"- \"{paper.get('title', 'Unknown')}\" ({paper.get('year', 'Unknown')}) - Citations: {paper.get('citation_count', '0')}")
                
                if influential_cited:
                    summary_parts.append("\n  Most influential foundational papers:")
                    for paper in influential_cited:
                        summary_parts.append(f"  - \"{paper.get('title', 'Unknown')}\" ({paper.get('year', 'Unknown')}) - Citations: {paper.get('citation_count', '0')}")
            else:
                summary_parts.append("- This paper does not cite any papers in this graph.")
            
            # Papers that build on this work
            if top_citing_papers:
                summary_parts.append("\n### Derivatives (papers that cite this work):")
                for paper in top_citing_papers:
                    summary_parts.append(f"- \"{paper.get('title', 'Unknown')}\" ({paper.get('year', 'Unknown')}) - Citations: {paper.get('citation_count', '0')}")
                
                if influential_citing:
                    summary_parts.append("\n  Most influential papers building on this work:")
                    for paper in influential_citing:
                        summary_parts.append(f"  - \"{paper.get('title', 'Unknown')}\" ({paper.get('year', 'Unknown')}) - Citations: {paper.get('citation_count', '0')}")
            else:
                summary_parts.append("- No papers in this graph cite this work.")
            
            # Related Research
            if top_related_papers:
                summary_parts.append("\n## Related Research:")
                summary_parts.append("Papers with similar citation patterns (may represent parallel or complementary research):")
                for paper in top_related_papers:
                    summary_parts.append(f"- \"{paper.get('title', 'Unknown')}\" ({paper.get('year', 'Unknown')}) - Citations: {paper.get('citation_count', '0')}")
            
            # Research Opportunities
            if potential_gaps:
                summary_parts.append("\n## Research Opportunities:")
                summary_parts.append("Potential research gaps (fields cited by this paper but with limited follow-up work):")
                for field in potential_gaps:
                    summary_parts.append(f"- {field}")
            
            return "\n".join(summary_parts)
            
        except Exception as e:
            print(f"Error preparing paper analysis: {str(e)}")
            traceback.print_exc()
            return f"Error preparing analysis for paper '{paper_title}': {str(e)}"

    def _calculate_title_similarity(self, title1, title2):
        """
        Calculate similarity between two paper titles using word overlap.
        
        Args:
            title1: First paper title
            title2: Second paper title
            
        Returns:
            Similarity score between 0 and 1
        """
        # Simple word overlap metric
        words1 = set(title1.lower().split())
        words2 = set(title2.lower().split())
        
        # Remove common stop words
        stop_words = {'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'of'}
        words1 = words1.difference(stop_words)
        words2 = words2.difference(stop_words)
        
        if not words1 or not words2:
            return 0
            
        # Calculate Jaccard similarity
        intersection = len(words1.intersection(words2))
        union = len(words1.union(words2))
        
        return intersection / union if union > 0 else 0 

    def _vectorize_and_chunk_graph(self, graph_data):
        """
        Create vector chunks from the graph data to enable more efficient RAG.
        This method breaks down the graph into meaningful chunks, each representing
        a different aspect of the graph (paper details, author networks, citation patterns).
        
        Args:
            graph_data: The citation graph data
            
        Returns:
            Dictionary of vectorized chunks for RAG
        """
        print("Vectorizing graph data for RAG...")
        
        # Initialize chunk storage
        chunks = []
        
        # Get nodes and edges
        nodes = graph_data.get("nodes", [])
        edges = graph_data.get("edges", [])
        
        # Create paper and author maps for quick lookup
        paper_map = {}
        author_map = {}
        
        for node in nodes:
            if node.get("type") == "paper":
                paper_map[node.get("id")] = node
            elif node.get("type") == "author":
                author_map[node.get("id")] = node
        
        # Create citation network mapping
        # For each paper, track what it cites and what cites it
        citation_network = defaultdict(lambda: {"cites": [], "cited_by": []})
        
        for edge in edges:
            if edge.get("type") == "cites":
                source_id = edge.get("source")
                target_id = edge.get("target")
                
                if source_id in paper_map and target_id in paper_map:
                    citation_network[source_id]["cites"].append(target_id)
                    citation_network[target_id]["cited_by"].append(source_id)
        
        # Create authorship mapping
        # For each paper, track its authors
        authorship = defaultdict(list)
        # For each author, track their papers
        author_papers = defaultdict(list)
        
        for edge in edges:
            if edge.get("type") == "authored":
                author_id = edge.get("source")
                paper_id = edge.get("target")
                
                if author_id in author_map and paper_id in paper_map:
                    authorship[paper_id].append(author_id)
                    author_papers[author_id].append(paper_id)
        
        # 1. Create chunks for individual papers (with context)
        for paper_id, paper in paper_map.items():
            # Get paper metadata
            title = paper.get("title", "")
            abstract = paper.get("abstract", "")
            year = paper.get("year", "")
            venue = paper.get("venue", "")
            citation_count = paper.get("citation_count", 0)
            
            # Skip papers with minimal information
            if not title:
                continue
            
            # Get citation information
            cited_papers = [paper_map.get(cited_id) for cited_id in citation_network[paper_id]["cites"]]
            citing_papers = [paper_map.get(citing_id) for citing_id in citation_network[paper_id]["cited_by"]]
            
            # Filter out None values (papers that might not be in our map)
            cited_papers = [p for p in cited_papers if p]
            citing_papers = [p for p in citing_papers if p]
            
            # Get author information
            paper_authors = [author_map.get(author_id) for author_id in authorship[paper_id]]
            paper_authors = [a for a in paper_authors if a]
            
            # Create a chunk with paper details and context
            chunk_text = f"Paper: {title}\n"
            if year:
                chunk_text += f"Year: {year}\n"
            if venue:
                chunk_text += f"Venue: {venue}\n"
            if citation_count:
                chunk_text += f"Citations: {citation_count}\n"
            
            if abstract:
                chunk_text += f"Abstract: {abstract}\n"
            
            if paper_authors:
                authors_text = ", ".join([a.get("name", "Unknown") for a in paper_authors])
                chunk_text += f"Authors: {authors_text}\n"
            
            if cited_papers:
                top_cited = sorted(cited_papers, key=lambda p: int(p.get("citation_count", 0) or 0), reverse=True)[:5]
                cited_text = "\n".join([f"- {p.get('title')} ({p.get('year', '')})" for p in top_cited])
                chunk_text += f"Key cited papers:\n{cited_text}\n"
            
            if citing_papers:
                top_citing = sorted(citing_papers, key=lambda p: int(p.get("citation_count", 0) or 0), reverse=True)[:5]
                citing_text = "\n".join([f"- {p.get('title')} ({p.get('year', '')})" for p in top_citing])
                chunk_text += f"Key papers that cite this:\n{citing_text}\n"
            
            # Add metadata for retrieval
            chunks.append({
                "id": paper_id,
                "type": "paper",
                "text": chunk_text,
                "metadata": {
                    "title": title,
                    "year": year,
                    "venue": venue,
                    "citation_count": citation_count
                }
            })
        
        # 2. Create chunks for authors and their work
        for author_id, author in author_map.items():
            author_name = author.get("name", "")
            
            # Skip authors with no name
            if not author_name:
                continue
            
            # Get author's papers
            author_paper_ids = author_papers[author_id]
            author_paper_objects = [paper_map.get(paper_id) for paper_id in author_paper_ids]
            author_paper_objects = [p for p in author_paper_objects if p]
            
            # Skip authors with no papers
            if not author_paper_objects:
                continue
            
            # Sort papers by year (if available) or citation count
            author_paper_objects.sort(
                key=lambda p: (int(p.get("year", 0) or 0) if p.get("year") else 0, 
                             int(p.get("citation_count", 0) or 0)),
                reverse=True
            )
            
            # Create author chunk
            chunk_text = f"Author: {author_name}\n"
            chunk_text += f"Number of papers: {len(author_paper_objects)}\n"
            
            # Add top papers by this author
            top_papers = author_paper_objects[:10]  # Limit to top 10 papers
            if top_papers:
                papers_text = "\n".join([
                    f"- {p.get('title')} ({p.get('year', '')}, Citations: {p.get('citation_count', 0)})"
                    for p in top_papers
                ])
                chunk_text += f"Key papers:\n{papers_text}\n"
            
            # Add metadata for retrieval
            chunks.append({
                "id": author_id,
                "type": "author",
                "text": chunk_text,
                "metadata": {
                    "name": author_name,
                    "paper_count": len(author_paper_objects)
                }
            })
        
        # 3. Create chunks for research themes based on communities
        # Get communities if they exist in the graph data
        if "communities" in graph_data:
            communities = graph_data["communities"].get("communities", [])
            
            for comm in communities:
                community_id = comm.get("id")
                community_size = comm.get("size", 0)
                community_papers = comm.get("papers", [])
                
                if not community_papers:
                    continue
                
                # Get full paper objects
                comm_paper_objects = []
                for paper_info in community_papers:
                    paper_id = paper_info.get("id")
                    if paper_id in paper_map:
                        comm_paper_objects.append(paper_map[paper_id])
                
                # Skip empty communities
                if not comm_paper_objects:
                    continue
                
                # Create community chunk
                chunk_text = f"Research Community {community_id}\n"
                chunk_text += f"Number of papers: {community_size}\n"
                
                # Get field distribution
                field_counts = defaultdict(int)
                for paper in comm_paper_objects:
                    for field in paper.get("fields_of_study", []):
                        field_counts[field] += 1
                
                # Add top research fields
                if field_counts:
                    top_fields = sorted(field_counts.items(), key=lambda x: x[1], reverse=True)[:5]
                    fields_text = ", ".join([f"{field} ({count})" for field, count in top_fields])
                    chunk_text += f"Primary research fields: {fields_text}\n"
                
                # Add key papers in this community
                top_comm_papers = sorted(
                    comm_paper_objects, 
                    key=lambda p: int(p.get("citation_count", 0) or 0),
                    reverse=True
                )[:10]
                
                if top_comm_papers:
                    papers_text = "\n".join([
                        f"- {p.get('title')} ({p.get('year', '')}, Citations: {p.get('citation_count', 0)})"
                        for p in top_comm_papers
                    ])
                    chunk_text += f"Key papers in this community:\n{papers_text}\n"
                
                # Add metadata for retrieval
                chunks.append({
                    "id": f"community_{community_id}",
                    "type": "community",
                    "text": chunk_text,
                    "metadata": {
                        "community_id": community_id,
                        "size": community_size
                    }
                })
                
        # 4. Create a chronological analysis chunk
        # This will be useful for literature reviews and historical analysis
        papers_with_years = []
        for paper_id, paper in paper_map.items():
            if "year" in paper and paper["year"]:
                try:
                    year = int(paper["year"])
                    papers_with_years.append((paper, year))
                except (ValueError, TypeError):
                    continue
        
        # Only create this chunk if we have enough papers with years
        if len(papers_with_years) >= 5:
            # Sort papers by year
            papers_with_years.sort(key=lambda x: x[1])
            
            # Group papers by year
            papers_by_year = defaultdict(list)
            for paper, year in papers_with_years:
                papers_by_year[year].append(paper)
            
            # Create chronological chunk
            chunk_text = "Chronological Analysis of Papers\n\n"
            
            # Add year range
            min_year = min(papers_by_year.keys())
            max_year = max(papers_by_year.keys())
            chunk_text += f"Year range: {min_year} to {max_year}\n"
            chunk_text += f"Total papers with year information: {len(papers_with_years)}\n\n"
            
            # Add papers by decade or 5-year periods
            if max_year - min_year > 20:
                # Group by decade if time span is large
                decade_papers = defaultdict(list)
                for year, paper_list in papers_by_year.items():
                    decade = (year // 10) * 10
                    decade_papers[decade].extend(paper_list)
                
                chunk_text += "Papers by decade:\n"
                for decade in sorted(decade_papers.keys()):
                    papers = decade_papers[decade]
                    decade_end = decade + 9
                    chunk_text += f"\n{decade}-{decade_end} ({len(papers)} papers):\n"
                    
                    # Sort papers by citation count within decade
                    top_decade_papers = sorted(
                        papers, 
                        key=lambda p: int(p.get("citation_count", 0) or 0),
                        reverse=True
                    )[:5]  # Show top 5 papers per decade
                    
                    for paper in top_decade_papers:
                        chunk_text += f"- {paper.get('title')} ({paper.get('year')}, Citations: {paper.get('citation_count', 0)})\n"
            else:
                # Show each year if time span is small
                chunk_text += "Papers by year:\n"
                for year in sorted(papers_by_year.keys()):
                    papers = papers_by_year[year]
                    chunk_text += f"\n{year} ({len(papers)} papers):\n"
                    
                    # Sort papers by citation count within year
                    top_year_papers = sorted(
                        papers, 
                        key=lambda p: int(p.get("citation_count", 0) or 0),
                        reverse=True
                    )[:3]  # Show top 3 papers per year
                    
                    for paper in top_year_papers:
                        chunk_text += f"- {paper.get('title')} (Citations: {paper.get('citation_count', 0)})\n"
            
            # Add metadata for retrieval
            chunks.append({
                "id": "chronological_analysis",
                "type": "chronological",
                "text": chunk_text,
                "metadata": {
                    "min_year": min_year,
                    "max_year": max_year,
                    "paper_count": len(papers_with_years)
                }
            })
        
        # 5. Create chunks for citation cycles if they exist
        if "cycles" in graph_data and graph_data["cycles"]:
            cycles = graph_data["cycles"]
            
            for cycle_idx, cycle in enumerate(cycles):
                # Get full paper objects in this cycle
                cycle_papers = []
                for paper_id in cycle:
                    if paper_id in paper_map:
                        cycle_papers.append(paper_map[paper_id])
                
                # Skip empty cycles
                if not cycle_papers:
                    continue
                
                # Create cycle chunk
                chunk_text = f"Citation Cycle {cycle_idx + 1}\n"
                chunk_text += f"Number of papers in cycle: {len(cycle_papers)}\n"
                
                # Add papers in cycle
                papers_text = "\n".join([
                    f"{i+1}. {p.get('title')} ({p.get('year', '')}) -> {p.get('citation_count', 0)} citations"
                    for i, p in enumerate(cycle_papers)
                ])
                chunk_text += f"Papers in cycle:\n{papers_text}\n"
                
                # Add citation relationships
                chunk_text += "\nCitation path:\n"
                for i in range(len(cycle_papers)):
                    current_paper = cycle_papers[i]
                    next_paper = cycle_papers[(i + 1) % len(cycle_papers)]
                    chunk_text += f"- \"{current_paper.get('title')}\" cites \"{next_paper.get('title')}\"\n"
                
                # Add metadata for retrieval
                chunks.append({
                    "id": f"cycle_{cycle_idx}",
                    "type": "cycle",
                    "text": chunk_text,
                    "metadata": {
                        "cycle_id": cycle_idx,
                        "size": len(cycle_papers)
                    }
                })
        
        # 6. Create a general graph summary chunk
        paper_count = len([node for node in nodes if node.get("type") == "paper"])
        author_count = len([node for node in nodes if node.get("type") == "author"])
        citation_count = len([edge for edge in edges if edge.get("type") == "cites"])
        
        chunk_text = "Citation Graph Summary\n"
        chunk_text += f"Total papers: {paper_count}\n"
        chunk_text += f"Total authors: {author_count}\n"
        chunk_text += f"Total citations: {citation_count}\n"
        
        # Add year range if we have year information
        if papers_with_years:
            years = [year for _, year in papers_with_years]
            chunk_text += f"Year range: {min(years)} to {max(years)}\n"
            
            # Distribution of papers by decade
            decades = defaultdict(int)
            for _, year in papers_with_years:
                decade = (year // 10) * 10
                decades[decade] += 1
            
            if decades:
                chunk_text += "\nPapers by decade:\n"
                for decade in sorted(decades.keys()):
                    chunk_text += f"- {decade}s: {decades[decade]} papers\n"
        
        # Find top cited papers
        top_papers = sorted(
            [node for node in nodes if node.get("type") == "paper"],
            key=lambda p: int(p.get("citation_count", 0) or 0),
            reverse=True
        )[:10]
        
        if top_papers:
            chunk_text += "\nTop cited papers:\n"
            for paper in top_papers:
                chunk_text += f"- {paper.get('title')} ({paper.get('year', '')}, Citations: {paper.get('citation_count', 0)})\n"
        
        # Add metadata for retrieval
        chunks.append({
            "id": "graph_summary",
            "type": "summary",
            "text": chunk_text,
            "metadata": {
                "paper_count": paper_count,
                "author_count": author_count,
                "citation_count": citation_count
            }
        })
        
        # Update the find_relevant_chunks method to recognize temporal queries
        self.query_types = {
            "paper": ["paper", "article", "publication", "research", "title", "abstract"],
            "author": ["author", "researcher", "wrote", "written by", "published by"],
            "community": ["community", "group", "cluster", "field", "area", "topic", "theme"],
            "cycle": ["cycle", "circular", "loop", "reference loop", "citation loop"],
            "chronological": ["chronological", "timeline", "evolution", "history", "year", "date", 
                             "decade", "historical", "literature review", "over time", "development"],
            "summary": ["summary", "overview", "statistics", "overall", "general"]
        }
        
        return chunks

    def find_relevant_chunks(self, chunks, query, top_k=5):
        """
        Find the most relevant chunks for a given query.
        
        Args:
            chunks: List of vectorized chunks
            query: The user's query
            top_k: Number of top chunks to return
            
        Returns:
            List of the most relevant chunks
        """
        # Convert query to lowercase for case-insensitive matching
        query_lower = query.lower()
        
        # Define types of queries and their keywords
        query_types = self.query_types if hasattr(self, 'query_types') else {
            "paper": ["paper", "article", "publication", "research", "title", "abstract"],
            "author": ["author", "researcher", "wrote", "written by", "published by"],
            "community": ["community", "group", "cluster", "field", "area", "topic", "theme"],
            "cycle": ["cycle", "circular", "loop", "reference loop", "citation loop"],
            "chronological": ["chronological", "timeline", "evolution", "history", "year", "date", 
                             "decade", "historical", "literature review", "over time", "development"],
            "summary": ["summary", "overview", "statistics", "overall", "general"]
        }
        
        # Check for chronological/temporal patterns
        year_pattern = r"\b(19|20)\d{2}\b"  # Years like 1990, 2023
        decade_pattern = r"\b(19|20)\d0s\b"  # Decades like 1990s, 2020s
        year_range_pattern = r"\b(19|20)\d{2}[^\d]+(19|20)\d{2}\b"  # Year ranges like 1990-2000
        lit_review_patterns = [
            r"\bliterature\s+review\b",
            r"\bchronological\s+(order|summary|review)\b",
            r"\b(papers|research|work)\s+(in|by|over)\s+(chronological|time|years)\b",
            r"\bhistorical\s+(development|progression|evolution)\b",
            r"\bevolution\s+of\s+research\b",
            r"\bfield\s+development\b"
        ]
        
        # Check for explicit chronological queries
        has_year_reference = re.search(year_pattern, query_lower) is not None
        has_decade_reference = re.search(decade_pattern, query_lower) is not None
        has_year_range = re.search(year_range_pattern, query_lower) is not None
        has_lit_review_request = any(re.search(pattern, query_lower) for pattern in lit_review_patterns)
        
        # If this is clearly a chronological query, prioritize the chronological chunk
        is_chronological_query = has_year_reference or has_decade_reference or has_year_range or has_lit_review_request
        
        # Determine the query type based on keyword matching
        chunk_type_scores = defaultdict(float)
        for chunk_type, keywords in query_types.items():
            for keyword in keywords:
                if keyword in query_lower:
                    chunk_type_scores[chunk_type] += 1
                    
        # If we detected a chronological query pattern, boost that score
        if is_chronological_query:
            chunk_type_scores["chronological"] += 5  # Strong boost for explicit temporal queries
        
        # Calculate simple keyword match scores for each chunk
        chunk_scores = []
        for chunk in chunks:
            # Base score
            score = 0
            
            # Boost by chunk type match
            chunk_type = chunk.get("type", "")
            if chunk_type in chunk_type_scores:
                score += chunk_type_scores[chunk_type] * 2  # Higher weight for type match
            
            # Special handling for chronological queries
            if is_chronological_query and chunk_type == "chronological":
                score += 10  # Extremely strong preference for chronological chunk on temporal queries
                
                # If it's a literature review request, give even higher priority
                if has_lit_review_request:
                    score += 5
            
            # Add score for keyword matches in text
            text = chunk.get("text", "").lower()
            
            # Split query into words and count matches in text
            query_words = query_lower.split()
            for word in query_words:
                if len(word) > 3 and word in text:  # Only count non-trivial words
                    score += 1
            
            # Add specific entity match bonuses
            if chunk_type == "paper":
                # Check if query mentions the paper title
                title = chunk.get("metadata", {}).get("title", "").lower()
                if title and any(title in q for q in [query_lower, *query_words]):
                    score += 10  # Strong bonus for exact paper match
                    
            elif chunk_type == "author":
                # Check if query mentions the author name
                author_name = chunk.get("metadata", {}).get("name", "").lower()
                if author_name and author_name in query_lower:
                    score += 10  # Strong bonus for exact author match
            
            # Check for year matches in chronological chunks
            elif chunk_type == "chronological" and (has_year_reference or has_decade_reference):
                metadata = chunk.get("metadata", {})
                min_year = metadata.get("min_year")
                max_year = metadata.get("max_year")
                
                # If query contains specific years that are within the range of this chunk
                if min_year and max_year:
                    # Extract all years from query
                    years_in_query = [int(match) for match in re.findall(year_pattern, query_lower)]
                    decades_in_query = [int(match[:-1]) for match in re.findall(decade_pattern, query_lower)]
                    
                    # Check if any queried year is in range
                    for year in years_in_query:
                        if min_year <= year <= max_year:
                            score += 8  # Very strong boost for year-specific matches
                            
                    # Check if any queried decade is in range
                    for decade in decades_in_query:
                        if min_year <= decade <= max_year:
                            score += 5  # Strong boost for decade matches
            
            chunk_scores.append((chunk, score))
        
        # Sort chunks by score (descending)
        chunk_scores.sort(key=lambda x: x[1], reverse=True)
        
        # Ensure chronological chunk is included for literature review queries
        if has_lit_review_request:
            # Check if any chronological chunk is already in top results
            has_chrono_chunk = any(chunk.get("type") == "chronological" for chunk, _ in chunk_scores[:top_k])
            
            # If not, find the best chronological chunk and add it to results
            if not has_chrono_chunk:
                chrono_chunks = [(chunk, score) for chunk, score in chunk_scores 
                                if chunk.get("type") == "chronological"]
                
                if chrono_chunks:
                    # Get the highest scored chronological chunk
                    best_chrono_chunk = max(chrono_chunks, key=lambda x: x[1])
                    
                    # Replace the lowest scored chunk in top_k with this chronological chunk
                    if len(chunk_scores) >= top_k:
                        # Remove the lowest scored chunk from current top_k
                        chunk_scores = chunk_scores[:top_k-1] + [best_chrono_chunk]
                        # Re-sort to maintain score order
                        chunk_scores.sort(key=lambda x: x[1], reverse=True)
        
        # Return top-k chunks
        return [chunk for chunk, score in chunk_scores[:top_k]]

    def analyze_graph_with_rag(self, graph_data, query):
        """
        Analyze the citation graph using a RAG-based approach for more accurate and insightful responses.
        
        Args:
            graph_data: The citation graph data
            query: The user's query about the graph
            
        Returns:
            A detailed analysis based on the most relevant graph components
        """
        # Check if we have a cached result for this query
        cached_result = self._get_cached_result(query)
        if cached_result:
            print("Using cached result for query")
            return cached_result
            
        # Vectorize the graph data into chunks if not already done
        chunks = self._vectorize_and_chunk_graph(graph_data)
        
        # Find the most relevant chunks for this query
        relevant_chunks = self.find_relevant_chunks(chunks, query, top_k=5)
        
        # Extract relevant content from chunks
        context = "\n\n".join([chunk.get("text", "") for chunk in relevant_chunks])
        
        # Create a prompt with the relevant context
        prompt = f"""Citation Graph Analysis Query

CONTEXT INFORMATION:
{context}

USER QUERY:
{query}

IMPORTANT FORMATTING INSTRUCTIONS:
1. ALWAYS place paper titles in simple double quotes like "Paper Title"
2. NEVER use special formatting characters like brackets, braces, or angle brackets around paper titles
3. Use proper Markdown formatting:
   - For headings use: # Main Heading, ## Subheading
   - For bold text use: **bold text**
   - For italic text use: *italic text*
   - For bullet points use: - item or * item
4. Format author names as plain text without any special formatting
5. When mentioning paper titles, ALWAYS use the exact format: "Title of Paper"
6. Use clean, consistent formatting throughout your response
7. AVOID excessive whitespace or empty lines between paragraphs
8. Use at most ONE blank line between sections, never multiple blank lines
9. Place headings immediately after the previous paragraph with just one line break

Please provide a detailed, accurate, and insightful response to the query based ONLY on the context information provided. 
If the context doesn't contain sufficient information to answer the query, clearly state what information is missing.

Your answer should be clear, concise, and directly address the user's query. Prioritize accuracy over comprehensiveness.

Analysis:"""

        # Get completion from the language model
        response_text = self._get_gemini_completion(prompt)
        
        # Cache the response
        if not response_text.startswith("I encountered an error"):
            self._cache_result(query, response_text)
        
        return response_text

    # Update the analyze_graph method to use our new RAG-based approach
    def analyze_graph(self, graph_data, query, chat_history=None):
        """
        Analyze the citation graph based on the user's query using RAG.
        Returns a text response from the language model.
        
        Args:
            graph_data (dict): The graph data containing nodes and edges
            query (str): The user's question or query about the graph
            chat_history (list, optional): List of previous messages
            
        Returns:
            str: The analysis result
        """
        try:
            # Use the new RAG-based approach
            return self.analyze_graph_with_rag(graph_data, query)
            
        except Exception as e:
            print(f"Error in analyze_graph: {str(e)}")
            import traceback
            traceback.print_exc()
            return f"I encountered an error while analyzing the graph: {str(e)}"