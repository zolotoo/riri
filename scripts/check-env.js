import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');

const REQUIRED_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENROUTER_API_KEY',
  'RAPIDAPI_KEY',
  'JINA_API_KEY'
];

const OPTIONAL_VARS = [
  'MEM0_API_KEY',
  'RESEND_API_KEY'
];

console.log('🔍 Checking environment variables in .env.local...\n');

if (!fs.existsSync(envPath)) {
  console.error('❌ .env.local file not found!');
  console.log('   Run: cp .env.local.example .env.local');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    // Remove quotes if present
    value = value.replace(/(^['"]|['"]$)/g, '');
    env[key] = value;
  }
});

let missingCount = 0;

console.log('--- Required ---');
REQUIRED_VARS.forEach(key => {
  if (env[key] && env[key].trim().length > 0) {
    console.log(`✅ ${key}`);
  } else {
    console.log(`❌ ${key} (MISSING)`);
    missingCount++;
  }
});

console.log('\n--- Optional ---');
OPTIONAL_VARS.forEach(key => {
  if (env[key] && env[key].trim().length > 0) {
    console.log(`✅ ${key}`);
  } else {
    console.log(`⚠️  ${key} (Not set)`);
  }
});

if (missingCount > 0) {
  console.log(`\n❌ Total ${missingCount} required variable(s) missing.`);
  process.exit(1);
} else {
  console.log('\n✨ Environment is ready for local development!');
  process.exit(0);
}
