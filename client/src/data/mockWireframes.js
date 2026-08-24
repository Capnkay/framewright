// This file provides predefined editable CMS elements based on wireframe file names.

// Helper to generate IDs
const generateId = (prefix) => `${prefix}_${Math.random().toString(36).substr(2, 6)}`;

// Base styles for headers, buttons, etc.
const h1Style = { type: "text", fontSize: 48, fontWeight: 700, color: "#18181b", align: "center", bg: "transparent" };
const h2Style = { type: "text", fontSize: 32, fontWeight: 600, color: "#18181b", align: "left", bg: "transparent" };
const pStyle = { type: "text", fontSize: 18, fontWeight: 400, color: "#4b5563", align: "center", bg: "transparent" };
const btnStyle = { type: "button", fontSize: 16, fontWeight: 600, color: "#ffffff", align: "center" };

export const mockWireframes = {
  "hero.png": [
    { id: generateId('heading'), label: "Hero Heading", content: "Empower Your Workflow", x: 20, y: 20, width: 600, ...h1Style },
    { id: generateId('subhead'), label: "Subheading", content: "The best tool for creating amazing products in record time.", x: 20, y: 100, width: 600, ...pStyle },
    { id: generateId('cta1'), label: "Primary CTA", content: "Get Started", x: 180, y: 180, width: 140, ...btnStyle },
    { id: generateId('cta2'), label: "Secondary CTA", content: "Read Docs", x: 330, y: 180, width: 140, ...btnStyle, bg: "transparent", color: "#18181b" }
  ],
  "features.png": [
    { id: generateId('heading'), label: "Section Heading", content: "Amazing Features", x: 20, y: 20, width: 600, ...h2Style, align: "center" },
    { id: generateId('feat1'), label: "Feature 1", content: "Lightning Fast Performance", x: 20, y: 100, width: 180, ...pStyle, align: "left" },
    { id: generateId('feat2'), label: "Feature 2", content: "Global Edge Network", x: 220, y: 100, width: 180, ...pStyle, align: "left" },
    { id: generateId('feat3'), label: "Feature 3", content: "Secure by Default", x: 420, y: 100, width: 180, ...pStyle, align: "left" }
  ],
  "pricing.png": [
    { id: generateId('heading'), label: "Pricing Heading", content: "Simple, Transparent Pricing", x: 20, y: 20, width: 600, ...h2Style, align: "center" },
    { id: generateId('plan1'), label: "Basic Plan", content: "$9 / month", x: 50, y: 100, width: 200, ...pStyle },
    { id: generateId('plan2'), label: "Pro Plan", content: "$29 / month", x: 350, y: 100, width: 200, ...pStyle }
  ],
  "testimonials.png": [
    { id: generateId('heading'), label: "Heading", content: "What Our Customers Say", x: 20, y: 20, width: 600, ...h2Style, align: "center" },
    { id: generateId('quote1'), label: "Quote 1", content: '"Incredible product, changed how we work." - Alice', x: 20, y: 100, width: 280, ...pStyle, align: "left" },
    { id: generateId('quote2'), label: "Quote 2", content: '"Highly recommended!" - Bob', x: 320, y: 100, width: 280, ...pStyle, align: "left" }
  ],
  "faq.png": [
    { id: generateId('heading'), label: "FAQ Heading", content: "Frequently Asked Questions", x: 20, y: 20, width: 600, ...h2Style },
    { id: generateId('q1'), label: "Question 1", content: "How do I upgrade?", x: 20, y: 80, width: 600, ...pStyle, align: "left", fontWeight: 600 },
    { id: generateId('a1'), label: "Answer 1", content: "You can upgrade from your dashboard at any time.", x: 20, y: 110, width: 600, ...pStyle, align: "left" }
  ],
  "team.png": [
    { id: generateId('heading'), label: "Team Heading", content: "Meet the Team", x: 20, y: 20, width: 600, ...h2Style, align: "center" },
    { id: generateId('member1'), label: "CEO", content: "Jane Doe - CEO", x: 100, y: 100, width: 200, ...pStyle },
    { id: generateId('member2'), label: "CTO", content: "John Smith - CTO", x: 350, y: 100, width: 200, ...pStyle }
  ],
  "contact.png": [
    { id: generateId('heading'), label: "Heading", content: "Get In Touch", x: 20, y: 20, width: 600, ...h2Style },
    { id: generateId('email'), label: "Email", content: "hello@example.com", x: 20, y: 80, width: 600, ...pStyle, align: "left" },
    { id: generateId('phone'), label: "Phone", content: "+1 (555) 123-4567", x: 20, y: 120, width: 600, ...pStyle, align: "left" }
  ],
  "footer.png": [
    { id: generateId('logo'), label: "Logo Text", content: "ACME Corp", x: 20, y: 20, width: 200, ...h2Style, fontSize: 24 },
    { id: generateId('links'), label: "Links", content: "Privacy | Terms | Contact", x: 350, y: 30, width: 300, ...pStyle, align: "right", fontSize: 14 }
  ],
  "login.png": [
    { id: generateId('heading'), label: "Login Heading", content: "Welcome Back", x: 100, y: 20, width: 400, ...h2Style, align: "center" },
    { id: generateId('btn'), label: "Login Button", content: "Sign In", x: 200, y: 180, width: 200, ...btnStyle }
  ],
  "blog.png": [
    { id: generateId('heading'), label: "Blog Heading", content: "Latest Updates", x: 20, y: 20, width: 600, ...h2Style },
    { id: generateId('post1'), label: "Post 1", content: "New Features in v2.0", x: 20, y: 80, width: 280, ...pStyle, align: "left" },
    { id: generateId('post2'), label: "Post 2", content: "How to optimize performance", x: 320, y: 80, width: 280, ...pStyle, align: "left" }
  ]
};
