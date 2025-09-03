#!/bin/bash

# Function to generate random sleep time between 20-40 seconds
random_sleep() {
    echo $((20 + RANDOM % 21))
}

# Array of different alert variations
severities=("low" "medium" "high" "critical" "info")
services=("api-gateway" "database" "auth-service" "payment-processor" "cache-server")
descriptions=("CPU usage spike detected" "Memory threshold exceeded" "Response time degradation" "Connection pool exhausted" "Disk usage warning")

# Send 5 alerts with random delays
for i in {1..5}; do
    # Pick random values
    severity=${severities[$RANDOM % ${#severities[@]}]}
    service=${services[$RANDOM % ${#services[@]}]}
    description=${descriptions[$RANDOM % ${#descriptions[@]}]}
    
    echo "Sending alert $i/5: $service ($severity)"
    
    curl -X POST "https://xeta.ag.root.ist/webhooks/google-alerts?token=ccs9kQyG5CTmOymC1gM4OFJlAzgrZbGg" \
        -H "Content-Type: application/json" \
        -d "{
          \"title\": \"Alert #$i: $service issue\",
          \"description\": \"$description\",
          \"severity\": \"$severity\",
          \"service\": \"$service\"
        }"
    
    # Don't sleep after the last alert
    if [ $i -lt 5 ]; then
        sleep_time=$(random_sleep)
        echo "Sleeping for $sleep_time seconds..."
        sleep $sleep_time
    fi
done

echo "Completed sending 5 test alerts"