// Helper script to convert test formats from TupleScanOptions to WhereClause
// Run with: node test-helper.js

const fs = require('fs');
const path = require('path');

function convertTestFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Convert equality conditions: { gte: ["value"], lte: ["value"] } -> { eq: [{ col: "id", val: "value" }] }
  content = content.replace(
    /\{\s*gte:\s*\[([^\]]+)\],\s*lte:\s*\[([^\]]+)\]\s*\}/g,
    (match, gteVal, lteVal) => {
      // Check if gte and lte values are the same (equality condition)
      if (gteVal.trim() === lteVal.trim()) {
        return `{ eq: [{ col: "id", val: ${gteVal.trim()} }] }`;
      }
      // Otherwise, keep as range
      return `{ gte: [{ col: "id", val: ${gteVal.trim()} }], lte: [{ col: "id", val: ${lteVal.trim()} }] }`;
    }
  );
  
  // Convert single gte conditions: { gte: ["value"] } -> { gte: [{ col: "id", val: "value" }] }
  content = content.replace(
    /\{\s*gte:\s*\[([^\]]+)\]\s*\}/g,
    '{ gte: [{ col: "id", val: $1 }] }'
  );
  
  // Convert single lte conditions: { lte: ["value"] } -> { lte: [{ col: "id", val: "value" }] }
  content = content.replace(
    /\{\s*lte:\s*\[([^\]]+)\]\s*\}/g,
    '{ lte: [{ col: "id", val: $1 }] }'
  );
  
  // Convert single gt conditions: { gt: ["value"] } -> { gt: [{ col: "id", val: "value" }] }
  content = content.replace(
    /\{\s*gt:\s*\[([^\]]+)\]\s*\}/g,
    '{ gt: [{ col: "id", val: $1 }] }'
  );
  
  // Convert single lt conditions: { lt: ["value"] } -> { lt: [{ col: "id", val: "value" }] }
  content = content.replace(
    /\{\s*lt:\s*\[([^\]]+)\]\s*\}/g,
    '{ lt: [{ col: "id", val: $1 }] }'
  );
  
  fs.writeFileSync(filePath, content);
  console.log(`Converted ${filePath}`);
}

// Convert test files
const testFiles = [
  'src/hyperdb/db.test.ts',
  'src/hyperdb/subscribable-db.test.ts', 
  'src/hyperdb/drivers/tuple.test.ts'
];

testFiles.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    convertTestFile(fullPath);
  }
});