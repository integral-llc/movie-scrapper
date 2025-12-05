require('dotenv').config();
const axios = require('axios');
const API_KEY = process.env.TMDB_API_KEY;
console.log('API_KEY exists:', !!API_KEY);

async function test() {
  const url = 'https://api.themoviedb.org/3/search/movie';
  const res = await axios.get(url, {
    params: { api_key: API_KEY, query: 'What If', year: 2014, language: 'en-US' }
  });
  console.log('Total results:', res.data.total_results);
  res.data.results.slice(0, 8).forEach((r, i) => {
    console.log(`${i+1}. id:${r.id} "${r.title}" (${r.release_date?.slice(0,4) || '???'}) [lang:${r.original_language}] votes:${r.vote_count} pop:${r.popularity?.toFixed(1)}`);
  });
}
test().catch(e => console.error(e.message));
