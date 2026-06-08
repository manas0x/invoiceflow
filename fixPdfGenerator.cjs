const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/utils/pdfGenerator.js');
let content = fs.readFileSync(filePath, 'utf8');

// Replace address
content = content.replace(/'Subhasnagar Road, Bakhpur, Nainital, Uttarakhand 263148'/g, "appConfig.address");
content = content.replace(/'Subhasnagar Road, Bakhpur'/g, "appConfig.address");
content = content.replace(/'VILL BAKHPUR , SHAKTI FARM ROAD'/g, "appConfig.address");

// Replace phone
content = content.replace(/'Phone: \+91 75359 10738'/g, "`Phone: ${appConfig.contact}`");
content = content.replace(/'Ph: \+91 75359 10738'/g, "`Ph: ${appConfig.contact}`");
content = content.replace(/Mobile: 7535910738 Email: YASHARORA133@GMAIL\.COM/g, "Mobile: ${appConfig.contact}");

fs.writeFileSync(filePath, content, 'utf8');
console.log("Updated pdfGenerator.js");
