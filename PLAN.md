# Alarmageddon - Iterative Development Plan

## Overview
Build a Production SRE Discord bot using an iterative approach where each iteration produces a working, deployable bot with increasing functionality.

## Iteration 0: Project Setup (Day 1) ✅ COMPLETE
**Goal:** Clean up the example code and prepare the foundation

### Tasks
- [x] Remove game-related files (game.js, examples/)
- [x] Clean up app.js to remove game logic
- [x] Update package.json with new project name
- [x] Create basic project structure
- [x] Set up .env file with Discord credentials
- [x] Update README.md with setup instructions

### Deliverable
- ✅ Clean project ready for development
- ✅ Bot can be registered with Discord

---

## Iteration 1: Basic Bot with Ping Command (Day 2) ✅ COMPLETE
**Goal:** Deploy a minimal working bot to validate setup

### Features
- ✅ Single `/ping` command that responds with "Pong!"
- ✅ Basic health check endpoint
- ✅ Proper environment configuration

### Implementation
```javascript
// commands.js
const PING_COMMAND = {
  name: 'ping',
  description: 'Test if the bot is responsive',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};
```

### Testing
- ✅ Deploy bot to server
- ✅ Register commands with Discord
- ✅ Test `/ping` command in Discord
- ✅ Verify health endpoint responds

### Success Criteria
- ✅ Bot responds to `/ping` with "Pong!"
- ✅ Health endpoint returns 200 OK with structured logging
- ✅ Bot stays online and stable

---

## Iteration 2: Webhook Receiver (Days 3-4) ✅ COMPLETE
**Goal:** Accept and log webhooks without Discord integration

### Features
- ✅ POST `/webhooks/google-alerts` endpoint
- ✅ Bearer token authentication (+ URL token for Google Cloud)
- ✅ Request validation and logging
- ✅ In-memory storage of recent webhooks
- ✅ `/webhook test` command to trigger test webhook

### Implementation
```javascript
// New endpoints
POST /webhooks/google-alerts - Receive webhooks
GET /webhooks/recent - View last 10 webhooks (debug)

// New command
/webhook test - Send a test webhook to ourselves
```

### Testing
- ✅ Send test webhooks via curl
- ✅ Verify authentication works
- ✅ Check webhook storage
- ✅ Test the `/webhook test` command

### Success Criteria
- ✅ Webhooks are received and validated
- ✅ Invalid auth returns 401
- ✅ Test command successfully triggers webhook
- ✅ Recent webhooks can be retrieved

---

## Iteration 3: Basic Alert Posting (Days 5-6) ✅ COMPLETE
**Goal:** Post webhook data to Discord channel

### Features
- ✅ Parse webhook payload
- ✅ Format as Discord embed with color-coding by severity
- ✅ Post to configured channel
- ✅ `/alert list` command to show recent alerts

### Implementation
- ✅ Created alert formatter in `src/alerts.js`
- ✅ Added Discord message sending with embeds
- ✅ Store message IDs with alerts for tracking
- ✅ Implemented `/alert list` command

### Testing
- ✅ Send webhook → See Discord message
- ✅ Verify embed formatting with severity colors
- ✅ Test `/alert list` shows recent alerts

### Success Criteria
- ✅ Webhooks result in Discord messages
- ✅ Messages are properly formatted with severity colors
- ✅ Alert list command works
- ✅ No duplicate messages

---

## Iteration 4: Alert Management (Days 7-8) ✅ COMPLETE
**Goal:** Add alert acknowledgment and basic interaction

### Features
- ✅ Add "Acknowledge" button to alerts
- ✅ `/alert ack <pattern>` command with regex matching
- ✅ Update message when acknowledged
- ✅ Track who acknowledged and when
- ✅ Bulk acknowledgment support

### Implementation
- ✅ Added Discord components (buttons) to messages
- ✅ Handle button interactions
- ✅ In-memory acknowledgment tracking (database in iteration 9)
- ✅ Implemented regex-based ack command for bulk operations
- ✅ Filter acknowledged alerts from `/alert list`

