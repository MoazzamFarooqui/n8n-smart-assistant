import { Phone, TrendingUp, MessageCircle, Bot, Briefcase, Layers } from "lucide-react";

export const ROADMAP = [
  { title: "Learn the basics", desc: "Understand what n8n, nodes, triggers, and workflows are, and run your first simple automation." },
  { title: "Master core nodes", desc: "Get comfortable with Webhook, HTTP Request, Set, If, Switch, Merge, and Code — the nodes you'll use in almost every workflow." },
  { title: "Connect real apps", desc: "Learn to authenticate and use everyday integrations like Gmail, Google Sheets, Slack, and WhatsApp." },
  { title: "Add AI to your workflows", desc: "Learn AI Agents, Chat Models, and Memory so your automations can think, not just follow fixed rules." },
  { title: "Build complete projects", desc: "Combine everything into full workflows — a chatbot, a booking system, or a lead pipeline — from the Workflows tab." },
  { title: "Go professional", desc: "Learn best practices, error handling, and how to package your skills into a freelance service or product." },
];

export const BUSINESS_IDEAS = [
  { title: "WhatsApp Support Agency", icon: Phone, desc: "Build and sell AI-powered WhatsApp support bots to local businesses that can't afford a full support team." },
  { title: "Lead Generation Service", icon: TrendingUp, desc: "Automate lead capture and qualification for real estate agents, gyms, or clinics, and charge per qualified lead." },
  { title: "Restaurant Ordering Bots", icon: MessageCircle, desc: "Sell a ready-made WhatsApp ordering system to restaurants that still take orders by phone." },
  { title: "AI Calling Agents", icon: Bot, desc: "Build voice-based AI agents that call and qualify leads or confirm appointments automatically for clients." },
  { title: "n8n Freelance Consulting", icon: Briefcase, desc: "Offer freelance automation-building services to small businesses on platforms like Upwork and Fiverr." },
  { title: "Workflow Templates Store", icon: Layers, desc: "Package and sell your best workflows as ready-to-import templates to other n8n users." },
];

export const CAREER_GUIDE = {
  demand: "Automation and AI-agent skills are in growing demand as businesses look to cut manual work. n8n's open-source, self-hostable nature makes it popular with startups and agencies that want control over their tools and data.",
  freelancing: "Many n8n freelancers earn income by building chatbots, lead pipelines, and internal automations for small businesses that don't have in-house developers. Packaging a few solid workflow templates is often the fastest way to start.",
  paths: "Common paths include freelance automation consultant, in-house 'automation engineer' at a growing company, or building a small agency that bundles automation with AI chatbots and calling agents.",
  bestPractices: "Keep workflows simple and well-named, document what each one does, handle errors gracefully, and always test with real (but safe) sample data before going live for a client.",
};

export const LATEST_FEATURES = [
  { title: "Native AI Agent nodes", desc: "n8n includes built-in AI Agent and Chat Model nodes, so you can build agentic AI workflows without wiring together separate services." },
  { title: "Memory nodes for chatbots", desc: "Dedicated Memory nodes make it straightforward to give a chatbot context across a whole conversation." },
  { title: "Expanded AI integrations", desc: "Support for multiple AI providers side-by-side, like OpenAI and Gemini, makes it easy to compare or combine models." },
  { title: "Improved expression editor", desc: "A friendlier expression editor helps beginners write and debug {{ }} expressions with fewer mistakes." },
  { title: "Growing template library", desc: "A large and growing library of community workflow templates makes it faster to start from something close to what you need." },
];


export const TIPS = [
  "Always test your workflow with sample data before turning it on for real use.",
  "Use meaningful node names instead of the defaults, so your workflow reads like a story.",
  "Keep credentials secure and never paste them directly into node text fields.",
  "Read error messages carefully — they usually tell you exactly which node and field failed.",
  "Start with simple workflows first, then add complexity once the basics work reliably.",
];

export const MISTAKES = [
  { title: "Wrong credentials", desc: "Using an expired token or the wrong account causes nodes to fail silently or with confusing errors." },
  { title: "Disconnected nodes", desc: "A node with no connection in or out will never run, even if it looks correctly placed." },
  { title: "Incorrect expressions", desc: "A typo inside {{ }} expressions is one of the most common reasons data doesn't appear as expected." },
  { title: "Missing trigger", desc: "Every workflow needs exactly one starting trigger, or it will never run automatically." },
  { title: "Missing authentication", desc: "Forgetting to authorize a node's account connection will block it from working entirely." },
  { title: "Wrong webhook URL", desc: "Using the test URL instead of the production URL (or vice versa) means the trigger never fires." },
];

export const ABOUT = {
  history: "n8n was created as an open-source alternative to closed automation platforms, giving people more control over how their data and workflows are built and hosted.",
  purpose: "Its purpose is to let anyone — technical or not — connect different apps together visually, so tasks happen automatically instead of manually.",
  benefits: "n8n saves time, reduces human error, and lets small teams do the work of a much larger team by automating repetitive tasks.",
  companies: "Companies use n8n to automate customer support, internal reporting, marketing tasks, and data syncing between the many tools they already rely on.",
  advantages: "Compared to manual work, automation runs instantly, works 24 hours a day, never forgets a step, and frees people to focus on more meaningful work.",
};

export const JSON_GUIDE = {
  what: "JSON stands for JavaScript Object Notation. It's a simple, readable way to organize data using labeled pairs, similar to a form with labels and answers.",
  why: "n8n uses JSON internally to pass data between every node, since it's structured, flexible, and easy for both computers and people to read.",
  workflowJson: "workflow.json is a file that contains your entire workflow — every node, setting, and connection — saved as plain JSON text.",
  export: "You export workflow.json so you can back it up, share it with someone else, or move it to a different n8n account.",
  importInfo: "You can import workflow.json by opening n8n, choosing 'Import from File', and selecting your saved file — your whole workflow reappears instantly.",
  example: `{
  "name": "Send Welcome Email",
  "trigger": "Webhook",
  "recipient": "customer@email.com",
  "sent": true
}`,
  exampleLines: [
    { line: `"name": "Send Welcome Email"`, meaning: "This labels the workflow so you can recognize it later." },
    { line: `"trigger": "Webhook"`, meaning: "This tells you which node starts the workflow." },
    { line: `"recipient": "customer@email.com"`, meaning: "This stores the email address the message was sent to." },
    { line: `"sent": true`, meaning: "This is a true-or-false value confirming the email was actually sent." },
  ],
};

export const PURPOSE_PAGE = {
  whyNodesExist: "Nodes exist because every task — sending an email, checking a condition, calling an API — needs its own dedicated building block. Instead of one giant complicated tool, n8n breaks automation into small, understandable pieces.",
  howDataMoves: "Data moves from node to node along the connections you draw, like water flowing through pipes. Each node receives data, changes or uses it, then passes its result forward.",
  howNodesConnect: "Nodes connect through simple lines drawn between their input and output points. A single node can connect to multiple next steps, letting workflows branch and merge.",
  whyWorkflowsFail: "Workflows usually fail due to a missing trigger, wrong credentials, a broken expression, or a node that isn't properly connected — almost always a small, fixable detail.",
  howExecutionWorks: "When a workflow runs, n8n starts at the trigger and moves through each connected node in order, passing data along the way, until it reaches the end or hits an error.",
};

