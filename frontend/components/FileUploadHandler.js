import React, { useState, useRef } from 'react';

const FileUploadHandler = ({ onFileLoaded, maxSizeMB = 50 }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [showAnalysisOptions, setShowAnalysisOptions] = useState(false);
  const [analysisType, setAnalysisType] = useState('literature');
  const [customQuery, setCustomQuery] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const fileInputRef = useRef(null);
  const [graphData, setGraphData] = useState(null);
  
  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // Check file size
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSizeMB) {
      setError(`File size exceeds the maximum allowed size of ${maxSizeMB}MB`);
      return;
    }
    
    setLoading(true);
    setProgress(0);
    setError(null);
    
    try {
      // For large files, use a streaming approach
      if (fileSizeMB > 10) {
        await readLargeFile(file);
      } else {
        await readFile(file);
      }
    } catch (err) {
      console.error('Error reading file:', err);
      setError(`Failed to load file: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  // Standard file reading for smaller files
  const readFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setProgress(percentComplete);
        }
      };
      
      reader.onload = (e) => {
        try {
          const jsonData = JSON.parse(e.target.result);
          setGraphData(jsonData);
          onFileLoaded(jsonData);
          setShowAnalysisOptions(true);
          resolve();
        } catch (error) {
          reject(new Error("Invalid JSON format"));
        }
      };
      
      reader.onerror = () => {
        reject(new Error("File reading failed"));
      };
      
      reader.readAsText(file);
    });
  };
  
  // Chunked reading for larger files
  const readLargeFile = (file) => {
    return new Promise((resolve, reject) => {
      const chunkSize = 1024 * 1024; // 1MB chunks
      const fileSize = file.size;
      let offset = 0;
      let result = '';
      
      const readNextChunk = () => {
        const blob = file.slice(offset, offset + chunkSize);
        const chunkReader = new FileReader();
        
        chunkReader.onload = (e) => {
          result += e.target.result;
          offset += chunkSize;
          
          // Update progress
          const percentComplete = Math.min(100, Math.round((offset / fileSize) * 100));
          setProgress(percentComplete);
          
          if (offset < fileSize) {
            // Read the next chunk
            readNextChunk();
          } else {
            // Finished reading, parse the JSON
            try {
              const jsonData = JSON.parse(result);
              setGraphData(jsonData);
              onFileLoaded(jsonData);
              setShowAnalysisOptions(true);
              resolve();
            } catch (error) {
              reject(new Error("Invalid JSON format"));
            }
          }
        };
        
        chunkReader.onerror = () => {
          reject(new Error("File reading failed"));
        };
        
        chunkReader.readAsText(blob);
      };
      
      // Start reading the file in chunks
      readNextChunk();
    });
  };

  // Function to analyze the graph using the backend API
  const analyzeGraph = async () => {
    if (!graphData) {
      setError("No graph data to analyze");
      return;
    }

    setAnalyzing(true);
    setError(null);

    try {
      // Create the request payload
      const payload = {
        graph_data: graphData,
        analysis_type: analysisType,
        query: analysisType === 'custom' ? customQuery : null
      };

      // Make API call to your backend
      const response = await fetch('/api/analyze-graph', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`);
      }

      // Get the analysis result
      const result = await response.json();
      
      // Update the graph data with the analysis results
      const updatedGraph = { 
        ...graphData, 
        analysis: result.analysis 
      };
      
      setGraphData(updatedGraph);
      onFileLoaded(updatedGraph);

    } catch (err) {
      console.error('Error analyzing graph:', err);
      setError(`Analysis failed: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  // Handle analysis type change
  const handleAnalysisTypeChange = (e) => {
    setAnalysisType(e.target.value);
  };
  
  return (
    <div style={{ width: '100%' }}>
      <label
        htmlFor="large-file-upload"
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '10px',
          backgroundColor: 'white',
          color: '#4B5563',
          border: '1px solid #D1D5DB',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: '500'
        }}
      >
        <svg 
          style={{ marginRight: '8px', height: '20px', width: '20px' }} 
          xmlns="http://www.w3.org/2000/svg" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" 
          />
        </svg>
        Upload JSON File (up to {maxSizeMB}MB)
      </label>
      
      <input
        id="large-file-upload"
        name="large-file-upload"
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
        ref={fileInputRef}
      />
      
      {loading && (
        <div style={{ marginTop: '16px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '14px',
            color: '#4B5563',
            marginBottom: '8px'
          }}>
            <span>Loading file...</span>
            <span>{progress}%</span>
          </div>
          <div style={{
            width: '100%',
            backgroundColor: '#E5E7EB',
            borderRadius: '9999px',
            height: '8px',
            overflow: 'hidden'
          }}>
            <div 
              style={{
                backgroundColor: '#3B82F6',
                height: '8px',
                borderRadius: '9999px',
                width: `${progress}%`,
                transition: 'width 300ms ease-out'
              }}
            ></div>
          </div>
        </div>
      )}
      
      {showAnalysisOptions && (
        <div style={{ 
          marginTop: '16px', 
          padding: '12px', 
          border: '1px solid #E5E7EB', 
          borderRadius: '4px',
          backgroundColor: '#F9FAFB' 
        }}>
          <h3 style={{ 
            fontSize: '16px', 
            fontWeight: '600', 
            color: '#111827', 
            marginTop: 0, 
            marginBottom: '12px'
          }}>
            Analyze Graph with Gemini
          </h3>
          
          <div style={{ marginBottom: '12px' }}>
            <label style={{ 
              display: 'block', 
              fontSize: '14px', 
              fontWeight: '500', 
              color: '#374151', 
              marginBottom: '4px' 
            }}>
              Analysis Type:
            </label>
            <select 
              value={analysisType}
              onChange={handleAnalysisTypeChange}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #D1D5DB',
                backgroundColor: 'white',
                color: '#111827',
                fontSize: '14px'
              }}
            >
              <option value="literature">Literature Review</option>
              <option value="cycles">Citation Cycle Analysis</option>
              <option value="custom">Custom Query</option>
            </select>
          </div>
          
          {analysisType === 'custom' && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ 
                display: 'block', 
                fontSize: '14px', 
                fontWeight: '500', 
                color: '#374151', 
                marginBottom: '4px' 
              }}>
                Custom Query:
              </label>
              <textarea
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                placeholder="Enter your research question about this citation graph..."
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #D1D5DB',
                  backgroundColor: 'white',
                  color: '#111827',
                  fontSize: '14px',
                  minHeight: '80px',
                  resize: 'vertical'
                }}
              />
            </div>
          )}
          
          <button
            onClick={analyzeGraph}
            disabled={analyzing || (analysisType === 'custom' && !customQuery.trim())}
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%',
              padding: '8px 12px',
              backgroundColor: analyzing ? '#9CA3AF' : '#3B82F6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: analyzing ? 'not-allowed' : 'pointer',
              transition: 'background-color 150ms ease'
            }}
          >
            {analyzing ? 'Analyzing...' : 'Analyze Graph'}
          </button>
          
          {graphData?.analysis && (
            <div style={{ 
              marginTop: '16px', 
              padding: '12px', 
              borderRadius: '4px', 
              backgroundColor: '#EFF6FF', 
              border: '1px solid #DBEAFE'
            }}>
              <h4 style={{ 
                fontSize: '14px', 
                fontWeight: '600', 
                color: '#1E40AF', 
                marginTop: 0, 
                marginBottom: '8px' 
              }}>
                Analysis Results: {graphData.analysis.type === 'literature' ? 'Literature Review' : 
                                  graphData.analysis.type === 'cycles' ? 'Citation Cycle Analysis' : 
                                  'Custom Analysis'}
              </h4>
              <div style={{ 
                fontSize: '14px',
                color: '#1F2937',
                whiteSpace: 'pre-wrap'
              }}>
                {graphData.analysis.result}
              </div>
            </div>
          )}
        </div>
      )}
      
      {error && (
        <div style={{
          marginTop: '8px',
          padding: '8px',
          backgroundColor: '#FEE2E2',
          color: '#B91C1C',
          borderRadius: '4px',
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}
      
      <p style={{
        fontSize: '12px',
        color: '#6B7280',
        marginTop: '8px',
        textAlign: 'center'
      }}>
        Drag and drop or click to select a file
      </p>
    </div>
  );
};

export default FileUploadHandler;