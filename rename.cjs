const fs = require('fs');
const path = require('path');

const replacements = [
  { regex: /Mahaveer Khad Bhandar/gi, replacement: (match) => {
      if (match === 'MAHAVEER KHAD BHANDAR') return 'INVOICE FLOW';
      if (match === 'Mahaveer Khad Bhandar') return 'Invoice Flow';
      return 'Invoice Flow';
  }},
  { regex: /Mahaveer/gi, replacement: (match) => {
      if (match === 'MAHAVEER') return 'INVOICE FLOW';
      if (match === 'Mahaveer') return 'Invoice Flow';
      if (match === 'mahaveer') return 'invoiceflow';
      return 'Invoice Flow';
  }},
  { regex: /mahaveer_user/g, replacement: 'invoiceflow_user' },
  { regex: /Farmer/g, replacement: 'Customer' },
  { regex: /farmer/g, replacement: 'customer' },
  { regex: /FARMER/g, replacement: 'CUSTOMER' },
  { regex: /Fertilizers, Pesticides & Seeds Retailer/gi, replacement: 'General POS Retailer' },
  { regex: /Fertilizers, Pesticides & Seeds/gi, replacement: 'General POS Retailer' },
  { regex: /Fertilizer/g, replacement: 'General' },
  { regex: /fertilizer/g, replacement: 'general' },
  { regex: /Pesticide/g, replacement: 'Other' },
  { regex: /pesticide/g, replacement: 'other' }
];

function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (file === 'node_modules' || file === '.git' || file === 'dist' || file === 'rename.js' || file === 'package-lock.json') continue;
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            processDirectory(fullPath);
        } else if (stat.isFile() && /\.(js|jsx|ts|tsx|html|json)$/.test(file)) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let original = content;
            for (const { regex, replacement } of replacements) {
                content = content.replace(regex, replacement);
            }
            if (content !== original) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log(`Updated ${fullPath}`);
            }
        }
    }
}

processDirectory(__dirname);
