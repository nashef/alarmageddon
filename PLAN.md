# Alarmageddon - Iterative Development Plan

## Overview
Build a Production SRE Discord bot using an iterative approach where each iteration produces a working, deployable bot with increasing functionality.

## Iteration 0: Project Setup (Day 1)
**Goal:** Clean up the example code and prepare the foundation

### Tasks
- [ ] Remove game-related files (game.js, examples/)
- [ ] Clean up app.js to remove game logic
- [ ] Update package.json with new project name
- [ ] Create basic project structure
- [ ] Set up .env file with Discord credentials
- [ ] Update README.md with setup instructions

### Deliverable
- Clean project ready for development
- Bot can be registered with Discord

---

## Iteration 1: Basic Bot with Ping Command (Day 2)
**Goal:** Deploy a minimal working bot to validate setup

### Features
- Single `/ping` command that responds with "Pong!"
- Basic health check endpoint
- Proper environment configuration

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
- Deploy bot to server
- Register commands with Discord
- Test `/ping` command in Discord
- Verify health endpoint responds

### Success Criteria
- Bot responds to `/ping` with "Pong!"
- Health endpoint returns 200 OK
- Bot stays online and stable

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

## Iteration 3: Basic Alert Posting (Days 5-6)
**Goal:** Post webhook data to Discord channel

### Features
- Parse webhook payload
- Format as Discord embed
- Post to configured channel
- `/alert list` command to show recent alerts

### Implementation
- Create alert formatter
- Add Discord message sending
- Store message IDs with alerts
- Implement basic `/alert list` command

### Testing
- Send webhook → See Discord message
- Verify embed formatting
- Test `/alert list` shows recent alerts

### Success Criteria
- Webhooks result in Discord messages
- Messages are properly formatted
- Alert list command works
- No duplicate messages

---

## Iteration 4: Alert Management (Days 7-8)
**Goal:** Add alert acknowledgment and basic interaction

### Features
- Add "Acknowledge" button to alerts
- `/alert ack <id>` command
- Update message when acknowledged
- Track who acknowledged and when

### Implementation
- Add Discord components to messages
- Handle button interactions
- Update database schema for acknowledgments
- Implement ack command

### Testing
- Click acknowledge button
- Use ack command
- Verify message updates
- Check acknowledgment tracking

### Success Criteria
- Buttons work and update messages
- Acknowledgments are tracked
- Both button and command work
- User info is recorded

---

## Iteration 5: Silence System (Days 9-11)
**Goal:** Implement alert silencing functionality

### Features
- `/silence <duration> [pattern]` command
- Silence matching during webhook processing
- `/silence list` to show active silences
- `/silence delete <id>` to remove silences
- Automatic expiration

### Implementation
- Add silences table to database
- Implement regex matching logic
- Create silence management commands
- Add background job for cleanup
- Update webhook flow for silence checking

### Testing
- Create silence → Send matching webhook → No Discord message
- List active silences
- Delete silence → Alerts resume
- Test expiration

### Success Criteria
- Silenced alerts don't post to Discord
- Silence patterns work correctly
- Silences expire on schedule
- All silence commands functional

---

## Iteration 6: Basic AlertRouter (Days 12-13)
**Goal:** Add routing layer between webhooks and Discord

### Features
- Create AlertRouter component
- Pass-through routing (all to DEFAULT_CHANNEL_ID)
- Routing decision logging
- Maintain backward compatibility

### Implementation
```javascript
// New component
class AlertRouter {
  async route(alert) {
    // For now, just pass through
    const decision = {
      action: 'PASS',
      destination: process.env.DEFAULT_CHANNEL_ID,
      timestamp: new Date()
    };
    
    // Log routing decision
    await logRoutingDecision(alert, decision);
    
    return decision;
  }
}
```

### Testing
- Webhook → AlertRouter → Discord flow
- Verify routing logs are created
- Ensure existing functionality unchanged
- Test with various webhook payloads

### Success Criteria
- AlertRouter integrated into webhook flow
- All alerts still reach Discord
- Routing decisions are logged
- No breaking changes

---

## Iteration 6.5: Routing Rules Engine (Days 14-15)
**Goal:** Add database-backed routing rules with basic matchers

### Features
- SQLite database for routing rules
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

## Iteration 7: Advanced Routing (Days 16-17)
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

## Iteration 8: Alert Deduplication (Days 18-19)
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

## Iteration 9: Production Hardening (Days 20-22)
**Goal:** Prepare for production deployment

### Features
- SQLite/PostgreSQL database
- Comprehensive error handling
- Rate limiting
- Retry logic for Discord
- Structured logging
- Docker containerization

### Implementation
- Migrate from in-memory to database
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

## Iteration 10: Advanced Commands (Days 23-24)
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

## Iteration 11: Monitoring & Polish (Days 25-26)
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

**Week 1:** Iterations 0-3 (Basic bot with webhook → Discord)
**Week 2:** Iterations 4-5 (Acknowledgments and silencing)
**Week 3:** Iterations 6-7 (AlertRouter and routing rules)
**Week 4:** Iteration 8-9 (Deduplication and hardening)
**Week 5:** Iterations 10-11 (Advanced features and polish)

Total: **5 weeks** from start to production-ready bot with full routing

---

## Next Steps

1. **Immediate:** Complete Iteration 0 (cleanup)
2. **Day 2:** Deploy Iteration 1 (ping bot)
3. **Day 3:** Start Iteration 2 (webhooks)
4. **Daily:** Review progress and adjust

Each iteration builds confidence and adds functionality while maintaining a working system throughout development.