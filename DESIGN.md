# Alarmageddon System Design

## Overview

Alarmageddon is a Discord bot that acts as a bridge between external monitoring/alerting systems and Discord channels. Its primary function is to receive webhooks from various sources (starting with Google Alerts) and deliver formatted messages to appropriate Discord channels.

## Core Functionality

### Primary Use Case
1. External service sends webhook to Alarmageddon
2. Alarmageddon validates and parses the webhook payload
3. Alarmageddon formats the alert into a Discord message
4. Alarmageddon posts the message to the configured Discord channel(s)

### Secondary Use Cases
- Discord users interact with alerts via slash commands
- Bot provides on-demand status information
- Bot maintains alert history and statistics

## System Architecture

```
┌─────────────────┐
│  Google Alerts  │
└────────┬────────┘
         │ HTTP POST
         ▼
┌─────────────────────────────────────────┐
│         Alarmageddon Bot                │
│                                         │
│  ┌────────────┐      ┌──────────────┐   │
│  │  Webhook   │─────▶│   Message    │   │
│  │  Handler   │      │  Formatter   │   │
│  └────────────┘      └──────────────┘   │
│         │                    │          │
│         ▼                    ▼          │
│  ┌────────────┐      ┌──────────────┐   │
│  │   Alert    │      │   Discord    │   │
│  │   Store    │      │   Client     │   │
│  └────────────┘      └──────────────┘   │
│                              │          │
│  ┌───────────────────────────┘          │
│  │                                      │
│  │  ┌──────────────┐                    │
│  └─▶│   Command    │                    │
│     │   Handler    │                    │
│     └──────────────┘                    │
└─────────────────────────────────────────┘
         │                    ▲
         ▼                    │
┌─────────────────┐  ┌────────────────┐
│  Discord Server │  │  Discord Users │
│    (Channels)   │  │   (Commands)   │
└─────────────────┘  └────────────────┘
```

## Components

### 1. Webhook Handler
**Purpose:** Receive and validate incoming webhooks

**Responsibilities:**
- Listen on `/webhooks/:source` endpoints
- Validate webhook signatures/tokens
- Parse different webhook formats
- Route to appropriate processors
- Return proper HTTP responses

**Key Decisions:**
- Each webhook source gets its own endpoint (e.g., `/webhooks/google-alerts`)
- Validation happens before any processing
- Failed webhooks return appropriate HTTP status codes
- Support for replay protection (timestamp validation)

### 2. Message Formatter
**Purpose:** Transform webhook payloads into Discord messages

**Responsibilities:**
- Extract relevant fields from webhook payload
- Create Discord embed objects
- Apply severity-based formatting (colors, mentions)
- Add interactive components (buttons, select menus)
- Handle truncation for Discord limits

**Message Structure:**
```javascript
{
  embeds: [{
    title: "Alert Title",
    description: "Alert description",
    color: 0xFF0000, // Red for critical
    fields: [
      { name: "Service", value: "api-gateway", inline: true },
      { name: "Severity", value: "Critical", inline: true },
      { name: "Time", value: "2025-01-02 15:30 UTC", inline: false }
    ],
    footer: { text: "Source: Google Alerts" },
    timestamp: new Date().toISOString()
  }],
  components: [{
    type: 1,
    components: [
      { type: 2, label: "Acknowledge", style: 1, custom_id: "ack_alert" },
      { type: 2, label: "Investigate", style: 2, custom_id: "investigate" }
    ]
  }]
}
```

### 3. Alert Store
**Purpose:** Maintain alert state, history, and silences

**Responsibilities:**
- Store alert metadata
- Track acknowledgments
- Manage active silences
- Check alerts against silence rules
- Prevent duplicate alerts
- Provide query interface
- Clean up old alerts and expired silences

**Storage Options:**
- **Simple:** In-memory with periodic JSON dump
- **Robust:** SQLite for persistence
- **Scalable:** PostgreSQL for production

