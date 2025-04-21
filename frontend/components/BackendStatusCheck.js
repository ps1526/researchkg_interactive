import { useState, useEffect } from 'react';

const BackendStatusCheck = () => {
  const [backendStatus, setBackendStatus] = useState({
    isChecking: true,
    isConnected: false,
    error: null,
    workingBackend: null
  });
  
  useEffect(() => {
    const checkBackendHealth = async () => {
      try {
        const response = await fetch('/api/health');
        const data = await response.json();
        
        setBackendStatus({
          isChecking: false,
          isConnected: !!data.working_backend,
          error: !data.working_backend ? 'No working backend server found' : null,
          workingBackend: data.working_backend
        });
        
        console.log('Backend health check:', data);
      } catch (error) {
        console.error('Error checking backend health:', error);
        setBackendStatus({
          isChecking: false,
          isConnected: false,
          error: error.message,
          workingBackend: null
        });
      }
    };
    
    checkBackendHealth();
    
    // Re-check every 30 seconds
    const intervalId = setInterval(checkBackendHealth, 30000);
    
    return () => clearInterval(intervalId);
  }, []);
  
  if (backendStatus.isChecking) {
    return null; // Don't show anything while checking
  }
  
  if (backendStatus.isConnected) {
    return null; // All good, don't show anything
  }
  
  // Only render when there's a problem
  return (
    <div className="fixed bottom-4 right-4 bg-red-50 border-l-4 border-red-500 p-3 rounded-lg shadow-md z-50 max-w-sm">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-red-800">Backend Connectivity Issue</h3>
          <div className="mt-1 text-xs text-red-700">
            <p>Unable to connect to the backend server. Saving and loading graphs may not work properly.</p>
            <p className="mt-1 text-xs text-red-600">
              {backendStatus.error}
            </p>
          </div>
          <div className="mt-2">
            <a 
              href="/api/health" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-xs text-red-700 hover:text-red-500 underline"
            >
              View Details
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BackendStatusCheck; 