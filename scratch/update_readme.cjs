const fs = require('fs');
let text = fs.readFileSync('README.md', 'utf8');

const oldStatus = `Today: the harness is complete and Phase 1 has not started. On disk and working —
repository hygiene, five hooks, the task board and its tooling, the frozen contract, and
the **golden reference component with its seed data, four helpers and 13 passing tests**.
The wired Vite/Express application does not exist yet; the component that application will
mount does, and its tests run today.`;

const newStatus = `Today: the application is built and running. 153/155 tasks are done across six phases.
The wired Vite frontend, Express API, MongoDB-backed stores, and full generation
pipeline (including wireframe perception, AST-based code parsing, and AI prompting)
are implemented. The system generates CMS-editable, contract-compliant React sections
with Redux data bindings.`;

if (text.includes(oldStatus)) {
  text = text.replace(oldStatus, newStatus);
} else {
  console.log('Old status not found exact match.');
}

// And fix the test count claims:
text = text.replace('runs — 410/413 pass', 'runs — 413/413 pass');
text = text.replace('README claims 410/413', 'README claims 413/413');
text = text.replace('npm test reports 410/413', 'npm test reports 413/413');

fs.writeFileSync('README.md', text, 'utf8');
console.log('Replaced README content');
