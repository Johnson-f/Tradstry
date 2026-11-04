export const QUESTIONS = [
  {
    question: 'Which brokers work with Tradstry?',
    answer:
      'Tradstry connects through SnapTrade, which supports many of the larger US and Canadian brokers. If yours isn’t one of them, you can add fills by hand and they’re grouped into trades the same way.',
  },
  {
    question: 'How much of my history comes in?',
    answer:
      'You choose when you link an account: the last year, the last two years, everything your broker has, or from a date you pick. New trades keep arriving after that.',
  },
  {
    question: 'Does Tradstry trade for me?',
    answer:
      'No. Tradstry reads your fills, positions and balances to build your journal. It can’t place orders or move money, and it doesn’t give investment advice.',
  },
  {
    question: 'Does it handle options?',
    answer: 'Yes. Stocks and options are both rebuilt into trades, and the position calculator sizes either.',
  },
  {
    question: 'Can I keep more than one account?',
    answer:
      'Yes. Each workspace has its own trades, journal and rules, so a cash account and a margin account never mix. Switching takes one click.',
  },
  {
    question: 'How does the Claude and ChatGPT connection work?',
    answer:
      'Tradstry is an MCP server. Add it in Claude or ChatGPT and sign in with your Tradstry account. You approve the connection, it starts read-only, and writing to your journal needs your separate permission.',
  },
]
