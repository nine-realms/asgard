'use strict';

const readline = require('readline');

/**
 * Formats a message with the agent's name prefix.
 *
 * @param {string} agentName
 * @param {string} message
 * @returns {string}
 */
function formatAgentMessage(agentName, message) {
  return `\n[${agentName}]: ${message}\n`;
}

/**
 * Formats a user input prompt.
 *
 * @param {string} agentName
 * @returns {string}
 */
function formatPrompt(agentName) {
  return `You → ${agentName}: `;
}

/**
 * Creates a readline interface for interactive chat.
 *
 * @param {object} input  Readable stream (default: process.stdin)
 * @param {object} output Writable stream (default: process.stdout)
 * @returns {readline.Interface}
 */
function createReadlineInterface(input = process.stdin, output = process.stdout) {
  return readline.createInterface({ input, output, terminal: false });
}

/**
 * Prints the agent greeting and instructions to the output stream.
 *
 * @param {object} agent   Agent definition object
 * @param {object} output  Writable stream (default: process.stdout)
 */
function printWelcome(agent, output = process.stdout) {
  output.write('\n');
  output.write(`╔═══════════════════════════════════════╗\n`);
  output.write(`║  Asgard — ${agent.name.padEnd(28)}║\n`);
  output.write(`║  ${agent.title.padEnd(39)}║\n`);
  output.write(`╚═══════════════════════════════════════╝\n`);
  output.write(`${agent.description}\n`);
  output.write(`\nType your message and press Enter. Type "exit" or "quit" to leave.\n`);
  output.write(formatAgentMessage(agent.name, agent.greeting));
}

/**
 * Builds the messages array for the current conversation turn.
 * Keeps a rolling history for multi-turn context.
 *
 * @param {string}   systemPrompt
 * @param {Array}    history       Array of {role, content} objects
 * @param {string}   userInput
 * @returns {Array}
 */
function buildMessages(systemPrompt, history, userInput) {
  return [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: userInput }];
}

/**
 * Runs an interactive chat session with the given agent using the provided
 * `sendMessage` function to obtain AI responses.
 *
 * The session reads lines from `rl` and writes output to `output`.
 * It resolves when the user types "exit"/"quit" or the input stream closes.
 *
 * @param {object}   agent          Agent definition object
 * @param {Function} sendMessage    async (messages: Array) => string
 * @param {object}   rl             readline.Interface
 * @param {object}   output         Writable stream
 * @returns {Promise<void>}
 */
async function runChatSession(agent, sendMessage, rl, output = process.stdout) {
  const history = [];

  return new Promise((resolve) => {
    const prompt = () => {
      output.write(formatPrompt(agent.name));
    };

    prompt();

    rl.on('line', async (line) => {
      const input = line.trim();

      if (!input) {
        prompt();
        return;
      }

      if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
        output.write(formatAgentMessage(agent.name, agent.farewell));
        rl.close();
        return;
      }

      try {
        const messages = buildMessages(agent.systemPrompt, history, input);
        const reply = await sendMessage(messages);

        // Update rolling history
        history.push({ role: 'user', content: input });
        history.push({ role: 'assistant', content: reply });

        output.write(formatAgentMessage(agent.name, reply));
      } catch (err) {
        output.write(`\n[Error]: ${err.message}\n`);
      }

      prompt();
    });

    rl.on('close', resolve);
  });
}

module.exports = { formatAgentMessage, formatPrompt, buildMessages, printWelcome, runChatSession, createReadlineInterface };
