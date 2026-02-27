#!/bin/bash
# Bulk ingestion script - runs folder by folder with proper timeouts
# Usage: ./scripts/run_ingestion.sh

set -e

BASE_URL="http://localhost:5000"
LOG_DIR="/tmp/ingestion_logs"
mkdir -p "$LOG_DIR"

ADMIN_SECRET="${ADMIN_SECRET}"

echo "==================================="
echo "Starting Bulk Ingestion"
echo "==================================="
date

# Get all topic folders
folders=$(curl -s "${BASE_URL}/api/google-drive/topic-folders" -H "X-Admin-Secret: ${ADMIN_SECRET}")

# Process each folder (excluding Mark Kohl)
echo "$folders" | python3 -c "
import json, sys
data = json.load(sys.stdin)
protected = ['MARK_KOHL', 'mark-kohl']
for f in data.get('folders', []):
    ns = f['namespace']
    if f['supportedFiles'] > 0 and not any(p.lower() in ns.lower() for p in protected):
        print(f\"{f['id']}|{ns}|{f['name']}\")
" | while IFS='|' read -r folder_id namespace folder_name; do
    echo ""
    echo "==================================="
    echo "Processing: $folder_name ($namespace)"
    echo "==================================="
    
    # Get files in folder
    files=$(curl -s "${BASE_URL}/api/google-drive/topic-folder/${folder_id}/files" -H "X-Admin-Secret: ${ADMIN_SECRET}")
    
    echo "$files" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for f in data.get('files', []):
    print(f\"{f['id']}|{f['name']}\")
" | while IFS='|' read -r file_id file_name; do
        echo "  Processing: $file_name"
        
        # Upload file with 10 minute timeout
        result=$(curl -s --max-time 600 -X POST "${BASE_URL}/api/google-drive/topic-upload-single" \
            -H "Content-Type: application/json" \
            -H "X-Admin-Secret: ${ADMIN_SECRET}" \
            -d "{\"fileId\": \"${file_id}\", \"fileName\": \"${file_name}\", \"namespace\": \"${namespace}\"}" 2>&1 || echo '{"error":"Request timed out or failed"}')
        
        # Check result
        if echo "$result" | grep -q '"success":true'; then
            chunks=$(echo "$result" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('chunksProcessed', 'unknown'))" 2>/dev/null || echo "?")
            echo "  ✅ Success: $chunks chunks"
        elif echo "$result" | grep -q 'too large\|skipped'; then
            echo "  ⏭️  Skipped (too large)"
        else
            echo "  ❌ Failed: $(echo "$result" | head -c 100)"
        fi
        
        # Delay between files
        sleep 3
    done
    
    # Delay between folders
    sleep 5
done

echo ""
echo "==================================="
echo "Bulk Ingestion Complete"
echo "==================================="
date
