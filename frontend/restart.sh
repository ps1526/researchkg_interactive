#!/bin/bash

# Clear Next.js cache
echo "Clearing Next.js cache..."
rm -rf .next

# If running on macOS, clear DNS cache too 
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo "Clearing DNS cache (macOS)..."
  sudo killall -HUP mDNSResponder
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Start development server
echo "Starting Next.js development server..."
npm run dev 
 