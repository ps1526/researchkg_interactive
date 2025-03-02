import React, { useState, useRef } from 'react';

const FileUploadHandler = ({ onFileLoaded, maxSizeMB = 50 }) => {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  
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
          onFileLoaded(jsonData);
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
              onFileLoaded(jsonData);
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