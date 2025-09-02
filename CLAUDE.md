# Alarmageddon Bot - Development Context for Claude

## Project Overview
Alarmageddon is a Production SRE Discord bot that receives webhooks from monitoring systems (like Google Cloud Alerts) and posts them as formatted messages to Discord channels. The bot provides alert management capabilities including acknowledgment, silencing, and routing.

## Current Status (Iterations Completed)
- ✅ **Iteration 0-4 COMPLETE**: Basic setup, ping command, webhook receiver, alert posting, acknowledgment system
- 🚧 **Next**: Iteration 5 (Silence System)
- See `PLAN.md` for full iteration roadmap

## Key Files
- `app.js` - Main Express server handling Discord interactions and webhooks
- `src/alerts.js` - Alert formatting and Discord message management
- `src/webhooks.js` - Webhook storage and acknowledgment logic
- `src/logger.js` - Structured logging with Pino
- `commands.js` - Discord command registration script
- `PLAN.md` - Iterative development plan
- `DESIGN.md` - Technical architecture and design decisions

## Environment Setup
The `.env` file requires:
```
APP_ID=<Discord App ID>
DISCORD_TOKEN=<Bot Token>
PUBLIC_KEY=<Discord Public Key>
DEFAULT_CHANNEL_ID=<Channel for alerts>
WEBHOOK_TOKEN=<Bearer auth token>
WEBHOOK_URL_TOKEN=<URL param token for services that don't support headers>
LOG_LEVEL=debug
AMGN_LOGFILE=alarmageddon.log
```

## Development Workflow
1. **Start server**: `npm run dev` (includes nodemon for auto-restart)
2. **Register commands**: `npm run register` (after adding/modifying Discord commands)
3. **Test webhooks**: Use curl examples below
4. **Check logs**: Structured JSON logs in `alarmageddon.log` and console

### Server Restart Policy
**IMPORTANT**: If the server needs to be restarted (e.g., for environment variable changes, port conflicts, or manual restart needed), PAUSE and ask the user to restart it. Do not attempt to kill and restart the server programmatically. The user typically has the server running in a separate terminal with `npm run dev`.

## Testing Commands

### Send Test Alert
```bash
curl -X POST http://localhost:31337/webhooks/google-alerts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WEBHOOK_TOKEN" \
  -d '{
    "title": "Test Alert",
    "description": "Test description",
    "severity": "medium",
    "service": "test-service"
  }'
```

### Health Check
```bash
curl http://localhost:31337/health
```

## Discord Commands
- `/ping` - Test bot responsiveness
- `/webhook test` - Send test webhook to bot
- `/alert list` - Show active (unacknowledged) alerts
- `/alert ack [pattern]` - Acknowledge alerts matching regex pattern (default: .* for all)

## Key Features Implemented

### Alert Acknowledgment
- **Button click**: Green "Acknowledge" button on each alert
- **Regex patterns**: `/alert ack disk` acknowledges all disk-related alerts
- **Bulk operations**: `/alert ack` with no args acknowledges all
- **Filtering**: `/alert list` only shows unacknowledged alerts

### Webhook Authentication
- **Bearer token**: Via Authorization header (preferred)
- **URL token**: Via `?token=` query parameter (for services like Google Cloud)

### Alert Formatting
- Color-coded by severity (critical=red, high=orange, medium=yellow, info=blue)
- Shows severity, source, service, hostname
- Links to original alert URL if provided
- Updates to green when acknowledged

## Architecture Notes
- **In-memory storage**: Alerts stored in memory (will add database in Iteration 9)
- **Structured logging**: JSON logs with contextual fields
- **Discord interactions**: Uses discord-interactions package for signature verification
- **Express server**: Port 31337 by default

## Common Issues & Solutions

### Commands not showing in Discord
- Run `npm run register` to register commands
- Global commands can take up to 1 hour to propagate
- Check bot has proper permissions in server

### Webhooks not posting to Discord
- Verify DEFAULT_CHANNEL_ID is set in .env
- Check bot has permission to post in that channel
- Look for errors in alarmageddon.log

### Alert not acknowledging
- Remember acknowledgments are lost on server restart (no persistence yet)
- Check the webhook ID in logs matches what you're trying to acknowledge
- Use regex patterns for bulk acknowledgment

## Next Development Tasks (Iteration 5)
1. Implement silence system to prevent certain alerts from posting
2. Add `/silence <duration> [pattern]` command
3. Create silence expiration logic
4. Update webhook handler to check silences before posting

## Important Conventions
- Use structured logging with contextual fields
- Follow existing code patterns (check neighboring files)
- Don't add comments unless requested
- Test all changes with actual Discord interactions
- Update PLAN.md when completing iterations

## Useful Discord Resources
- Message formatting: https://discord.com/developers/docs/reference#message-formatting
- Slash commands: https://discord.com/developers/docs/interactions/application-commands
- Embeds: https://discord.com/developers/docs/resources/channel#embed-object
- Components (buttons): https://discord.com/developers/docs/interactions/message-components

## Quick Status Check
1. Check server is running: `curl http://localhost:31337/health`
2. Check recent logs: `tail -f alarmageddon.log | jq`
3. Test in Discord: `/ping` should respond "Pong!"
4. Send test alert: `/webhook test` or use curl command above