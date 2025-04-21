// API endpoint to analyze a citation graph using Gemini
import fetch from 'node-fetch';

// Backend server URL (change this to your deployed backend URL)
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
// Alternative ports to try if the main one fails
const ALTERNATIVE_BACKEND_URLS = [
  'http://localhost:8081',
  'http://localhost:5001',
  'http://localhost:5000',
  'http://localhost:8000',
  'http://localhost:3001'
];

// Log the backend URL configuration for debugging
console.log('=== Backend URL Configuration ===');
console.log(`Primary backend URL: ${BACKEND_URL}`);
console.log(`Alternative backend URLs: ${ALTERNATIVE_BACKEND_URLS.join(', ')}`);
console.log('=== End Configuration ===');

// Helper function to try multiple backend URLs
async function tryMultipleBackends(apiPath, requestOptions) {
  // First try the main backend URL
  let lastError = null;
  try {
    console.log(`Trying primary backend: ${BACKEND_URL}${apiPath}`);
    console.log(`Request timeout set to: ${requestOptions.timeout / 1000} seconds`);
    const response = await fetch(`${BACKEND_URL}${apiPath}`, requestOptions);
    if (response.ok) return response;
    lastError = new Error(`Primary backend returned: ${response.status} ${response.statusText}`);
  } catch (error) {
    console.log(`Primary backend connection failed: ${error.message}`);
    lastError = error;
  }

  // If primary backend fails, try alternatives
  for (const altUrl of ALTERNATIVE_BACKEND_URLS) {
    try {
      console.log(`Trying alternative backend: ${altUrl}`);
      const response = await fetch(`${altUrl}${apiPath}`, requestOptions);
      if (response.ok) return response;
    } catch (error) {
      console.log(`Alternative backend ${altUrl} failed: ${error.message}`);
      // Continue to next alternative
    }
  }

  // If all attempts fail, throw the last error
  throw lastError || new Error('Failed to connect to any backend server');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Get request data
    const { graph_data, analysis_type, query, chat_history } = req.body;

    // Validate input
    if (!graph_data || !graph_data.nodes || !graph_data.edges) {
      return res.status(400).json({ error: 'Invalid graph data' });
    }

    if (!analysis_type || !['literature', 'cycles', 'custom'].includes(analysis_type)) {
      return res.status(400).json({ error: 'Invalid analysis type' });
    }

    if (analysis_type === 'custom' && !query) {
      return res.status(400).json({ error: 'Custom analysis requires a query' });
    }

    // Prepare the query with chat history if available
    let enhancedQuery = query;
    
    if (analysis_type === 'custom' && chat_history && chat_history.length > 0) {
      // Create a context from the chat history (last 5 messages max to keep context size manageable)
      const recentHistory = chat_history.slice(-5);
      const chatContext = recentHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n\n');
      
      enhancedQuery = `CHAT HISTORY:\n${chatContext}\n\nCURRENT QUESTION: ${query}\n\nPlease answer the current question while considering the previous conversation.`;
    }

    // Create the request payload for the backend
    const payload = {
      graph_data: graph_data,
      analysis_type: analysis_type,
      query: enhancedQuery,
      seed_paper: graph_data.nodes.find(node => node.type === 'paper')?.title || 'citation-graph'
    };

    console.log(`Sending request to backend API: /analyze`);

    // Make the API call to the backend with automatic fallback
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload),
      // Set a reasonable timeout for LLM-based analysis
      timeout: 300000 // 5 minutes (300 seconds)
    };

    const response = await tryMultipleBackends('/analyze', requestOptions);

    // Parse and return the result
    const result = await response.json();
    return res.status(200).json(result);

  } catch (error) {
    console.error('Error analyzing graph:', error);
    
    // Provide a more helpful message for timeout errors
    if (error.type === 'request-timeout') {
      return res.status(504).json({
        error: 'Analysis timed out',
        details: 'The graph analysis is taking longer than expected. This might be due to the size or complexity of the graph.',
        technical_details: error.message
      });
    }
    
    return res.status(500).json({ error: `Analysis failed: ${error.message}` });
  }
}

// Configure the API route to handle larger payloads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
    responseLimit: false,
  },
}; 