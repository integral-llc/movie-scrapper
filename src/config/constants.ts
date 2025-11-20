export const MOVIE_EXTENSIONS = [
  '.mkv',
  '.mp4',
  '.avi',
  '.mov',
  '.wmv',
  '.flv',
  '.webm',
  '.m4v',
  '.mpg',
  '.mpeg',
  '.m2v',
  '.3gp',
  '.ogv',
];

export const BDRIP_INDICATORS = [
  'bdmv',
  'certificate',
  'backup',
  'playlist',
  'clipinf',
  'stream',
];

export const MOVIE_NAME_PATTERNS = {
  YEAR: /\b(19\d{2}|20\d{2})\b/,
  QUALITY: /\b(480p|720p|1080p|2160p|4k|hd|uhd|bluray|brrip|bdrip|dvdrip|webrip|web-dl|web|hdtv|kp)\b/gi,
  CODEC: /\b(x264|x265|h264|h265|hevc|xvid|divx|avc)\b/gi,
  AUDIO: /\b(aac|ac3|dts|truehd|atmos|dd5\.1|dd7\.1)\b/gi,
  LANGUAGE: /\b(rus|ukr|eng|english|russian|ukrainian|multi|dual)\b/gi,
  // Folder quality indicators (60 FPS, 4K, UHD, etc.)
  FOLDER_QUALITY: /\b(\d+\s*fps|60fps|30fps|24fps|ai\s*upscale|remaster(?:ed)?)\b/gi,
  GROUP: /\b-[A-Z0-9]+$/i,
  BRACKETS: /[\[\](){}]/g,
  DOTS_UNDERSCORES: /[._]/g,
  MULTI_SPACES: /\s+/g,
  // TV Episode patterns - to detect and skip TV shows
  EPISODE: /^(\d{1,2})[.\s-]+/i, // Matches "06." or "06 " at start
  TV_EPISODE: /\b(s\d{1,2}[.\s]?e\d{1,2}|season\s*\d+|episode\s*\d+)\b/i, // Matches S01E02 or S01.E02 (removed /g flag for .test())
  // Audio/Music file patterns
  AUDIO_FILE: /\b(atmos\s*mix|music|soundtrack|ost|audio\s*track)\b/i, // Removed /g flag for .test()
};

export const CYRILLIC_COUNTRIES = ['Russia', 'Russian'];
export const ROMANIAN_COUNTRIES = ['Romania', 'Romanian'];
