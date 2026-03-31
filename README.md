# asgard
Odin chat mode for Copilot CLI with support with others from Asgard

## Overview

`asgard` is a Copilot CLI plugin that lets you chat with multiple AI agents, each embodying a god from Norse mythology. Every agent has a distinct personality and specialty, so you can pick the right one for your task.

## Agents

| Mode       | Name                          | Best For                                                         |
|------------|-------------------------------|------------------------------------------------------------------|
| `odin`     | Odin, The Allfather           | Architecture decisions, strategy, deep analysis (default)        |
| `thor`     | Thor, God of Thunder          | Code generation, implementation, getting things done             |
| `loki`     | Loki, God of Mischief         | Creative solutions, refactoring, unconventional approaches       |
| `freya`    | Freya, Goddess of Wisdom      | Documentation, explanations, learning                            |
| `heimdall` | Heimdall, Guardian of Bifrost | Code review, security analysis, finding issues                   |

## Installation

```bash
npm install -g .
```

Or run directly with `node bin/asgard.js`.

## Configuration

Set the following environment variables before running:

| Variable         | Description                                              | Default                          |
|------------------|----------------------------------------------------------|----------------------------------|
| `ASGARD_API_KEY` | Bearer token / API key **(required)**                    | —                                |
| `ASGARD_API_URL` | Base URL of the OpenAI-compatible API                    | `https://api.githubcopilot.com`  |
| `ASGARD_MODEL`   | Model name to use                                        | `gpt-4o`                         |

## Usage

### List available agents

```bash
asgard list
```

### Interactive chat session

```bash
asgard chat                     # default: Odin
asgard chat --mode thor
asgard chat -m loki
```

Type `exit` or `quit` to end the session.

### Single-turn question

```bash
asgard ask "How do I reverse a linked list?"
asgard ask --mode heimdall "Review this function for security issues: ..."
asgard ask -m freya "Explain async/await in JavaScript"
```

## Development

```bash
npm test       # run tests
```
