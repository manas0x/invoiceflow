const fs = require('fs');
const path = require('path');

const fileUpdates = [
    {
        file: 'src/utils/pdfGenerator.js',
        replacements: [
            { regex: /'INVOICE FLOW'/g, replacement: "appConfig.appName.toUpperCase()" },
            { regex: /'Thank you for visiting Invoice Flow'/g, replacement: "`Thank you for visiting ${appConfig.appName}`" },
            { regex: /'Internal Purchase Record - Invoice Flow'/g, replacement: "`Internal Purchase Record - ${appConfig.appName}`" }
        ],
        imports: "import { appConfig } from '../config/appConfig';\n"
    },
    {
        file: 'src/pages/Billing.jsx',
        replacements: [
            { regex: /`\*INVOICE FLOW\*\\n`/g, replacement: "`*${appConfig.appName.toUpperCase()}*\\n`" }
        ],
        imports: "import { appConfig } from '../config/appConfig';\n"
    },
    {
        file: 'src/pages/Cumulative.jsx',
        replacements: [
            { regex: /"INVOICE FLOW"/g, replacement: "appConfig.appName.toUpperCase()" }
        ],
        imports: "import { appConfig } from '../config/appConfig';\n"
    },
    {
        file: 'src/services/firestoreService.js',
        replacements: [
            { regex: />Invoice Flow<\/strong>/g, replacement: ">${appConfig.appName}</strong>" },
            { regex: /'Invoice Flow Billing Software'/g, replacement: "`${appConfig.appName} Billing Software`" }
        ],
        imports: "import { appConfig } from '../config/appConfig';\n"
    },
    {
        file: 'shop/src/components/Navbar.jsx',
        replacements: [
            { regex: /<div className="brand-name">Invoice Flow<\/div>/g, replacement: '<div className="brand-name">{appConfig.appName}</div>' }
        ],
        imports: "import { appConfig } from '../../../src/config/appConfig';\n"
    },
    {
        file: 'shop/src/pages/ShopPage.jsx',
        replacements: [
            { regex: /<h1 className="hero-title">🌾 Invoice Flow<\/h1>/g, replacement: '<h1 className="hero-title">🌾 {appConfig.appName}</h1>' }
        ],
        imports: "import { appConfig } from '../../../src/config/appConfig';\n"
    }
];

fileUpdates.forEach(({ file, replacements, imports }) => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Add import if not present
        if (!content.includes('import { appConfig }') && !content.includes('import {appConfig}')) {
            const lines = content.split('\n');
            const importIndex = lines.findIndex(l => !l.startsWith('import ') && !l.startsWith('//') && l.trim() !== '');
            lines.splice(importIndex, 0, imports.trim());
            content = lines.join('\n');
        }

        replacements.forEach(({ regex, replacement }) => {
            content = content.replace(regex, replacement);
        });

        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${file}`);
    } else {
        console.log(`File not found: ${file}`);
    }
});