### Testing
- ✅ Click acknowledge button - message updates
- ✅ Use ack command with patterns (e.g., "disk", "critical", "db-01")
- ✅ Test bulk acknowledgment with `/alert ack` (no args = all)
- ✅ Verify message updates to green when acknowledged
- ✅ Check acknowledgment tracking shows user and timestamp

### Success Criteria
- ✅ Buttons work and update messages
- ✅ Acknowledgments are tracked with user info
- ✅ Both button and regex command work
- ✅ `/alert list` filters out acknowledged alerts
- ✅ Bulk operations via regex patterns

---

## Iteration 5: Silence System (Days 9-11) ✅ COMPLETE
**Goal:** Implement alert silencing functionality

### Features
- ✅ `/silence create <duration> [pattern]` command
- ✅ Silence matching during webhook processing
- ✅ `/silence list` to show active silences
- ✅ `/silence delete <id>` to remove silences
- ✅ Automatic expiration

### Implementation
- ✅ Add silences module (in-memory for now, database in Iteration 9)
- ✅ Implement regex matching logic
- ✅ Create silence management commands
- ✅ Add background job for cleanup
- ✅ Update webhook flow for silence checking

### Testing
- ✅ Create silence → Send matching webhook → No Discord message
- ✅ List active silences
- ✅ Delete silence → Alerts resume
- ✅ Test expiration

### Success Criteria
- ✅ Silenced alerts don't post to Discord
- ✅ Silence patterns work correctly
- ✅ Silences expire on schedule
- ✅ All silence commands functional

---

## Iteration 6: Basic AlertRouter (Days 12-13) ✅ COMPLETE
**Goal:** Add routing layer between webhooks and Discord

### Features
- ✅ Create AlertRouter component
- ✅ Pass-through routing (all to DEFAULT_CHANNEL_ID)
- ✅ Routing decision logging
- ✅ Maintain backward compatibility
- ✅ **Bonus:** Simple rule-based routing (database alerts to #db channel)

### Implementation
- ✅ Created `src/router.js` with AlertRouter class
- ✅ Integrated into webhook flow (after silence check)
- ✅ Added routing decision logging and statistics
- ✅ Implemented `/route list` and `/route stats` commands
- ✅ Added basic routing rule for database alerts

### Testing
- ✅ Webhook → AlertRouter → Discord flow
- ✅ Verify routing logs are created
- ✅ Ensure existing functionality unchanged
- ✅ Test with various webhook payloads
- ✅ Test database alerts route to #db channel

### Success Criteria
- ✅ AlertRouter integrated into webhook flow
- ✅ All alerts still reach Discord
- ✅ Routing decisions are logged
- ✅ No breaking changes
- ✅ Database alerts route to dedicated channel

---

## Iteration 6.5: Database Persistence (Days 14-15) ✅ COMPLETE
**Goal:** Migrate from in-memory storage to SQLite database for persistence

### Features
- ✅ SQLite database setup and initialization
- ✅ Persistent storage for alerts/webhooks
- ✅ Persistent storage for silences
- ✅ Persistent storage for routing decisions
- ✅ Database cleanup and retention policies

### Implementation
```sql
-- Alerts/webhooks table
CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  payload TEXT NOT NULL, -- JSON
  silenced BOOLEAN DEFAULT 0,
  silenced_by TEXT,
  acknowledged BOOLEAN DEFAULT 0,
  acknowledged_by TEXT,
  acknowledged_at TEXT,
  message_id TEXT,
  channel_id TEXT,
  routing_decision TEXT, -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Silences table  
CREATE TABLE silences (
  id TEXT PRIMARY KEY,
  pattern TEXT NOT NULL,
  duration TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  active BOOLEAN DEFAULT 1
);

-- Routing decisions table (for audit)
CREATE TABLE routing_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id TEXT NOT NULL,
  action TEXT NOT NULL,
  destination TEXT,
  reason TEXT,
  timestamp TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Testing
- ✅ Verify data persists across server restarts
- ✅ Test database migrations and schema creation
- ✅ Verify old data cleanup works
- ✅ Test concurrent access patterns
- ✅ Benchmark performance vs in-memory

### Success Criteria
- ✅ All alerts persist across restarts
- ✅ Silences remain active after restart
- ✅ Acknowledgments are preserved
- ✅ No data loss during normal operations
- ✅ Automatic cleanup of old records (30-day retention)

---

## Iteration 7: Routing Rules Engine (Days 16-17)
**Goal:** Add database-backed routing rules with basic matchers

### Features
- Routing rules table in database
- Priority-based rule evaluation
- Basic matchers (exact, contains)
- DROP and REDIRECT actions
- `/route list` command

### Implementation
```javascript
// Database schema
CREATE TABLE routing_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  priority INTEGER NOT NULL,
  matcher_type TEXT,  // 'exact', 'contains'
  matcher_path TEXT,   // e.g., 'severity', 'title'
  matcher_value TEXT,
  action TEXT,         // 'PASS', 'DROP', 'REDIRECT'
  destination_channel_id TEXT
);

