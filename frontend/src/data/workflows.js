export const WORKFLOWS = [
  {
    id: "contact-form", title: "Customer Contact Form", tagline: "Capture a form, save it, and reply automatically.",
    steps: [
      { name: "Webhook", desc: "Waits for a customer to submit your contact form and receives their details instantly." },
      { name: "Google Sheets", desc: "Saves the customer's name, email, and message as a new row for your records." },
      { name: "Gmail", desc: "Sends the customer an automatic confirmation email, letting them know you received their message." },
    ],
  },
  {
    id: "ai-chatbot", title: "AI Chatbot", tagline: "Answer customer questions automatically through WhatsApp.",
    steps: [
      { name: "Webhook", desc: "Receives an incoming WhatsApp message the moment a customer sends it." },
      { name: "AI Agent", desc: "Reads the customer's question and decides how to respond intelligently." },
      { name: "OpenAI", desc: "Generates the actual reply text based on the customer's question." },
      { name: "WhatsApp", desc: "Sends the AI's generated answer back to the customer instantly." },
    ],
  },
  {
    id: "daily-reminder", title: "Daily Reminder", tagline: "Send yourself a daily summary automatically, every morning.",
    steps: [
      { name: "Schedule Trigger", desc: "Starts the workflow automatically every day at a time you choose." },
      { name: "Gmail", desc: "Sends a daily summary email to yourself or your team." },
      { name: "Slack", desc: "Posts the same reminder into a Slack channel so nobody misses it." },
    ],
  },
  {
    id: "restaurant-chatbot", title: "Restaurant Chatbot", tagline: "Take food orders automatically over WhatsApp.", popular: true,
    steps: [
      { name: "Webhook", desc: "Receives an incoming WhatsApp message from a hungry customer." },
      { name: "AI Agent", desc: "Understands the order, checks the menu, and asks clarifying questions if needed." },
      { name: "Google Sheets", desc: "Logs the finished order into your kitchen's order sheet." },
      { name: "WhatsApp", desc: "Confirms the order and estimated time back to the customer." },
    ],
  },
  {
    id: "dental-booking", title: "Dental Clinic Booking", tagline: "Let patients book appointments without calling the front desk.", popular: true,
    steps: [
      { name: "Webhook", desc: "Receives a booking request from your website or WhatsApp." },
      { name: "If", desc: "Checks whether the requested time slot is still available." },
      { name: "Google Sheets", desc: "Saves the confirmed appointment into your clinic's schedule." },
      { name: "Email", desc: "Sends the patient a confirmation with the date, time, and address." },
    ],
  },
  {
    id: "whatsapp-bot", title: "WhatsApp Bot", tagline: "A dedicated support bot that replies instantly, day or night.", popular: true,
    steps: [
      { name: "Webhook", desc: "Catches every incoming WhatsApp message the moment it arrives." },
      { name: "Switch", desc: "Routes the message based on keywords, like 'pricing' or 'support'." },
      { name: "AI Agent", desc: "Handles anything that doesn't match a simple keyword rule." },
      { name: "WhatsApp", desc: "Sends the right reply back to the customer." },
    ],
  },
  {
    id: "lead-generation", title: "Lead Generation", tagline: "Collect and qualify new leads automatically.", popular: true,
    steps: [
      { name: "Webhook", desc: "Receives a new lead from a landing page or ad form." },
      { name: "HTTP Request", desc: "Enriches the lead with extra company or contact details from an API." },
      { name: "Google Sheets", desc: "Adds the qualified lead to your tracking sheet." },
      { name: "Slack", desc: "Notifies your sales team instantly about the new lead." },
    ],
  },
  {
    id: "email-automation", title: "Email Automation", tagline: "Send the right email automatically, based on what happened.", popular: true,
    steps: [
      { name: "Webhook", desc: "Triggers whenever a customer action happens, like a signup." },
      { name: "Set", desc: "Prepares the customer's name and details for the email template." },
      { name: "Gmail", desc: "Sends a personalized email using those details." },
    ],
  },
  {
    id: "invoice-generator", title: "Invoice Generator", tagline: "Turn a completed order into a sent invoice automatically.",
    steps: [
      { name: "Webhook", desc: "Receives details of a completed sale or order." },
      { name: "Code", desc: "Calculates totals, tax, and formats the invoice data." },
      { name: "Gmail", desc: "Emails the finished invoice to the customer as an attachment." },
    ],
  },
  {
    id: "ai-customer-support", title: "AI Customer Support", tagline: "Resolve common support questions without a human agent.", popular: true,
    steps: [
      { name: "Webhook", desc: "Receives a support message from chat, email, or WhatsApp." },
      { name: "AI Agent", desc: "Reads the question and checks it against your knowledge base." },
      { name: "If", desc: "Escalates to a human via Slack if the AI isn't confident in its answer." },
      { name: "WhatsApp", desc: "Replies directly to the customer when the AI has a solid answer." },
    ],
  },
  {
    id: "crm-automation", title: "CRM Automation", tagline: "Keep your customer records updated without manual data entry.",
    steps: [
      { name: "Webhook", desc: "Triggers whenever a customer interacts with your business." },
      { name: "Switch", desc: "Decides whether this is a new customer or an existing one." },
      { name: "PostgreSQL", desc: "Inserts or updates the customer's record in your CRM database." },
    ],
  },
  {
    id: "sheets-automation", title: "Google Sheets Automation", tagline: "Turn a spreadsheet into a lightweight automation trigger.",
    steps: [
      { name: "Schedule Trigger", desc: "Checks your spreadsheet on a regular schedule." },
      { name: "Google Sheets", desc: "Reads any new or updated rows since the last check." },
      { name: "Gmail", desc: "Sends a summary report based on what changed." },
    ],
  },
  {
    id: "social-automation", title: "Social Media Automation", tagline: "Auto-reply to comments and messages across your channels.",
    steps: [
      { name: "Webhook", desc: "Receives a new comment or direct message from Instagram or Facebook." },
      { name: "AI Agent", desc: "Drafts a friendly, on-brand reply based on the message content." },
      { name: "Instagram", desc: "Posts the reply back to the customer automatically." },
    ],
  },
  {
    id: "appointment-booking", title: "Appointment Booking", tagline: "A general-purpose booking flow for any service business.", popular: true,
    steps: [
      { name: "Webhook", desc: "Receives a booking request from your site, app, or chatbot." },
      { name: "If", desc: "Checks availability against your calendar or schedule." },
      { name: "Google Sheets", desc: "Records the confirmed booking for your team to see." },
      { name: "Email", desc: "Sends the customer a confirmation with all the details." },
    ],
  },
];
