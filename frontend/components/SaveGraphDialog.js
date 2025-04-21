import { useState } from 'react';
import { useAuth } from '../components/AuthProvider';

const SaveGraphDialog = ({ isOpen, onClose, graphData, graphStats }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  
  const { user, authToken } = useAuth();
  
  if (!isOpen) return null;
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!title.trim()) {
      setError('Please enter a title for your graph');
      return;
    }
    
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);
      
      // Prepare the graph data with metadata
      const graphToSave = {
        nodes: graphData.nodes,
        edges: graphData.edges,
        metadata: {
          title: title.trim(),
          description: description.trim(),
          created_at: new Date().toISOString(),
          stats: graphStats
        }
      };
      
      console.log("Saving graph with title:", title.trim());
      
      const response = await fetch('/api/graphs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(graphToSave)
      });
      
      const responseData = await response.json();
      
      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to save graph');
      }
      
      setSuccess(true);
      
      // Clear form values after successful save
      setTitle('');
      setDescription('');
      
      // Close the dialog after a short delay
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1500);
      
    } catch (err) {
      console.error('Error saving graph:', err);
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity duration-300">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md mx-auto transform transition-all duration-300 scale-100" style={{width: '100%', maxWidth: '450px'}}>
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            Save Citation Graph
          </h2>
          
          {success ? (
            <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded mb-4 transition-all duration-300">
              <div className="flex">
                <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-green-700 font-medium">Graph saved successfully!</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded mb-4">
                  <div className="flex">
                    <svg className="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-red-700">{error}</p>
                  </div>
                </div>
              )}
              
              <div>
                <label 
                  htmlFor="title" 
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Title *
                </label>
                <input
                  type="text"
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white transition-colors duration-200"
                  placeholder="E.g., AI Research Map 2023"
                  required
                />
              </div>
              
              <div>
                <label 
                  htmlFor="description" 
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                >
                  Description (optional)
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white transition-colors duration-200"
                  placeholder="Add notes about this citation graph..."
                  rows="3"
                />
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-3 text-sm text-gray-600 dark:text-gray-300">
                <h3 className="font-medium mb-2 text-gray-700 dark:text-gray-200">Graph Statistics</h3>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white dark:bg-gray-800 rounded p-2 text-center">
                    <span className="block font-bold text-blue-600 dark:text-blue-400">{graphStats.paperCount}</span>
                    <span className="text-xs">Papers</span>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded p-2 text-center">
                    <span className="block font-bold text-purple-600 dark:text-purple-400">{graphStats.authorCount}</span>
                    <span className="text-xs">Authors</span>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded p-2 text-center">
                    <span className="block font-bold text-green-600 dark:text-green-400">{graphStats.edgeCount}</span>
                    <span className="text-xs">Connections</span>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors duration-200"
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-200 flex items-center"
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </>
                  ) : (
                    'Save Graph'
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default SaveGraphDialog; 