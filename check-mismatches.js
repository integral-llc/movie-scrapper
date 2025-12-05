const Database = require('better-sqlite3');
const db = new Database('./data/movies.db');

const movies = db.prepare('SELECT id, title, original_file_name, file_name, current_path, year, status FROM movies ORDER BY id').all();

console.log('Total movies in database:', movies.length);
console.log('');

const byStatus = {};
movies.forEach(m => {
  byStatus[m.status] = (byStatus[m.status] || 0) + 1;
});
console.log('By status:', JSON.stringify(byStatus));
console.log('');

console.log('=== MOVIES WHERE ORIGINAL != CURRENT NAME ===\n');

let mismatches = 0;
movies.forEach(m => {
  const orig = m.original_file_name || m.file_name || '(no original)';
  const curr = m.file_name || m.title;

  // Clean titles for comparison
  const origClean = orig.replace(/\s*\(\d{4}\).*$/i, '').replace(/\.(mkv|mp4|avi)$/i, '').trim().toLowerCase();
  const currClean = curr.replace(/\s*\(\d{4}\).*$/i, '').replace(/\.(mkv|mp4|avi)$/i, '').trim().toLowerCase();

  if (origClean !== currClean) {
    mismatches++;
    console.log('ID:', m.id, '| Status:', m.status);
    console.log('  ORIGINAL:', orig);
    console.log('  CURRENT: ', curr);
    console.log('  TITLE:   ', m.title);
    console.log('');
  }
});

console.log('Total mismatches found:', mismatches);
db.close();