// Evaluate rules
async function evaluateRules(alert) {
  const rules = await db.query('SELECT * FROM routing_rules ORDER BY priority');
  for (const rule of rules) {
    if (matchesRule(alert, rule)) {
      return rule.action;
    }
  }
  return 'PASS';
}
```

### Testing
- Create rules via database
- Test DROP action (alert not posted)
- Test REDIRECT (goes to different channel)
- Verify priority ordering
- Test `/route list` command

### Success Criteria
- Rules stored in SQLite
- Rules evaluated in priority order
- DROP prevents Discord posting
- REDIRECT changes destination channel
- List command shows all rules

---

## Iteration 8: Advanced Routing (Days 18-19)
**Goal:** Add advanced matchers and full routing command suite

### Features
- JSONPath matcher for complex queries
- Regex matcher for patterns
- ESCALATE action (mentions, priority)
- `/route add`, `/route test`, `/route disable` commands
- Routing metrics and audit log

### Implementation
```javascript
// Advanced matchers
function matchesRule(alert, rule) {
  switch(rule.matcher_type) {
    case 'jsonpath':
      return JSONPath.query(alert, rule.matcher_path) === rule.matcher_value;
    case 'regex':
      return new RegExp(rule.matcher_value).test(alert[rule.matcher_path]);
    case 'exact':
      return alert[rule.matcher_path] === rule.matcher_value;
    case 'contains':
      return alert[rule.matcher_path]?.includes(rule.matcher_value);
  }
}

