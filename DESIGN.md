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
- Pass validated webhooks to AlertRouter
- Return proper HTTP responses

**Key Decisions:**
- Each webhook source gets its own endpoint (e.g., `/webhooks/google-alerts`)
- Validation happens before any processing
- Failed webhooks return appropriate HTTP status codes
- Support for replay protection (timestamp validation)
- Hands off routing decisions to AlertRouter

### 2. AlertRouter
**Purpose:** Central routing engine for all alerts

**Responsibilities:**
- Receive validated alerts from Webhook Handler
- Evaluate routing rules in priority order
- Apply JSONPath/regex matching against alert properties
- Execute routing actions (PASS, DROP, REDIRECT, ESCALATE)
- Pass routed alerts to Alert Store and Message Formatter
- Maintain audit log of routing decisions

**Routing Actions:**
- **PASS:** Continue normal processing to configured channel
- **DROP:** Silently discard the alert (with logging)
- **REDIRECT:** Override destination channel
- **ESCALATE:** Special handling (e.g., @here mention, priority queue)

**Rule Evaluation:**
```javascript
async function routeAlert(alert) {
  const rules = await getActiveRules(); // Sorted by priority
  let destination = process.env.DEFAULT_CHANNEL_ID;
  let action = 'PASS';
  
  for (const rule of rules) {
    if (matchesRule(alert, rule)) {
      action = rule.action;
      if (rule.destination_channel_id) {
        destination = rule.destination_channel_id;
      }
      
      // Log routing decision
      await logRoutingDecision(alert.id, rule.id, action);
      
      if (action === 'DROP') {
        return { drop: true };
      }
      break; // First matching rule wins
    }
  }
  
  return { 
    action, 
    destination,
    continue: action !== 'DROP' 
  };
}
```

### 3. Message Formatter
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

CREATE TABLE routing_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  priority INTEGER NOT NULL,  -- Lower number = higher priority
  matcher_type TEXT NOT NULL, -- 'jsonpath', 'regex', 'exact', 'contains'
  matcher_path TEXT NOT NULL, -- e.g., '$.severity', '$.body.service', '$.title'
  matcher_value TEXT NOT NULL, -- Value or pattern to match
  destination_channel_id TEXT, -- Override channel
  action TEXT DEFAULT 'PASS', -- PASS, DROP, REDIRECT, ESCALATE
  metadata JSON, -- Additional routing metadata (mentions, tags, etc.)
  enabled BOOLEAN DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE routing_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id TEXT NOT NULL,
  rule_id TEXT,
  action TEXT NOT NULL,
  destination TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alerts_created ON alerts(created_at);
CREATE INDEX idx_alerts_hash ON alerts(hash);
CREATE INDEX idx_silences_expires ON silences(expires_at);
CREATE INDEX idx_routing_rules_priority ON routing_rules(priority);
CREATE INDEX idx_routing_rules_enabled ON routing_rules(enabled);
CREATE INDEX idx_routing_audit_alert ON routing_audit(alert_id);
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

/route add <name> <matcher> <action> - Create routing rule
/route list             - Show active routing rules
/route test <payload>   - Test rules against sample JSON
/route disable <id>     - Temporarily disable a rule
/route enable <id>      - Re-enable a disabled rule
/route delete <id>      - Remove a routing rule

/webhook test <source>  - Send test webhook
/config channel <type>  - Configure alert channels
```

**Silence Command Examples:**
```
/silence 5m              - Silence all alerts for 5 minutes
/silence 1h database     - Silence alerts containing "database" for 1 hour
/silence 30m "error.*api" - Silence alerts matching regex for 30 minutes
/silence 2h ".*" reason:"Maintenance window" - Silence all with reason
```

**Routing Rule Examples:**
```
# Route critical alerts to ops channel
/route add "Critical to Ops" severity=critical REDIRECT #ops-alerts

# Drop all info-level alerts from staging
/route add "Drop Staging Info" $.source=staging AND $.severity=info DROP

# Escalate database errors with @here mention
/route add "DB Errors" $.title~"database.*error" ESCALATE #database-alerts

# Route by service using JSONPath
/route add "API Gateway" $.body.service="api-gateway" REDIRECT #api-channel

# Test a rule against sample payload
/route test '{"severity":"critical","service":"api-gateway"}'
```

## Data Flow

### Incoming Webhook Flow
```
1. HTTP POST → /webhooks/google-alerts
2. Validate authentication (Bearer token or URL token)
3. Parse JSON payload
4. Pass to AlertRouter
5. AlertRouter evaluates routing rules:
   - Check rules in priority order
   - Apply matcher (JSONPath, regex, exact, contains)
   - Determine action (PASS, DROP, REDIRECT, ESCALATE)
   - Log routing decision to audit table
