import fetch from 'node-fetch';

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
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { jobId } = req.query;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }
    const encodedJobId = encodeURIComponent(jobId);

    console.log(`Checking job status from backend API: /api/job_status/${encodedJobId}`);
    
    // Prepare request options
    const requestOptions = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000 // 30 second timeout for checking job status
    };
    
    // Try all possible backend URLs
    const response = await tryMultipleBackends(`/api/job_status/${encodedJobId}`, requestOptions);

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
    return res.status(200).json(data);
    
  } catch (error) {
    console.error('Error checking job status:', error);
    
    // Provide a more helpful message for timeout errors
    if (error.type === 'request-timeout') {
      return res.status(504).json({
        error: 'Request timed out',
        details: 'The job status check is taking longer than expected. The backend might be under heavy load.',
        technical_details: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to check job status',
      details: error.message
    });
  }
}
