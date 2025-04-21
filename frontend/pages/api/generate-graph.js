// API endpoint to generate a new graph
import fetch from 'node-fetch';

// Backend server URL
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
// Alternative ports to try if the main one fails
const ALTERNATIVE_BACKEND_URLS = [
  'http://localhost:8081',
  'http://localhost:5001',
  'http://localhost:5000',
  'http://localhost:8000',
  'http://localhost:3001'
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Forward the request to the backend
    const backendResponse = await fetchWithFallback('/api/generate_graph', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward authorization header if present
        ...(req.headers.authorization && { 
          'Authorization': req.headers.authorization 
        })
      },
      body: JSON.stringify(req.body),
    });

    // Get response data
    const responseData = await backendResponse.json();
    
    // Return response with same status code
    return res.status(backendResponse.status).json(responseData);
  } catch (error) {
    console.error('Error generating graph:', error);
    return res.status(500).json({ 
      error: 'Failed to generate graph', 
      details: error.message 
    });
  }
}

// Helper function to try multiple backend URLs if the primary one fails
async function fetchWithFallback(path, options) {
  // First try the main backend URL
  try {
    const response = await fetch(`${BACKEND_URL}${path}`, options);
    if (response.ok) return response;
  } catch (error) {
    console.warn(`Failed to connect to primary backend at ${BACKEND_URL}: ${error.message}`);
  }

  // If that fails, try the alternatives
  for (const altUrl of ALTERNATIVE_BACKEND_URLS) {
    try {
      console.log(`Trying alternative backend URL: ${altUrl}`);
      const response = await fetch(`${altUrl}${path}`, options);
      if (response.ok) {
        console.log(`Successfully connected to alternative backend at ${altUrl}`);
        return response;
      }
    } catch (error) {
      console.warn(`Failed to connect to alternative backend at ${altUrl}: ${error.message}`);
    }
  }

  // If all attempts fail, throw an error
  throw new Error('Failed to connect to any backend server');
} 