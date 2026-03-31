'use strict';

const https = require('https');

/**
 * Sends a chat completion request to an OpenAI-compatible API endpoint.
 *
 * Environment variables:
 *   ASGARD_API_URL    Base URL for the API (default: https://api.githubcopilot.com)
 *   ASGARD_API_KEY    Bearer token / API key (required)
 *   ASGARD_MODEL      Model name to use (default: gpt-4o)
 *
 * @param {Array<{role: string, content: string}>} messages
 * @returns {Promise<string>} The assistant reply text
 */
async function sendMessage(messages) {
  const apiUrl = process.env.ASGARD_API_URL || 'https://api.githubcopilot.com';
  const apiKey = process.env.ASGARD_API_KEY;
  const model = process.env.ASGARD_MODEL || 'gpt-4o';

  if (!apiKey) {
    throw new Error(
      'ASGARD_API_KEY environment variable is not set. ' +
        'Set it to your GitHub Copilot API token or OpenAI API key.'
    );
  }

  const body = JSON.stringify({ model, messages, stream: false });
  const url = new URL('/chat/completions', apiUrl);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
              return;
            }
            const content = parsed.choices?.[0]?.message?.content;
            if (!content) {
              reject(new Error('Unexpected API response: ' + data));
              return;
            }
            resolve(content);
          } catch (e) {
            reject(new Error('Failed to parse API response: ' + data));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { sendMessage };
