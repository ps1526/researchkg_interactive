// pages/api/generate_graph.js
import fetch from 'node-fetch';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
// Alternative backends to try if main one fails
const ALTERNATIVE_BACKEND_URLS = [
  'http://localhost:8081',
  'http://localhost:8000',
  'http://localhost:3001',
  'http://localhost:5000',
  'http://localhost:5001'
];

// Helper function to try multiple backend URLs
async function tryMultipleBackends(apiPath, requestOptions) {
  // First try the main backend URL
  let lastError = null;
  try {
    console.log(`Trying primary backend: ${BACKEND_URL}${apiPath}`);
    console.log(`Request timeout set to: ${requestOptions.timeout / 1000} seconds`);
    const response = await fetch(`${BACKEND_URL}${apiPath}`, requestOptions);
    if (response.ok) {
      console.log(`Primary backend response success: ${response.status}`);
      return response;
    }
    lastError = new Error(`Primary backend returned: ${response.status} ${response.statusText}`);
    console.error(`Primary backend error: ${response.status} ${response.statusText}`);
  } catch (error) {
    console.error(`Primary backend connection failed: ${error.message}`);
    lastError = error;
  }

  // If primary backend fails, try alternatives
  for (const altUrl of ALTERNATIVE_BACKEND_URLS) {
    try {
      console.log(`Trying alternative backend: ${altUrl}${apiPath}`);
      const response = await fetch(`${altUrl}${apiPath}`, requestOptions);
      if (response.ok) {
        console.log(`Alternative backend ${altUrl} success: ${response.status}`);
        return response;
      }
      console.error(`Alternative backend ${altUrl} error: ${response.status} ${response.statusText}`);
    } catch (error) {
      console.error(`Alternative backend ${altUrl} failed: ${error.message}`);
      // Continue to next alternative
    }
  }

  // If all attempts fail, throw the last error
  throw lastError || new Error('Failed to connect to any backend server');
}

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log(`Sending graph generation request to backend API: /api/generate_graph`);
    
    // Prepare request options
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
      timeout: 300000 // Increase timeout to 5 minutes (300 seconds) for graph generation
    };
    
    // Add authorization header if present in the request
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      requestOptions.headers['Authorization'] = authHeader;
    }
    
    // Try all possible backend URLs
    const response = await tryMultipleBackends('/api/generate_graph', requestOptions);

    // Get response as text first
    const responseText = await response.text();
    
    // Try to parse as JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (err) {
      console.error('Failed to parse response as JSON:', responseText.substring(0, 500));
      return res.status(500).json({
        error: 'Invalid response from backend',
        details: responseText.substring(0, 500) // Limit to 500 chars
      });
    }

    // Return the successful response
    return res.status(200).json(data);
    
  } catch (error) {
    console.error('Error generating graph:', error);
    
    // Provide a more helpful message for timeout errors
    if (error.type === 'request-timeout') {
      return res.status(504).json({
        error: 'Graph generation timed out',
        details: 'The graph generation process is taking longer than expected. Please try with fewer papers or a simpler query.',
        technical_details: error.message
      });
    }
    
    return res.status(500).json({
      error: 'Failed to connect to backend service',
      details: error.message
    });
  }
}

// Configure the API route to handle larger payloads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
    responseLimit: false,
  },
};