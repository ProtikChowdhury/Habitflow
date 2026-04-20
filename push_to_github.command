#!/bin/bash
cd "$(dirname "$0")"
git add .
git commit -m "Auto-commit: Refactored to Firebase Compat SDK for local file execution"
git push
echo "Push complete! You can safely close this window now."
