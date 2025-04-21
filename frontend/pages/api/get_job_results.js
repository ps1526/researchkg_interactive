// pages/api/get_job_result.js
import fetch from 'node-fetch';

const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
// Alternative ports to try if the main one fails
const alternativeBackendUrls = [
  'http://localhost:5001',
  'http://localhost:8080',
  'http://localhost:8000',
  'http://localhost:3001'
];

// Helper function to try multiple backend URLs
async function tryMultipleBackends(apiPath, requestOptions) {
  // First try the main backend URL
  let lastError = null;
  try {
    const response = await fetch(`${backendUrl}${apiPath}`, requestOptions);
    // For job results, status 202 (Processing) is also a valid response
    if (response.ok || response.status === 202) return response;
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
      if (response.ok || response.status === 202) return response;
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

    // Properly encode the job ID in the URL
    const encodedJobId = encodeURIComponent(jobId);
    
    console.log(`Getting job results from backend API: /api/job_result/${encodedJobId}`);
    
    // Prepare request options
    const requestOptions = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    };
    
    // Try all possible backend URLs
    const response = await tryMultipleBackends(`/api/job_result/${encodedJobId}`, requestOptions);

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

    // If job is still processing
    if (response.status === 202) {
      return res.status(202).json(data);
    }

    // Return the graph data
    return res.status(200).json(data);
    
  } catch (error) {
    console.error('Error getting job result:', error);
    res.status(500).json({
      error: 'Failed to get job result',
      details: error.message
    });
  }
}

// Configure the API route to handle large responses
export const config = {
  api: {
    responseLimit: false,
  },
};