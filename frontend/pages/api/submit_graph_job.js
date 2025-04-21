import fetch from 'node-fetch';

// Get backend URL from environment
const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080';
// Alternative ports to try if the main one fails
const alternativeBackendUrls = [
  'http://localhost:5001',
  'http://localhost:8081',
  'http://localhost:8000',
  'http://localhost:3001'
];

// Helper function to try multiple backend URLs
async function tryMultipleBackends(apiPath, requestOptions) {
  // First try the main backend URL
  let lastError = null;
  try {
    console.log(`Trying primary backend: ${backendUrl}${apiPath}`);
    console.log(`Request timeout set to: ${requestOptions.timeout / 1000} seconds`);
    const response = await fetch(`${backendUrl}${apiPath}`, requestOptions);
    if (response.ok) return response;
    lastError = new Error(`Primary backend returned: ${response.status} ${response.statusText}`);
  } catch (error) {
    console.log(`Primary backend connection failed: ${error.message}`);
    lastError = error;
  }

  // If primary backend fails, try alternatives
  for (const altUrl of alternativeBackendUrls) {
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

    console.log(`Submitting job to backend API: /api/submit_job`);
    
    // Prepare request options
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        seedPaper: seedPaper,
        maxPapers: maxPapers,
        maxCitationsPerPaper: maxCitationsPerPaper
      }),
      timeout: 180000 // Increase timeout to 3 minutes for job submission
    };
    
    // Try all possible backend URLs
    const response = await tryMultipleBackends('/api/submit_job', requestOptions);

    // Get response as text first
    const responseText = await response.text();
    
    // Try to parse as JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (err) {
      console.error('Failed to parse response as JSON:', responseText);
      return res.status(500).json({
        error: 'Invalid response from backend',
        details: responseText.substring(0, 500) // Limit to 500 chars
      });
    }

    // Return the successful response
    return res.status(202).json(data);
    
  } catch (error) {
    console.error('Detailed fetch error:', {
      message: error.message,
      code: error.code,
      type: error.type,
      errno: error.errno
    });
    
    // Provide a more helpful message for timeout errors
    if (error.type === 'request-timeout') {
      return res.status(504).json({
        error: 'Job submission timed out',
        details: 'The backend is taking too long to process your request. This might be due to high load or network issues.',
        technical_details: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to connect to backend service',
      details: `${error.message} (${error.code || 'unknown error code'})`
    });
  }
}

// Configure the API route for reasonable payload size
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};
