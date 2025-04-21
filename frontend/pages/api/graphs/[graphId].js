import fetch from 'node-fetch';

// Use a single backend URL
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
// Alternative ports to try if the main one fails
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
  // Get the graphId from the URL
  const { graphId } = req.query;
  
  if (!graphId) {
    return res.status(400).json({ error: 'Graph ID is required' });
  }
  
  // Get the authorization header from the client request
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  try {
    // Prepare common headers
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': authHeader
    };

    const apiPath = `/api/graphs/${graphId}`;
    console.log(`Making ${req.method} request to: ${BACKEND_URL}${apiPath}`);

    // Make request based on method
    const requestOptions = {
      method: req.method,
      headers,
      // Add timeout to avoid hanging requests
      timeout: 60000 // 60 seconds timeout for retrieving or deleting specific graphs
    };

    // Make the request using the helper function that tries multiple backends
    const response = await tryMultipleBackends(apiPath, requestOptions);
    
    // Get response as text first
    const responseText = await response.text();
    console.log(`Response status: ${response.status}, Length: ${responseText.length}`);
    
    // Log error responses for debugging
    if (!response.ok) {
      console.error(`Error response: ${response.status}`, responseText);
    }
    
    // Try to parse as JSON
    let data;
    try {
      data = JSON.parse(responseText);
      console.log(`Successfully parsed JSON response with keys: ${Object.keys(data).join(', ')}`);
    } catch (err) {
      console.error('Failed to parse response as JSON:', responseText.substring(0, 500));
      // If we can't parse JSON, check if it's a specific error from the backend
      if (response.status === 500) {
        return res.status(500).json({
          error: 'Backend server error',
          details: responseText.substring(0, 500) // Limit to 500 chars
        });
      }
      return res.status(500).json({
        error: 'Invalid response from backend',
        details: responseText.substring(0, 500) // Limit to 500 chars
      });
    }

    // Return the result with same status code
    return res.status(response.status).json(data);
    
  } catch (error) {
    console.error(`Error proxying to graph API for graph ${graphId}:`, error);
    // More specific error messages based on error type
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return res.status(503).json({
        error: 'Backend server is unavailable',
        details: 'Cannot connect to the graph database service'
      });
    }
    if (error.type === 'request-timeout') {
      return res.status(504).json({
        error: 'Backend request timed out',
        details: 'The request to the backend server took too long to complete. This might be due to the size of the graph being retrieved or server load.',
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
    responseLimit: false,
  },
}; 