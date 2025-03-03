// pages/api/generate_graph.js
import fetch from 'node-fetch';

// Configure backend URL
const backendUrl = process.env.BACKEND_URL ||'http://127.0.0.1:10000';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract parameters from request body
    const { seedPaper, maxPapers = 20, maxCitationsPerPaper = 3 } = req.body;

    // Validate input parameters
    if (!seedPaper || seedPaper.trim().length < 5) {
      return res.status(400).json({ 
        error: 'Invalid seed paper. Please provide a valid title, DOI, or search term (at least 5 characters)' 
      });
    }

    console.log(`Attempting to connect to backend at: ${backendUrl}/api/generate_graph`);
    
    // Prepare the request to the Flask backend - using the exact parameter names expected by Flask
    const response = await fetch(`${backendUrl}/api/generate_graph`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        seedPaper: seedPaper,
        maxPapers: maxPapers,
        maxCitationsPerPaper: maxCitationsPerPaper
      })
    });

    // If the response isn't ok, throw an error
    if (!response.ok) {
      const errorData = await response.text();
      console.error(`Backend error (${response.status}):`, errorData);
      return res.status(response.status).json({ 
        error: 'Error from backend service', 
        details: errorData
      });
    }

    // Parse and return the JSON response
    const jsonData = await response.json();
    return res.status(200).json(jsonData);
    
  } catch (error) {
    console.error('Detailed fetch error:', {

      message: error.message,
      code: error.code,
      type: error.type,
      errno: error.errno
    });
    res.status(500).json({ 
      error: 'Failed to connect to backend service', 
      details: `${error.message} (${error.code || 'unknown error code'})`
    });
  }
}

// Configure the API route to handle larger payloads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
    responseLimit: false,
  },
};