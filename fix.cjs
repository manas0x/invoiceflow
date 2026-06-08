const fs = require('fs');

let f = fs.readFileSync('src/pages/InstallPage.jsx', 'utf8');
f = f.split('\\${').join('${');
fs.writeFileSync('src/pages/InstallPage.jsx', f);

console.log('Fixed InstallPage');
