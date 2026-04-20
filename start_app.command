#!/bin/bash
cd "$(dirname "$0")"

# Start Python server in background and save its PID
python3 -m http.server 8000 &
SERVER_PID=$!

# Give it a second to start
sleep 1

# Open the browser
open http://localhost:8000

# Wait for the server
wait $SERVER_PID