6. If action is DROP: Return 200 OK, stop processing
7. Check deduplication (hash of key fields)
8. Check against active silences
   - If matched: Store with silenced=true, skip Discord send
   - If not matched: Continue normal flow
9. Store in Alert Store with routing metadata
10. Format as Discord message (if not silenced)
11. Send to routed channel(s) (if not silenced)
12. Update Alert Store with message_id (if sent)
13. Return 200 OK to webhook sender
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

#### Currently Implemented
```bash
# Core Discord settings
DISCORD_TOKEN=
PUBLIC_KEY=
APP_ID=

# Webhook authentication
WEBHOOK_TOKEN=        # Bearer token for webhook authentication (preferred)
WEBHOOK_URL_TOKEN=    # Token for URL parameter (?token=) - for services that don't support headers

# Channel configuration
DEFAULT_CHANNEL_ID=   # Discord channel ID for alerts

# Server configuration
PORT=31337           # Server port (default: 31337)

# Logging configuration
LOG_LEVEL=info       # Options: trace, debug, info, warn, error, fatal
AMGN_LOGFILE=alarmageddon.log  # Path to log file (default: alarmageddon.log)
```

#### Planned Features
```bash
# Channel mapping (future)
CHANNEL_CRITICAL=    # Critical alerts
CHANNEL_WARNING=     # Warning alerts
CHANNEL_INFO=        # Informational alerts

# Database (future)
DATABASE_URL=sqlite://./alerts.db

# Feature flags (future)
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
- **Dual Authentication Strategy:**
  - **Bearer Token (WEBHOOK_TOKEN):** Primary method for services supporting headers
  - **URL Token (WEBHOOK_URL_TOKEN):** Fallback for services like Google Cloud that don't support custom headers
  - Separate tokens allow independent rotation schedules
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

#### Implementation (Pino)
- **Dual Output Streams:**
  - JSON structured logs to file (AMGN_LOGFILE)
  - Pretty-printed console output in development
- **Log Levels:** trace, debug, info, warn, error, fatal
- **Automatic Fields:** timestamp, level, service, version, env

```javascript
// Current structured logging format
{
  "level": 30,  // Pino numeric levels (30=info)
  "time": 1756847889736,
  "service": "alarmageddon",
  "version": "0.1.0",
  "env": "development",
  "webhookId": 1756847889736,
  "source": "google-alerts",
  "msg": "Webhook received"
}

// Future silence event logging
{
  "level": 30,
  "time": 1756847889736,
  "service": "alarmageddon",
  "version": "0.1.0",
  "env": "production",
  "silenceId": "sil_123",
  "pattern": "database.*error",
  "durationMinutes": 30,
  "createdBy": "user123",
  "msg": "Silence created"
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
cp .env.sample .env
# Edit .env with your credentials

# Run in development mode (port 31337)
npm run dev

# Register Discord commands
node commands.js

# Expose local server for Discord (separate terminal)
ngrok http 31337

# Test webhook with Bearer token
curl -X POST http://localhost:31337/webhooks/google-alerts \
  -H "Authorization: Bearer YOUR_WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"severity":"warning","title":"Test Alert"}'

# Test webhook with URL token (for Google Cloud)
curl -X POST "http://localhost:31337/webhooks/google-alerts?token=YOUR_URL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"severity":"warning","title":"Test Alert"}'
```

### Testing Strategy
- **Unit Tests:** Individual components
- **Integration Tests:** Webhook flow end-to-end
- **Discord Tests:** Use test server/channels
- **Load Tests:** Validate performance targets

## Current Implementation Status

### Completed Iterations
- **Iteration 0:** Project setup and cleanup
- **Iteration 1:** Basic bot with `/ping` command
- **Iteration 2:** Webhook receiver with authentication

### What's Built
- **Webhook Endpoint:** `/webhooks/google-alerts` with dual authentication
- **Discord Commands:** `/ping` and `/webhook test`
- **Storage:** In-memory storage for recent webhooks (last 10)
- **Debug Endpoint:** `/webhooks/recent` to view stored webhooks
- **Logging:** Structured logging with Pino (file + console)
- **Health Check:** `/health` endpoint

### What's Not Built Yet
- Alert posting to Discord channels
- Silence system
- Database persistence (using in-memory storage)
- Alert acknowledgment
- Channel routing by severity
- Deduplication
- Rate limiting
- Alert statistics

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
