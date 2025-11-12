#!/bin/bash

# Fusca Pro Lookup - Startup Script

echo "🐑 Starting Fusca Pro Lookup..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    echo "Installing dependencies..."
    source venv/bin/activate
    pip install -r requirements.txt
else
    source venv/bin/activate
fi

echo "Starting Flask application..."
echo "Open http://localhost:5001 in your browser"
echo ""

python app.py

