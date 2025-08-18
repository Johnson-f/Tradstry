export function getTimeBasedGreeting() {
  const hour = new Date().getHours();
  const greetings = [
    { min: 5, max: 11, greeting: 'Good morning' },
    { min: 12, max: 16, greeting: 'Good afternoon' },
    { min: 17, max: 20, greeting: 'Good evening' },
    { min: 21, max: 4, greeting: 'Good night' },
  ];

  const casualGreetings = [
    "How's it going?",
    "What's good?",
    "How's your day going?",
    "Ready to analyze some trades?",
    "Let's make some great trades today!",
    "Stay disciplined, stay profitable!",
    "Trade the plan, plan the trade!",
    "How are the markets treating you?",
  ];

  const tradingReminders = [
    "Remember to review your trading plan.",
    "Have you reviewed your watchlist today?",
    "Don't forget to set your stop losses.",
    "Keep an eye on your risk management.",
    "Consider taking profits at your target levels.",
    "Stay patient for your setups.",
    "Review your trading journal for patterns.",
    "Stay disciplined with your trading rules.",
  ];

  const timeGreeting = greetings.find(g => 
    (g.min <= g.max && hour >= g.min && hour <= g.max) ||
    (g.min > g.max && (hour >= g.min || hour <= g.max))
  )?.greeting || 'Hello';

  const randomCasual = casualGreetings[Math.floor(Math.random() * casualGreetings.length)];
  const randomReminder = tradingReminders[Math.floor(Math.random() * tradingReminders.length)];

  return {
    timeGreeting,
    casualGreeting: randomCasual,
    tradingReminder: randomReminder
  };
}

/*
Update this file to include Market closing - reminder traders about that 
Make it better over time 
*/