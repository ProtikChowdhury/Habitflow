#!/bin/bash
cd "$(dirname "$0")"
git add .
git commit -m "Auto-commit: Added Trash Icon and completely updated UI layout"
git push
echo "Push complete! You can safely close this window now."