**Data Model:**
```sql
CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  raw_payload JSON,
  message_id TEXT,
  channel_id TEXT,
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMP,
  silenced BOOLEAN DEFAULT FALSE,
  silence_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  hash TEXT -- For deduplication
);

CREATE TABLE silences (
  id TEXT PRIMARY KEY,
  pattern TEXT NOT NULL,  -- Regex pattern to match alerts
  duration_minutes INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_alerts_created ON alerts(created_at);
CREATE INDEX idx_alerts_hash ON alerts(hash);
CREATE INDEX idx_silences_expires ON silences(expires_at);
```

### 4. Discord Client
**Purpose:** Interface with Discord API

**Responsibilities:**
- Send messages to channels
- Update existing messages
- Handle interactions (buttons, commands)
- Manage bot presence
- Handle rate limiting

**Key Patterns:**
- Use discord-interactions for webhook validation
- Implement exponential backoff for rate limits
- Queue messages during outages
- Support both slash commands and interactions

### 5. Command Handler
**Purpose:** Process Discord slash commands and interactions

**Commands:**
```
/alert list              - Show recent alerts
/alert ack <id>         - Acknowledge an alert
/alert stats            - Show alert statistics
/silence <duration> [pattern] - Silence alerts matching pattern
/silence list           - Show active silences
/silence delete <id>    - Remove a silence
/webhook test <source>  - Send test webhook
/config channel <type>  - Configure alert channels
/config filter <rule>   - Set up alert filters
```

**Silence Command Examples:**
```
/silence 5m              - Silence all alerts for 5 minutes
/silence 1h database     - Silence alerts containing "database" for 1 hour
/silence 30m "error.*api" - Silence alerts matching regex for 30 minutes
/silence 2h ".*" reason:"Maintenance window" - Silence all with reason
```

## Data Flow

### Incoming Webhook Flow
```
1. HTTP POST → /webhooks/google-alerts
2. Validate authentication (Bearer token or signature)
3. Parse JSON payload
4. Check deduplication (hash of key fields)
5. Check against active silences
   - If matched: Store with silenced=true, skip Discord send
   - If not matched: Continue normal flow
6. Store in Alert Store
7. Format as Discord message (if not silenced)
8. Determine target channel(s)
9. Send to Discord (if not silenced)
10. Update Alert Store with message_id (if sent)
11. Return 200 OK to webhook sender
```

### Silence Matching Logic
```javascript
function checkSilences(alert) {
  const activeSilences = await getActiveSilences();
  
  for (const silence of activeSilences) {
    const regex = new RegExp(silence.pattern || '.*', 'i');
    const textToMatch = `${alert.title} ${alert.description} ${alert.source}`;
    
    if (regex.test(textToMatch)) {
      return {
        silenced: true,
        silenceId: silence.id,
        silenceReason: silence.reason
      };
    }
  }
  
  return { silenced: false };
}
```

### Discord Interaction Flow
```
1. User clicks "Acknowledge" button
2. Discord sends interaction webhook
3. Validate interaction token
4. Update Alert Store
5. Edit original message (add acknowledged by)
6. Send ephemeral response to user
```

### Silence Command Flow
```
1. User runs /silence 5m "database.*error"
2. Parse duration and pattern
3. Calculate expiration time
4. Store silence in database
5. Send confirmation message with silence details
6. Background job periodically cleans expired silences
```

## Configuration

### Environment Variables
```bash
# Core Discord settings
DISCORD_TOKEN=
PUBLIC_KEY=
APP_ID=

# Webhook authentication
WEBHOOK_SECRET=  # Shared secret for webhook validation

# Channel mapping
CHANNEL_CRITICAL=  # Critical alerts
CHANNEL_WARNING=   # Warning alerts
CHANNEL_INFO=      # Informational alerts
CHANNEL_DEFAULT=   # Fallback channel

# Database (optional)
DATABASE_URL=sqlite://./alerts.db

# Feature flags
ENABLE_DEDUPLICATION=true
DEDUP_WINDOW_MINUTES=5
ENABLE_AUTO_ACKNOWLEDGE=false
ENABLE_SILENCES=true
MAX_SILENCE_DURATION_HOURS=24
```

