import fetch from 'node-fetch';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8081';
const ALTERNATIVE_BACKEND_URLS = [
  'http://localhost:8080',
  'http://localhost:5001',
  'http://localhost:8000',
  'http://localhost:3001'
];

export default async function handler(req, res) {
  // Object to store backend status
  const statusReport = {
    main_backend: {
      url: BACKEND_URL,
      status: 'unknown',
      response: null
    },
    alternative_backends: [],
    working_backend: null,
    timestamp: new Date().toISOString()
  };
  
  // Check main backend
  try {
    console.log(`Checking health of main backend: ${BACKEND_URL}`);
    const response = await fetch(`${BACKEND_URL}/`, {
      method: 'GET',
      timeout: 3000
    });
    
    statusReport.main_backend.status = response.ok ? 'online' : 'error';
    statusReport.main_backend.response = response.status;
    
    if (response.ok) {
      statusReport.working_backend = BACKEND_URL;
    }
  } catch (error) {
    console.log(`Main backend health check failed: ${error.message}`);
    statusReport.main_backend.status = 'offline';
    statusReport.main_backend.error = error.message;
  }
  
  // Check alternative backends if main is not working
  if (!statusReport.working_backend) {
    for (const url of ALTERNATIVE_BACKEND_URLS) {
      const backendStatus = {
        url: url,
        status: 'unknown',
        response: null
      };
      
      try {
        console.log(`Checking health of alternative backend: ${url}`);
        const response = await fetch(`${url}/`, {
          method: 'GET',
          timeout: 3000
        });
        
        backendStatus.status = response.ok ? 'online' : 'error';
        backendStatus.response = response.status;
        
        if (response.ok && !statusReport.working_backend) {
          statusReport.working_backend = url;
        }
      } catch (error) {
        backendStatus.status = 'offline';
        backendStatus.error = error.message;
      }
      
      statusReport.alternative_backends.push(backendStatus);
    }
  }
  
  return res.status(200).json(statusReport);
} 