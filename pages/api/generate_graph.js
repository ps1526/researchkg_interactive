// pages/api/generate_graph.js
import { spawn } from 'child_process';
import path from 'path';

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

    // Set up the process to run the Python script
    const pythonProcess = spawn('python', [
      path.join(process.cwd(), 'api', 'run_citation_graph.py'),
      '--seed', seedPaper,
      '--max-papers', maxPapers.toString(),
      '--max-citations', maxCitationsPerPaper.toString()
    ]);

    let dataString = '';
    let errorString = '';

    // Collect data from the Python script
    pythonProcess.stdout.on('data', (data) => {
      dataString += data.toString();
    });

    // Collect any errors
    pythonProcess.stderr.on('data', (data) => {
      const message = data.toString();
      console.error(`Python stderr: ${message}`);
      
      // Don't add progress reports to the error string
      if (!message.includes('PROGRESS:')) {
        errorString += message;
      }
    });

    // Handle the end of the process
    return new Promise((resolve, reject) => {
      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`Python process exited with code ${code}`);
          console.error(`Error: ${errorString}`);
          res.status(500).json({ error: errorString || 'Failed to generate graph' });
          return resolve();
        }

        try {
          // Find and extract the JSON part from the output
          // This handles cases where the Python script outputs text before the JSON
          let jsonData;
          try {
            // First, try to parse the entire output as JSON
            jsonData = JSON.parse(dataString);
          } catch (parseError) {
            // If that fails, try to find JSON in the output
            const jsonMatch = dataString.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
            if (jsonMatch) {
              const jsonPart = jsonMatch[0];
              jsonData = JSON.parse(jsonPart);
            } else {
              throw new Error('No valid JSON found in Python output');
            }
          }
          
          res.status(200).json(jsonData);
          return resolve();
        } catch (error) {
          console.error('Error parsing JSON from Python script:', error);
          console.error('Python output:', dataString.substring(0, 500) + '...');
          res.status(500).json({ 
            error: 'Failed to parse graph data', 
            details: error.message 
          });
          return resolve();
        }
      });
    });
  } catch (error) {
    console.error('API handler error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
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