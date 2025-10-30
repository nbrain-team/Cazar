#!/bin/bash
echo "📧 Email Sync Monitor"
echo "===================="
echo ""

while true; do
    # Get sync status
    STATUS=$(curl -s https://cazar-main.onrender.com/api/email-analytics/sync-status)
    
    # Get current stats
    STATS=$(curl -s https://cazar-main.onrender.com/api/email-analytics/stats)
    
    clear
    echo "📧 Email Sync Monitor - $(date '+%H:%M:%S')"
    echo "=========================================="
    echo ""
    echo "Sync Status:"
    echo "$STATUS" | python3 -m json.tool
    echo ""
    echo "Current Database Stats:"
    echo "$STATS" | python3 -m json.tool
    echo ""
    echo "Press Ctrl+C to stop monitoring"
    echo "Refreshing every 30 seconds..."
    
    # Check if sync is still in progress
    IN_PROGRESS=$(echo "$STATUS" | python3 -c "import sys, json; print(json.load(sys.stdin).get('inProgress', False))" 2>/dev/null)
    
    if [ "$IN_PROGRESS" != "True" ]; then
        echo ""
        echo "✅ Sync completed!"
        break
    fi
    
    sleep 30
done
