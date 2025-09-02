# Alarmageddon
A Discord Bot for Production SRE - Alert Management and Incident Response

## Overview
Alarmageddon is a Discord bot designed for Site Reliability Engineering teams to manage alerts, incidents, and operational tasks directly from Discord. The bot receives webhooks from monitoring systems and posts formatted alerts to Discord channels with intelligent routing and silencing capabilities.

## Features (In Development)
- **Webhook Integration**: Receive alerts from Google Alerts and other monitoring systems
- **Alert Management**: Acknowledge, silence, and manage alerts
- **Smart Routing**: Route alerts to appropriate channels based on severity and content
- **Silence System**: Temporarily suppress alerts matching patterns
- **Incident Tracking**: Create and manage incidents
- **On-Call Integration**: Check on-call schedules and page engineers

## Setup

### Prerequisites
- Node.js 18.x or higher
- Discord Application and Bot Token
- Discord Server with appropriate channels

### Discord Bot Setup
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to the Bot section and create a bot
4. Copy the bot token
5. Go to OAuth2 > URL Generator
6. Select `bot` and `applications.commands` scopes
7. Select necessary permissions (Send Messages, Embed Links, etc.)
8. Use the generated URL to invite the bot to your server

### Local Development Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd alarmageddon
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
# Copy the sample env file
cp .env.sample .env

# Edit .env with your Discord credentials
APP_ID=your_app_id_here
DISCORD_TOKEN=your_bot_token_here
PUBLIC_KEY=your_public_key_here
```

4. **Register Discord commands**
```bash
npm run register
```

5. **Start the bot**
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

6. **Test the bot**
- In Discord, type `/ping`
- The bot should respond with "Pong!"
- Check health endpoint: `curl http://localhost:3000/health`

## Project Structure
```
alarmageddon/
├── app.js           # Main application and Discord interaction handler
├── commands.js      # Discord command definitions
├── utils.js         # Utility functions for Discord API
├── package.json     # Project dependencies and scripts
├── .env            # Environment variables (not in git)
├── DESIGN.md       # System design documentation
└── PLAN.md         # Development plan and iterations
```

## Development Status

### Current: Iteration 1 - Basic Bot
- [x] Clean project structure
- [x] Basic `/ping` command
- [x] Health check endpoint
- [ ] Deploy and test

### Next Steps
See [PLAN.md](PLAN.md) for the full development roadmap.

## Available Commands

### Current Commands
- `/ping` - Test if the bot is responsive

### Planned Commands
- `/alert list` - Show recent alerts
- `/alert ack <id>` - Acknowledge an alert
- `/silence <duration> [pattern]` - Silence alerts matching pattern
- `/webhook test` - Send test webhook
- And more...

## Contributing
This project is under active development. See PLAN.md for the development roadmap and current iteration goals.

## License
MIT