### Channel Routing Rules
```javascript
const channelRouter = {
  // By severity
  severity: {
    'critical': process.env.CHANNEL_CRITICAL,
    'warning': process.env.CHANNEL_WARNING,
    'info': process.env.CHANNEL_INFO
  },
  
  // By source
  source: {
    'google-alerts': process.env.CHANNEL_GOOGLE,
    'pagerduty': process.env.CHANNEL_PAGERDUTY
  },
  
  // By keyword matching
  keywords: {
    'database': process.env.CHANNEL_DATABASE,
    'api': process.env.CHANNEL_API
  },
  
  // Default fallback
  default: process.env.CHANNEL_DEFAULT
};
```

## Security Considerations

### Webhook Security
- **Authentication:** Validate Bearer token or HMAC signature
- **Replay Protection:** Check timestamp is within acceptable window
- **Rate Limiting:** Limit requests per source per minute
- **IP Allowlisting:** Optional restriction to known source IPs

### Discord Security
- **Token Protection:** Never log or expose bot token
- **Permission Scope:** Request minimum Discord permissions needed
- **Command Authorization:** Implement role checks for sensitive commands
- **Input Validation:** Sanitize all user inputs

### Data Security
- **No PII:** Avoid storing personally identifiable information
- **Encryption:** Use TLS for all external communications
- **Audit Logging:** Log all administrative actions
- **Data Retention:** Automatically purge old alerts

## Reliability & Performance

### High Availability
- **Stateless Design:** Bot can be restarted without losing webhooks
- **Message Queue:** Buffer webhooks during Discord outages
- **Health Checks:** Expose `/health` endpoint
- **Graceful Shutdown:** Complete in-flight requests

### Performance Targets
- Webhook processing: < 100ms
- Discord message send: < 1s
- Command response: < 500ms
- Memory usage: < 256MB
- Startup time: < 5s

### Error Handling
```javascript
// Webhook errors return appropriate status
400 Bad Request - Invalid payload
401 Unauthorized - Invalid token
429 Too Many Requests - Rate limited
500 Internal Error - Processing failed
503 Service Unavailable - Discord unreachable

// Failed Discord sends trigger retry
- Exponential backoff with jitter
- Max 3 retries
- Dead letter queue for failed messages
```

## Monitoring & Observability

### Key Metrics
- Webhook receive rate
- Message send success rate
- Silenced alert rate
- Active silence count
- Processing latency (p50, p95, p99)
- Error rate by type
- Active alert count
- Discord API rate limit usage

### Logging
```javascript
// Structured logging format
{
  "timestamp": "2025-01-02T15:30:00Z",
  "level": "info",
  "source": "webhook-handler",
  "event": "webhook_received",
  "data": {
    "source": "google-alerts",
    "severity": "critical",
    "alert_id": "abc123",
    "silenced": false
  }
}

// Silence event logging
{
  "timestamp": "2025-01-02T15:35:00Z",
  "level": "info",
  "source": "silence-handler",
  "event": "silence_created",
  "data": {
    "silence_id": "sil_123",
    "pattern": "database.*error",
    "duration_minutes": 30,
    "created_by": "user123"
  }
}
```

### Health Checks
```javascript
GET /health
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 3600,
  "discord": "connected",
  "database": "connected",
  "last_webhook": "2025-01-02T15:30:00Z",
  "active_silences": 2,
  "silenced_today": 15
}
```

## Development Workflow

### Local Development
```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your credentials

# Run in development mode
npm run dev

# Test webhook locally
curl -X POST http://localhost:3000/webhooks/google-alerts \
  -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"severity":"warning","title":"Test Alert"}'
```

### Testing Strategy
- **Unit Tests:** Individual components
- **Integration Tests:** Webhook flow end-to-end
- **Discord Tests:** Use test server/channels
- **Load Tests:** Validate performance targets

## Future Considerations

### Extensibility Points
- Plugin system for new webhook sources
- Custom formatters per source
- Middleware pipeline for processing
- Event bus for internal communication

### Potential Enhancements
- Multi-server support (not just one Discord server)
- Alert correlation and grouping
- Scheduled summary reports
- Two-way sync with external systems
- Alert suppression windows
- Escalation policies

### Scaling Considerations
- Horizontal scaling with load balancer
- Redis for shared state
- Separate webhook ingestion from Discord posting
- Bulk message sending for high volume
