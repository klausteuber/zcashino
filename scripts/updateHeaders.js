const fs = require('fs');
const glob = require('glob');
const path = require('path');

const files = glob.sync('src/app/**/page.tsx', { ignore: 'src/app/admin/**' });

const headerRegex = /<header className=\"border-b border-masque-gold\/20 bg-midnight-black\/30 backdrop-blur-sm\">[\s\S]*?<\/header>/g;

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    if (content.match(headerRegex)) {
        content = content.replace(headerRegex, '<SiteHeader />');

        // Add import if not present
        if (!content.includes('import SiteHeader from')) {
            const importStatement = "import SiteHeader from '@/components/layout/SiteHeader'\n";
            // Insert after last import
            const lastImportIndex = content.lastIndexOf('import ');
            if (lastImportIndex !== -1) {
                const nextLineIndex = content.indexOf('\n', lastImportIndex);
                content = content.slice(0, nextLineIndex + 1) + importStatement + content.slice(nextLineIndex + 1);
            } else {
                content = importStatement + content;
            }
        }

        fs.writeFileSync(file, content);
        console.log('Updated ' + file);
    }
});
