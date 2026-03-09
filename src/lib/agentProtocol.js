const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'open_webpage',
      description: 'Open a webpage URL in a new tab.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          background: { type: 'boolean' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_many_tabs',
      description: 'Open many tabs of the same URL.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          count: { type: 'integer' }
        },
        required: ['url', 'count']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_people',
      description: 'Open separate Google search tabs for each name.',
      parameters: {
        type: 'object',
        properties: {
          names: {
            type: 'array',
            items: { type: 'string' }
          }
        },
        required: ['names']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'save_credentials',
      description: 'Save login credentials for active site.',
      parameters: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          password: { type: 'string' }
        },
        required: ['username', 'password']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'fill_credentials',
      description: 'Fill saved credentials into the current page login fields.',
      parameters: {
        type: 'object',
        properties: {
          username: { type: 'string' },
          password: { type: 'string' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'navigate',
      description: 'Navigate active tab to a URL.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' }
        },
        required: ['url']
      }
    }
  }
];

function parseToolArguments(jsonText) {
  try {
    return JSON.parse(jsonText || '{}');
  } catch {
    return {};
  }
}

function buildSystemPrompt() {
  return [
    'You are a browser automation assistant.',
    'Use tools when user asks to open, navigate, fill credentials, or run multi-tab tasks.',
    'Execute actions directly, then briefly summarize what was done.',
    'For login automation, open the site first and then call fill_credentials when relevant.'
  ].join(' ');
}

module.exports = {
  TOOL_DEFINITIONS,
  parseToolArguments,
  buildSystemPrompt
};