// Commands
/route add "DB Errors" $.severity="critical" ESCALATE #ops-alerts
/route test '{"severity":"critical","service":"database"}'
/route disable rule_123
```

### Testing
- Test JSONPath queries (nested properties)
- Test regex patterns
- Test ESCALATE with mentions
- Test all routing commands
- Verify audit logging

### Success Criteria
- Complex routing rules work
- Commands create/modify rules
- Test command validates rules
- Audit log tracks decisions
- Metrics show routing stats

---

## Iteration 9: Alert Deduplication (Days 20-21)
**Goal:** Prevent duplicate alerts from spamming channels

### Features
- Hash-based deduplication
- Configurable time window
- Dedup counter on alerts
- `/alert stats` command

### Implementation
- Add hash generation for alerts
- Implement dedup checking
- Track duplicate count
- Create stats command

### Testing
- Send identical webhooks rapidly
- Verify only one Discord message
- Check dedup counter increments
- Test stats command

### Success Criteria
- Duplicates prevented within window
- Counter tracks duplicates
- Stats show dedup effectiveness
- Performance remains good

---

## Iteration 10: Production Hardening (Days 22-24)
**Goal:** Prepare for production deployment

### Features
- PostgreSQL support (optional upgrade from SQLite)
- Comprehensive error handling
- Rate limiting
- Retry logic for Discord
- Structured logging
- Docker containerization

### Implementation
- Add PostgreSQL adapter option
- Add error boundaries
- Implement rate limiting
- Add retry queues
- Set up proper logging
- Create Dockerfile

### Testing
- Test database migrations
- Simulate Discord outages
- Load test webhook endpoint
- Verify container deployment

### Success Criteria
- Bot survives restarts without data loss
- Handles Discord API errors gracefully
- Rate limiting prevents abuse
- Logs are structured and useful
- Deploys via Docker

---

## Iteration 11: Advanced Commands (Days 25-26)
**Goal:** Add power-user features

### Features
- `/oncall` commands (if configured)
- `/status` for service health
- `/incident` for incident tracking
- Command permissions

### Implementation
- Create command modules
- Add permission checking
- Implement command help
- Create command aliases

### Testing
- Test each command thoroughly
- Verify permissions work
- Check help is accurate
- Test error cases

### Success Criteria
- Commands work as designed
- Permissions prevent misuse
- Help is comprehensive
- Errors are user-friendly

---

## Iteration 12: Monitoring & Polish (Days 27-28)
**Goal:** Add observability and final polish

### Features
- Prometheus metrics
- Health check details
- Performance optimization
- Documentation
- Admin dashboard (simple web UI)

### Implementation
- Add metrics collection
- Enhance health endpoint
- Profile and optimize
- Write user documentation
- Create simple dashboard

### Testing
- Verify metrics accuracy
- Load test for performance
- Review documentation
- Test dashboard functionality

### Success Criteria
- Metrics provide insights
- Performance meets targets
- Documentation is complete
- Dashboard shows key info

---

## Development Guidelines

### Each Iteration Must
1. **Build on previous work** - Don't break existing features
2. **Be deployable** - End with working bot
3. **Be testable** - Include test plan
4. **Add value** - User-visible improvement

### Testing Strategy
- **Local:** Test with personal Discord server
- **Staging:** Deploy to test environment
- **Production:** Roll out after validation

### Git Strategy
```bash
main
  ├── iteration-1-ping
  ├── iteration-2-webhook
  ├── iteration-3-alerts
  └── ... (merge to main when stable)
```

### Definition of Done
- [ ] Code complete and reviewed
- [ ] Tests passing
- [ ] Documentation updated
- [ ] Deployed to test environment
- [ ] Stakeholder sign-off

---

## Risk Mitigation

### Technical Risks
- **Discord API changes:** Use stable API version
- **Rate limiting:** Implement from iteration 2
- **Data loss:** Add persistence by iteration 8

### Process Risks
- **Scope creep:** Stick to iteration goals
- **Deployment issues:** Test in staging first
- **Breaking changes:** Feature flags for rollback

---

## Success Metrics

### Per Iteration
- Deployment successful
- No critical bugs
- Features work as specified

### Overall Project
- 99.9% uptime after iteration 8
- < 1s response time for commands
- Zero data loss incidents
- All core features delivered

---

## Timeline Summary

**Week 1:** Iterations 0-3 (Basic bot with webhook → Discord) ✅ COMPLETE
**Week 2:** Iterations 4-5 (Acknowledgments and silencing) ✅ COMPLETE
**Week 3:** Iterations 6-6.5 (AlertRouter and database persistence) ✅ COMPLETE
**Week 4:** Iterations 7-8 (Routing rules and advanced routing)
**Week 5:** Iterations 9-10 (Deduplication and hardening)
**Week 6:** Iterations 11-12 (Advanced features and polish)

Total: **6 weeks** from start to production-ready bot with full routing and persistence

---

## Next Steps

1. **Completed:** Iterations 0-6.5 ✅
   - Cleanup, ping bot, webhook receiver, alert posting, acknowledgments, silence system, basic routing, database persistence
2. **Next:** Iteration 7 (Routing Rules Engine)
   - Database-backed routing rules with basic matchers
   - Priority-based rule evaluation
   - DROP and REDIRECT actions
3. **Then:** Iteration 8 (Advanced Routing)
   - JSONPath and regex matchers
   - ESCALATE action
   - Full routing command suite
4. **Daily:** Review progress and adjust

Each iteration builds confidence and adds functionality while maintaining a working system throughout development.