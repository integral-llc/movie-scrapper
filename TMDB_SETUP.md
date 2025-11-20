# TMDb API Setup Guide

## Why TMDb?

**TMDb (The Movie Database) is what Kodi uses!** It's FREE and handles international titles WAY better than OMDb.

### Advantages over OMDb:
- ✅ **Handles Cyrillic, Chinese, Japanese natively** (no translation needed!)
- ✅ **Original 4K quality posters**
- ✅ **100% FREE** (no paid tier)
- ✅ **Better search** for international films
- ✅ **More comprehensive** movie database

## How to Get FREE TMDb API Key

### Step 1: Create Account
1. Go to: https://www.themoviedb.org/
2. Click "Join TMDb" (top right)
3. Fill in details:
   - Username
   - Password
   - Email
4. Verify email

### Step 2: Request API Key
1. Log in to TMDb
2. Go to: https://www.themoviedb.org/settings/api
3. Click "Request an API Key"
4. Select: **"Developer"** (not Commercial)
5. Accept terms

### Step 3: Fill Application
**Application Name**: Movie Scrapper
**Application URL**: http://localhost:9988 (or your URL)
**Application Summary**:
```
Personal movie file organizer that renames files with IMDB data and generates Kodi-compatible NFO files and posters.
```

### Step 4: Get API Key
1. Submit application
2. **INSTANT APPROVAL** (takes 2 seconds!)
3. Copy your **API Key (v3 auth)**
4. You'll see something like: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`

### Step 5: Add to .env
Open `/Users/dev/projects/IG/MovieScrapper/.env` and add:

```env
# TMDb API - Get from: https://www.themoviedb.org/settings/api
TMDB_API_KEY=your_actual_key_here
```

## Testing Your API Key

### Quick Test:
```bash
# Replace YOUR_KEY with your actual key
curl "https://api.themoviedb.org/3/search/movie?api_key=YOUR_KEY&query=The%20Matrix"
```

You should see JSON response with "The Matrix" results!

### Run Integration Tests:
```bash
npm test
```

Should pass all 10 tests including:
- ✅ Russian titles (Всё везде и сразу)
- ✅ Chinese titles (卧虎藏龙)
- ✅ Japanese titles (千と千尋の神隠し)
- ✅ Korean titles (기생충)
- ✅ And more!

## API Limits (FREE Tier)

### Rate Limits:
- **40 requests every 10 seconds**
- **Plenty for personal use!**

### Typical Usage:
- Full scan of 150 movies = ~300 requests
- Takes ~75 seconds (well within limits)
- **No daily limit!** (unlike OMDb's 1,000/day)

## What Happens Without TMDb Key?

The system will fall back to OMDb API, but:
- ❌ International titles won't work well
- ❌ Requires translation for everything
- ❌ Lower quality posters
- ❌ Daily limit of 1,000 requests

**Bottom line**: Get TMDb key! It takes 2 minutes and makes the system 10x better!

## Troubleshooting

### "Invalid API key"
- Double-check you copied the full key
- Make sure it's the **API Key (v3 auth)**, not the "API Read Access Token"
- No spaces before/after in `.env`

### "Too many requests"
- Wait 10 seconds
- System automatically handles rate limiting

### Still not working?
```bash
# Test API key directly
curl "https://api.themoviedb.org/3/configuration?api_key=YOUR_KEY"

# Should return configuration JSON, not an error
```

## Benefits You'll See

### Before (OMDb only):
```
❌ Всё везде и сразу.2022.mkv  → NOT FOUND
```

### After (TMDb):
```
✅ Всё везде и сразу.2022.mkv  → Everything Everywhere All at Once (2022) (IMDB 7.8).mkv
   + NFO file
   + 4K poster with IMDB watermark
```

## Summary

1. **Go to**: https://www.themoviedb.org/settings/api
2. **Request API Key** (Developer)
3. **Copy API Key (v3 auth)**
4. **Add to .env**: `TMDB_API_KEY=your_key`
5. **Restart server**: `npm start`
6. **Test**: `npm test`

**Total time**: 2-3 minutes
**Result**: International titles work perfectly!

---

**Get your key now**: https://www.themoviedb.org/settings/api
