# ResearchKG Frontend

This is the frontend for the ResearchKG citation graph visualization application.

## Features

- Interactive citation graph visualization
- AI-powered analysis using Google Gemini
- Chat interface for asking questions about the research graph
- Exploration of citation cycles and research connections

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env.local` file with the necessary configuration:
   ```
   BACKEND_URL=http://localhost:5000
   ```

## Running the App

```bash
npm run dev
```

The app will be available at http://localhost:3000

## Architecture

This application follows a client-server architecture:

1. **Frontend (Next.js)**
   - Hosted on Vercel
   - Handles UI/UX and visualization
   - Communicates with backend via API calls

2. **Backend (Python/Flask)**
   - Separate server that handles:
     - Citation graph generation
     - LLM analysis using Gemini
   - Needs to be deployed separately (e.g., Heroku, Railway, etc.)

## Deployment

### Frontend (Vercel)

1. Connect your GitHub repository to Vercel
2. Set the environment variable:
   - `BACKEND_URL`: URL to your deployed backend server

### Working with the Backend

The frontend communicates with the backend via HTTP requests. The backend needs to be:
- Running and accessible from the frontend
- Configured with necessary API keys

See the backend README for details on deploying it.

## Development Notes

- The chat interface uses the `/api/analyze-graph` endpoint, which proxies requests to the backend
- To run locally, you need both the frontend and backend servers running

# researchkg_interactive
website to visualize and interact with.json output from researchkg notebook from this repo: https://github.com/ps1526/researchkg

First, go to the researchkg repo and then generate a EnhancedCitation Graph based on any paper of your choice and then take the json output and upload it to this app to interact with it

Deployed @ https://researchkgvisualizer.vercel.app

Issues: If you try to upload a graph with a lot of nodes, i.e more than about 100 papers with about 8 connecting papers + however many author nodes there are, it will be laggy just because of the gravity adjustments for D3 so give it time. Currently, trying to switch to Sigma.js because of the WebGL capabilities so rendering very large citation graphs will be quicker and easier to interact with.

Next Steps: Combine both researchkg repo with this one so that it becomes a one stop shop. 



