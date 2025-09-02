import 'dotenv/config';
import { InstallGlobalCommands } from './utils.js';

// Simple ping command for testing
const PING_COMMAND = {
  name: 'ping',
  description: 'Test if the bot is responsive',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const ALL_COMMANDS = [PING_COMMAND];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);