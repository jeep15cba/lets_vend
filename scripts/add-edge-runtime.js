#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get all API route files
const apiDir = path.join(__dirname, '../pages/api');

function addEdgeRuntimeToFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Check if edge runtime is already defined
    if (content.includes('export const runtime') || content.includes('runtime =')) {
      console.log(`✓ ${path.relative(process.cwd(), filePath)} - already has runtime config`);
      return;
    }

    // Add edge runtime at the top, after imports
    const lines = content.split('\n');
    let insertIndex = 0;

    // Find the last import or first non-comment line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('import ') || line.startsWith('const ') || line.startsWith('require(')) {
        insertIndex = i + 1;
      } else if (line.startsWith('//') || line.startsWith('/*') || line === '') {
        continue;
      } else {
        break;
      }
    }

    // Insert the edge runtime config
    lines.splice(insertIndex, 0, '', 'export const runtime = \'edge\';', '');

    const newContent = lines.join('\n');
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`✓ ${path.relative(process.cwd(), filePath)} - added edge runtime`);
  } catch (error) {
    console.error(`✗ ${path.relative(process.cwd(), filePath)} - error:`, error.message);
  }
}

function processDirectory(dirPath) {
  const files = fs.readdirSync(dirPath, { withFileTypes: true });

  files.forEach(file => {
    const fullPath = path.join(dirPath, file.name);

    if (file.isDirectory()) {
      processDirectory(fullPath);
    } else if (file.name.endsWith('.js') && !file.name.startsWith('.')) {
      addEdgeRuntimeToFile(fullPath);
    }
  });
}

console.log('Adding Edge Runtime configuration to API routes...\n');
processDirectory(apiDir);
console.log('\nDone! All API routes should now be compatible with Cloudflare Pages.');