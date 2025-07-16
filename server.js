// enhanced-server.js - Complete GitHub Contributors Badge Service (Avatar Loading Fixed)
const express = require('express');
const axios = require('axios');
const app = express();

// Cache for storing contributor data
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// GitHub API configuration
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Helper function to convert image to base64 (for reliable avatar loading)
async function getBase64Avatar(avatarUrl) {
  try {
    const response = await axios.get(avatarUrl, {
      responseType: 'arraybuffer',
      timeout: 5000,
      headers: {
        'User-Agent': 'GitHub-Contributors-Badge-Service'
      }
    });
    
    const base64 = Buffer.from(response.data).toString('base64');
    const contentType = response.headers['content-type'] || 'image/png';
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.warn('Failed to load avatar:', avatarUrl, error.message);
    return null;
  }
}

// Helper function to generate avatar pattern fallback
function generateAvatarPattern(username, index) {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#FFB6C1', '#87CEEB', '#DEB887',
    '#F0E68C', '#FFE4B5', '#D3D3D3', '#B0C4DE', '#FFA07A'
  ];
  
  const color = colors[index % colors.length];
  const initial = username.charAt(0).toUpperCase();
  
  return {
    color,
    initial,
    patternId: `pattern-${index}`
  };
}

// Helper function to get limited contributors from GitHub API
async function getContributors(repo, limit = 10, includeAvatars = true) {
  const cacheKey = `${repo}-${limit}-${includeAvatars}`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const headers = {
      'User-Agent': 'GitHub-Contributors-Badge-Service',
      'Accept': 'application/vnd.github.v3+json'
    };

    if (GITHUB_TOKEN) {
      headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    }

    const response = await axios.get(`${GITHUB_API_BASE}/repos/${repo}/contributors`, {
      params: { per_page: Math.min(limit, 100) },
      headers,
      timeout: 10000
    });

    const contributors = await Promise.all(
      response.data.map(async (contributor, index) => {
        let avatarData = null;
        
        if (includeAvatars) {
          avatarData = await getBase64Avatar(contributor.avatar_url);
        }
        
        return {
          login: contributor.login,
          avatar_url: contributor.avatar_url,
          avatar_base64: avatarData,
          html_url: contributor.html_url,
          contributions: contributor.contributions,
          fallback: generateAvatarPattern(contributor.login, index)
        };
      })
    );

    cache.set(cacheKey, {
      data: contributors,
      timestamp: Date.now()
    });

    return contributors;
  } catch (error) {
    console.error('Error fetching contributors:', error.message);
    
    if (error.response?.status === 404) {
      throw new Error('Repository not found');
    } else if (error.response?.status === 403) {
      throw new Error('API rate limit exceeded');
    } else if (error.response?.status === 401) {
      throw new Error('Authentication failed');
    } else {
      throw new Error('Failed to fetch contributors');
    }
  }
}

// Helper function to get ALL contributors from GitHub API (pagination)
async function getAllContributors(repo, includeAvatars = true) {
  const cacheKey = `${repo}-all-${includeAvatars}`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  const allContributors = [];
  let page = 1;
  let hasMore = true;

  try {
    const headers = {
      'User-Agent': 'GitHub-Contributors-Badge-Service',
      'Accept': 'application/vnd.github.v3+json'
    };

    if (GITHUB_TOKEN) {
      headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    }

    while (hasMore) {
      const response = await axios.get(`${GITHUB_API_BASE}/repos/${repo}/contributors`, {
        params: { 
          per_page: 100,
          page: page
        },
        headers,
        timeout: 10000
      });

      if (response.data.length === 0) {
        hasMore = false;
      } else {
        allContributors.push(...response.data);
        page++;
      }

      if (page > 100) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Process avatars in batches for better performance
    const processedContributors = [];
    const batchSize = 10;
    
    for (let i = 0; i < allContributors.length; i += batchSize) {
      const batch = allContributors.slice(i, i + batchSize);
      
      const processedBatch = await Promise.all(
        batch.map(async (contributor, batchIndex) => {
          const globalIndex = i + batchIndex;
          let avatarData = null;
          
          if (includeAvatars && globalIndex < 50) { // Only load first 50 avatars for performance
            avatarData = await getBase64Avatar(contributor.avatar_url);
          }
          
          return {
            login: contributor.login,
            avatar_url: contributor.avatar_url,
            avatar_base64: avatarData,
            html_url: contributor.html_url,
            contributions: contributor.contributions,
            fallback: generateAvatarPattern(contributor.login, globalIndex)
          };
        })
      );
      
      processedContributors.push(...processedBatch);
    }

    cache.set(cacheKey, {
      data: processedContributors,
      timestamp: Date.now()
    });

    return processedContributors;
  } catch (error) {
    console.error('Error fetching all contributors:', error.message);
    
    if (error.response?.status === 404) {
      throw new Error('Repository not found');
    } else if (error.response?.status === 403) {
      throw new Error('API rate limit exceeded');
    } else if (error.response?.status === 401) {
      throw new Error('Authentication failed');
    } else {
      throw new Error('Failed to fetch contributors');
    }
  }
}

// Helper function to generate SVG badge with reliable avatar loading
function generateSVGBadge(contributors, style = 'horizontal', theme = 'light') {
  const avatarSize = 40;
  const padding = 12;
  const usernameHeight = 16;
  const spacing = 6;
  const minItemWidth = 70;
  
  const themes = {
    light: {
      bg: '#ffffff',
      border: '#e1e4e8',
      text: '#586069',
      shadow: 'rgba(0,0,0,0.1)',
      hover: 'rgba(3,102,214,0.1)',
      fallbackText: '#ffffff'
    },
    dark: {
      bg: '#161b22',
      border: '#30363d',
      text: '#8b949e',
      shadow: 'rgba(0,0,0,0.3)',
      hover: 'rgba(56,139,253,0.1)',
      fallbackText: '#ffffff'
    }
  };
  
  const colors = themes[theme] || themes.light;
  
  let width, height;
  let contributorElements = '';
  let defs = '';

  if (style === 'grid') {
    const cols = Math.ceil(Math.sqrt(contributors.length));
    const rows = Math.ceil(contributors.length / cols);
    const itemWidth = Math.max(avatarSize + padding, minItemWidth);
    const itemHeight = avatarSize + usernameHeight + spacing + padding;
    
    width = cols * itemWidth + padding;
    height = rows * itemHeight + padding;

    contributors.forEach((contributor, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = col * itemWidth + padding;
      const y = row * itemHeight + padding;
      
      const maxUsernameLength = 8;
      const displayName = contributor.login.length > maxUsernameLength 
        ? contributor.login.substring(0, maxUsernameLength) + '...'
        : contributor.login;

      // Create avatar element - use base64 if available, otherwise fallback to pattern
      let avatarElement;
      if (contributor.avatar_base64) {
        avatarElement = `
          <image href="${contributor.avatar_base64}" x="${x}" y="${y}" width="${avatarSize}" height="${avatarSize}" clip-path="url(#clip${index})" class="avatar-image"/>
        `;
      } else {
        // Fallback to colored circle with initial
        avatarElement = `
          <circle cx="${x + avatarSize/2}" cy="${y + avatarSize/2}" r="${avatarSize/2}" fill="${contributor.fallback.color}" class="avatar-fallback"/>
          <text x="${x + avatarSize/2}" y="${y + avatarSize/2 + 5}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="bold" fill="${colors.fallbackText}" class="avatar-initial">${contributor.fallback.initial}</text>
        `;
      }

      contributorElements += `
        <g class="contributor" data-username="${contributor.login}">
          <a href="${contributor.html_url}" target="_blank">
            <circle cx="${x + avatarSize/2}" cy="${y + avatarSize/2}" r="${avatarSize/2 + 2}" fill="${colors.border}" class="avatar-border"/>
            <circle cx="${x + avatarSize/2}" cy="${y + avatarSize/2}" r="${avatarSize/2}" fill="transparent" class="avatar-hover"/>
            ${avatarElement}
            <text x="${x + avatarSize/2}" y="${y + avatarSize + spacing + 12}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" fill="${colors.text}" class="username">${displayName}</text>
          </a>
        </g>
      `;
    });
  } else {
    // Horizontal layout
    const itemWidth = Math.max(avatarSize + padding, minItemWidth);
    width = contributors.length * itemWidth + padding;
    height = avatarSize + usernameHeight + spacing + padding * 2;

    contributors.forEach((contributor, index) => {
      const x = index * itemWidth + padding;
      const y = padding;
      
      const maxUsernameLength = 8;
      const displayName = contributor.login.length > maxUsernameLength 
        ? contributor.login.substring(0, maxUsernameLength) + '...'
        : contributor.login;

      let avatarElement;
      if (contributor.avatar_base64) {
        avatarElement = `
          <image href="${contributor.avatar_base64}" x="${x}" y="${y}" width="${avatarSize}" height="${avatarSize}" clip-path="url(#clip${index})" class="avatar-image"/>
        `;
      } else {
        avatarElement = `
          <circle cx="${x + avatarSize/2}" cy="${y + avatarSize/2}" r="${avatarSize/2}" fill="${contributor.fallback.color}" class="avatar-fallback"/>
          <text x="${x + avatarSize/2}" y="${y + avatarSize/2 + 5}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="18" font-weight="bold" fill="${colors.fallbackText}" class="avatar-initial">${contributor.fallback.initial}</text>
        `;
      }

      contributorElements += `
        <g class="contributor" data-username="${contributor.login}">
          <a href="${contributor.html_url}" target="_blank">
            <circle cx="${x + avatarSize/2}" cy="${y + avatarSize/2}" r="${avatarSize/2 + 2}" fill="${colors.border}" class="avatar-border"/>
            <circle cx="${x + avatarSize/2}" cy="${y + avatarSize/2}" r="${avatarSize/2}" fill="transparent" class="avatar-hover"/>
            ${avatarElement}
            <text x="${x + avatarSize/2}" y="${y + avatarSize + spacing + 12}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" fill="${colors.text}" class="username">${displayName}</text>
          </a>
        </g>
      `;
    });
  }

  // Generate clip paths for circular avatars
  const clipPaths = contributors.map((contributor, index) => `
    <clipPath id="clip${index}">
      <circle cx="${avatarSize/2}" cy="${avatarSize/2}" r="${avatarSize/2}"/>
    </clipPath>
  `).join('');

  defs = `
    ${clipPaths}
    <filter id="shadow">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="${colors.shadow}"/>
    </filter>
    <filter id="avatarShadow">
      <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="${colors.shadow}"/>
    </filter>
  `;

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <defs>
        ${defs}
      </defs>
      <style>
        <![CDATA[
        .contributor {
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .contributor:hover .avatar-hover {
          fill: ${colors.hover};
        }
        .contributor:hover .username {
          fill: #0366d6;
          font-weight: 600;
        }
        .contributor:hover .avatar-border {
          stroke: #0366d6;
          stroke-width: 2;
        }
        .contributor:hover .avatar-image {
          filter: url(#avatarShadow);
        }
        .contributor:hover .avatar-fallback {
          filter: url(#avatarShadow);
        }
        .avatar-image {
          transition: filter 0.2s ease;
        }
        .avatar-fallback {
          transition: filter 0.2s ease;
        }
        .avatar-border {
          transition: all 0.2s ease;
        }
        .username {
          pointer-events: none;
          user-select: none;
          transition: all 0.2s ease;
        }
        .avatar-initial {
          pointer-events: none;
          user-select: none;
        }
        ]]>
      </style>
      <rect width="${width}" height="${height}" fill="${colors.bg}" stroke="${colors.border}" stroke-width="1" rx="8" filter="url(#shadow)"/>
      ${contributorElements}
    </svg>
  `;
}

// Main badge endpoint
app.get('/badge', async (req, res) => {
  const { repo, limit = 10, style = 'horizontal', theme = 'light', avatars = 'true' } = req.query;

  if (!repo) {
    return res.status(400).json({ error: 'Repository parameter is required' });
  }

  if (!repo.includes('/') || repo.split('/').length !== 2) {
    return res.status(400).json({ error: 'Repository must be in format "username/repo-name"' });
  }

  if (!['horizontal', 'grid'].includes(style)) {
    return res.status(400).json({ error: 'Style must be "horizontal" or "grid"' });
  }

  if (!['light', 'dark'].includes(theme)) {
    return res.status(400).json({ error: 'Theme must be "light" or "dark"' });
  }

  try {
    let contributors;
    let finalStyle = style;
    const includeAvatars = avatars !== 'false';
    
    if (limit === 'all') {
      contributors = await getAllContributors(repo, includeAvatars);
      
      if (contributors.length > 20 && style === 'horizontal') {
        finalStyle = 'grid';
      }
    } else {
      const limitNum = parseInt(limit);
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        return res.status(400).json({ error: 'Limit must be between 1 and 100, or "all"' });
      }
      
      contributors = await getContributors(repo, limitNum, includeAvatars);
    }

    if (contributors.length === 0) {
      return res.status(404).json({ error: 'No contributors found' });
    }

    const svgBadge = generateSVGBadge(contributors, finalStyle, theme);
    
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(svgBadge);
  } catch (error) {
    console.error('Error generating badge:', error);
    
    if (error.message === 'Repository not found') {
      return res.status(404).json({ error: 'Repository not found' });
    } else if (error.message === 'API rate limit exceeded') {
      return res.status(429).json({ error: 'API rate limit exceeded. Please try again later.' });
    } else if (error.message === 'Authentication failed') {
      return res.status(401).json({ error: 'GitHub authentication failed' });
    } else {
      return res.status(500).json({ error: 'Failed to generate badge' });
    }
  }
});

// Dedicated endpoint for all contributors
app.get('/badge/all', async (req, res) => {
  const { repo, style = 'grid', theme = 'light', avatars = 'true' } = req.query;

  if (!repo) {
    return res.status(400).json({ error: 'Repository parameter is required' });
  }

  if (!repo.includes('/') || repo.split('/').length !== 2) {
    return res.status(400).json({ error: 'Repository must be in format "username/repo-name"' });
  }

  try {
    console.log(`Fetching ALL contributors for ${repo} - this may take a while...`);
    
    const includeAvatars = avatars !== 'false';
    const contributors = await getAllContributors(repo, includeAvatars);
    
    if (contributors.length === 0) {
      return res.status(404).json({ error: 'No contributors found' });
    }

    console.log(`Found ${contributors.length} contributors for ${repo}`);

    const finalStyle = contributors.length > 20 ? 'grid' : style;
    const svgBadge = generateSVGBadge(contributors, finalStyle, theme);
    
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(svgBadge);
  } catch (error) {
    console.error('Error generating all contributors badge:', error);
    
    if (error.message === 'Repository not found') {
      return res.status(404).json({ error: 'Repository not found' });
    } else if (error.message === 'API rate limit exceeded') {
      return res.status(429).json({ error: 'API rate limit exceeded. Consider using a GitHub token.' });
    } else {
      return res.status(500).json({ error: 'Failed to generate badge with all contributors' });
    }
  }
});

// Fast endpoint (no avatar loading)
app.get('/badge/fast', async (req, res) => {
  const { repo, limit = 10, style = 'horizontal', theme = 'light' } = req.query;

  if (!repo) {
    return res.status(400).json({ error: 'Repository parameter is required' });
  }

  if (!repo.includes('/') || repo.split('/').length !== 2) {
    return res.status(400).json({ error: 'Repository must be in format "username/repo-name"' });
  }

  try {
    let contributors;
    let finalStyle = style;
    
    if (limit === 'all') {
      contributors = await getAllContributors(repo, false); // No avatars for speed
      
      if (contributors.length > 20 && style === 'horizontal') {
        finalStyle = 'grid';
      }
    } else {
      const limitNum = parseInt(limit);
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        return res.status(400).json({ error: 'Limit must be between 1 and 100, or "all"' });
      }
      
      contributors = await getContributors(repo, limitNum, false); // No avatars for speed
    }

    if (contributors.length === 0) {
      return res.status(404).json({ error: 'No contributors found' });
    }

    const svgBadge = generateSVGBadge(contributors, finalStyle, theme);
    
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(svgBadge);
  } catch (error) {
    console.error('Error generating fast badge:', error);
    
    if (error.message === 'Repository not found') {
      return res.status(404).json({ error: 'Repository not found' });
    } else if (error.message === 'API rate limit exceeded') {
      return res.status(429).json({ error: 'API rate limit exceeded. Please try again later.' });
    } else {
      return res.status(500).json({ error: 'Failed to generate badge' });
    }
  }
});

// Stats endpoint
app.get('/stats', async (req, res) => {
  const { repo } = req.query;

  if (!repo) {
    return res.status(400).json({ error: 'Repository parameter is required' });
  }

  if (!repo.includes('/') || repo.split('/').length !== 2) {
    return res.status(400).json({ error: 'Repository must be in format "username/repo-name"' });
  }

  try {
    const contributors = await getAllContributors(repo, false); // No avatars for stats
    
    const stats = {
      repository: repo,
      total_contributors: contributors.length,
      total_contributions: contributors.reduce((sum, c) => sum + c.contributions, 0),
      top_contributors: contributors.slice(0, 10).map(c => ({
        username: c.login,
        contributions: c.contributions,
        avatar_url: c.avatar_url,
        profile_url: c.html_url
      })),
      last_updated: new Date().toISOString()
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching stats:', error);
    
    if (error.message === 'Repository not found') {
      return res.status(404).json({ error: 'Repository not found' });
    } else if (error.message === 'API rate limit exceeded') {
      return res.status(429).json({ error: 'API rate limit exceeded' });
    } else {
      return res.status(500).json({ error: 'Failed to fetch repository stats' });
    }
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    cache_size: cache.size,
    github_token: !!GITHUB_TOKEN,
    version: '2.0.0'
  });
});

// Clear cache endpoint
app.post('/clear-cache', (req, res) => {
  const originalSize = cache.size;
  cache.clear();
  res.json({ 
    message: 'Cache cleared successfully',
    cleared_entries: originalSize,
    timestamp: new Date().toISOString()
  });
});

// Repository info endpoint
app.get('/repo-info', async (req, res) => {
  const { repo } = req.query;

  if (!repo) {
    return res.status(400).json({ error: 'Repository parameter is required' });
  }

  try {
    const headers = {
      'User-Agent': 'GitHub-Contributors-Badge-Service',
      'Accept': 'application/vnd.github.v3+json'
    };

    if (GITHUB_TOKEN) {
      headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    }

    const response = await axios.get(`${GITHUB_API_BASE}/repos/${repo}`, {
      headers,
      timeout: 5000
    });

    const repoInfo = {
      name: response.data.name,
      full_name: response.data.full_name,
      description: response.data.description,
      stars: response.data.stargazers_count,
      forks: response.data.forks_count,
      language: response.data.language,
      created_at: response.data.created_at,
      updated_at: response.data.updated_at,
      html_url: response.data.html_url
    };

    res.json(repoInfo);
  } catch (error) {
    console.error('Error fetching repo info:', error);
    
    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'Repository not found' });
    } else {
      return res.status(500).json({ error: 'Failed to fetch repository information' });
    }
  }
});

// Documentation endpoint
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>GitHub Contributors Badge Service</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            max-width: 900px; 
            margin: 0 auto; 
            padding: 20px; 
            line-height: 1.6;
            color: #24292e;
          }
          .hero {
            text-align: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 20px;
            border-radius: 12px;
            margin-bottom: 30px;
          }
          .example { 
            background: #f6f8fa; 
            padding: 15px; 
            border-radius: 6px; 
            margin: 15px 0; 
            border: 1px solid #e1e4e8;
          }
          code { 
            background: #f3f4f6; 
            padding: 2px 6px; 
            border-radius: 3px; 
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.9em;
          }
          .badge-demo {
            text-align: center;
            margin: 20px 0;
            padding: 20px;
            background: #fff;
            border: 1px solid #e1e4e8;
            border-radius: 6px;
          }
          .endpoint {
            background: #f8f9fa;
            border-left: 4px solid #28a745;
            padding: 15px;
            margin: 15px 0;
          }
          h1 { color: #0366d6; }
          h2 { color: #586069; border-bottom: 1px solid #e1e4e8; padding-bottom: 8px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e1e4e8; }
          th { background: #f6f8fa; }
          .warning {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            color: #856404;
            padding: 12px;
            border-radius: 6px;
            margin: 15px 0;
          }
          .update-note {
            background: #d4edda;
            border: 1px solid #c3e6cb;
            color: #155724;
            padding: 12px;
            border-radius: 6px;
            margin: 15px 0;
          }
          .new-feature {
            background: #cce5ff;
            border: 1px solid #66b3ff;
            color: #0056b3;
            padding: 12px;
            border-radius: 6px;
            margin: 15px 0;
          }
        </style>
      </head>
      <body>
        <div class="hero">
          <h1>🏆 GitHub Contributors Badge Service</h1>
          <p>Generate beautiful, dynamic contributor badges for any public GitHub repository</p>
        </div>

        <div class="update-note">
          <strong>🚀 Updated v2.0.0:</strong> Complete avatar loading overhaul! Now uses base64 encoding for reliable avatar display, improved caching, and better fallback patterns.
        </div>

        <div class="new-feature">
          <strong>✨ New Features:</strong>
          <ul>
            <li>Base64 avatar encoding for reliable image loading</li>
            <li>Improved fallback patterns with colorful initials</li>
            <li>Better error handling and rate limiting</li>
            <li>Enhanced caching system</li>
            <li>Multiple endpoint options for different use cases</li>
          </ul>
        </div>

        <div class="badge-demo">
          <h3>Live Demo</h3>
          <p>Try it with React repository:</p>
          <img src="/badge?repo=facebook/react&limit=8&style=horizontal&theme=light" alt="React Contributors" style="margin: 10px;"/>
          <br/>
          <img src="/badge?repo=facebook/react&limit=8&style=grid&theme=dark" alt="React Contributors Grid" style="margin: 10px;"/>
        </div>

        <h2>🎯 Quick Start</h2>
        <div class="example">
          <strong>Basic Usage:</strong><br/>
          <code>https://your-service.com/badge?repo=username/repository</code>
        </div>

        <h2>📋 API Endpoints</h2>
        
        <div class="endpoint">
          <h3>GET /badge</h3>
          <p>Generate a contributor badge with customizable options</p>
          <table>
            <tr><th>Parameter</th><th>Type</th><th>Default</th><th>Description</th></tr>
            <tr><td>repo</td><td>string</td><td>required</td><td>Repository in format "owner/repo"</td></tr>
            <tr><td>limit</td><td>number|"all"</td><td>10</td><td>Number of contributors (1-100) or "all"</td></tr>
            <tr><td>style</td><td>string</td><td>"horizontal"</td><td>"horizontal" or "grid"</td></tr>
            <tr><td>theme</td><td>string</td><td>"light"</td><td>"light" or "dark"</td></tr>
            <tr><td>avatars</td><td>string</td><td>"true"</td><td>"true" or "false" to include/exclude avatars</td></tr>
          </table>
        </div>

        <div class="endpoint">
          <h3>GET /badge/all</h3>
          <p>Generate badge with ALL contributors (automatically switches to grid for large repos)</p>
        </div>

        <div class="endpoint">
          <h3>GET /badge/fast</h3>
          <p>Fast badge generation without avatar loading (uses fallback patterns only)</p>
        </div>

        <div class="endpoint">
          <h3>GET /stats</h3>
          <p>Get repository contributor statistics as JSON</p>
        </div>

        <div class="endpoint">
          <h3>GET /repo-info</h3>
          <p>Get basic repository information</p>
        </div>

        <div class="endpoint">
          <h3>GET /health</h3>
          <p>Service health check</p>
        </div>

        <h2>🔧 Examples</h2>
        
        <div class="example">
          <strong>Horizontal Badge (default):</strong><br/>
          <code>https://your-service.com/badge?repo=microsoft/vscode&limit=6</code>
        </div>

        <div class="example">
          <strong>Grid Layout:</strong><br/>
          <code>https://your-service.com/badge?repo=microsoft/vscode&style=grid&limit=9</code>
        </div>

        <div class="example">
          <strong>Dark Theme:</strong><br/>
          <code>https://your-service.com/badge?repo=microsoft/vscode&theme=dark</code>
        </div>

        <div class="example">
          <strong>All Contributors:</strong><br/>
          <code>https://your-service.com/badge/all?repo=microsoft/vscode</code>
        </div>

        <div class="example">
          <strong>Fast Loading (no avatars):</strong><br/>
          <code>https://your-service.com/badge/fast?repo=microsoft/vscode&limit=10</code>
        </div>

        <div class="warning">
          <strong>⚠️ Rate Limiting:</strong> GitHub API has rate limits. For production use, set up a GitHub Personal Access Token via the GITHUB_TOKEN environment variable.
        </div>

        <h2>🚀 Deployment</h2>
        <div class="example">
          <strong>Environment Variables:</strong><br/>
          <code>GITHUB_TOKEN=your_github_token_here</code> (optional but recommended)<br/>
          <code>PORT=3000</code> (optional, defaults to 3000)
        </div>

        <div class="example">
          <strong>Docker:</strong><br/>
          <code>docker build -t github-contributors-badge .</code><br/>
          <code>docker run -p 3000:3000 -e GITHUB_TOKEN=your_token github-contributors-badge</code>
        </div>

        <h2>📊 Response Formats</h2>
        
        <div class="example">
          <strong>Badge endpoints return:</strong> SVG image<br/>
          <strong>Stats endpoint returns:</strong> JSON with contributor statistics<br/>
          <strong>Health endpoint returns:</strong> JSON with service status
        </div>

        <h2>🔒 Security & Performance</h2>
        <ul>
          <li>5-minute caching for contributor data</li>
          <li>Base64 avatar encoding for reliability</li>
          <li>Graceful fallbacks for failed avatar loads</li>
          <li>Rate limit handling with proper error messages</li>
          <li>CORS enabled for web integration</li>
        </ul>

        <footer style="text-align: center; margin-top: 40px; padding: 20px; border-top: 1px solid #e1e4e8; color: #586069;">
          <p>GitHub Contributors Badge Service v2.0.0 | Made with ❤️ for the open source community</p>
        </footer>
      </body>
    </html>
  `;

// Add the documentation endpoint handler
app.get('/', (req, res) => {
  res.send(documentationHTML);
});

// Add webhook endpoint for cache invalidation
app.post('/webhook/invalidate', (req, res) => {
  const { repo } = req.body;
  
  if (!repo) {
    return res.status(400).json({ error: 'Repository parameter is required' });
  }

  // Clear cache entries for this repository
  const keysToDelete = [];
  for (const key of cache.keys()) {
    if (key.startsWith(repo)) {
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach(key => cache.delete(key));

  res.json({ 
    message: 'Cache invalidated successfully',
    repository: repo,
    cleared_entries: keysToDelete.length,
    timestamp: new Date().toISOString()
  });
});

// Add analytics endpoint for tracking popular repositories
const analytics = new Map();

app.get('/analytics/popular', (req, res) => {
  const popularRepos = Array.from(analytics.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([repo, data]) => ({
      repository: repo,
      requests: data.count,
      last_accessed: data.lastAccessed
    }));

  res.json({
    popular_repositories: popularRepos,
    total_unique_repos: analytics.size,
    timestamp: new Date().toISOString()
  });
});

// Middleware to track analytics
function trackAnalytics(req, res, next) {
  const { repo } = req.query;
  
  if (repo && req.path.startsWith('/badge')) {
    if (!analytics.has(repo)) {
      analytics.set(repo, { count: 0, lastAccessed: new Date() });
    }
    
    const data = analytics.get(repo);
    data.count++;
    data.lastAccessed = new Date();
    analytics.set(repo, data);
  }
  
  next();
}

// Apply analytics middleware to badge endpoints
app.use('/badge', trackAnalytics);

// Add batch endpoint for multiple repositories
app.post('/batch', async (req, res) => {
  const { repositories, limit = 5, style = 'horizontal', theme = 'light' } = req.body;

  if (!repositories || !Array.isArray(repositories)) {
    return res.status(400).json({ error: 'repositories array is required' });
  }

  if (repositories.length > 10) {
    return res.status(400).json({ error: 'Maximum 10 repositories allowed per batch request' });
  }

  try {
    const results = await Promise.allSettled(
      repositories.map(async (repo) => {
        const contributors = await getContributors(repo, limit, false); // Fast mode for batch
        return {
          repository: repo,
          contributors: contributors.slice(0, limit),
          badge_url: `/badge?repo=${encodeURIComponent(repo)}&limit=${limit}&style=${style}&theme=${theme}`,
          contributor_count: contributors.length
        };
      })
    );

    const successful = results
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);

    const failed = results
      .filter(result => result.status === 'rejected')
      .map((result, index) => ({
        repository: repositories[index],
        error: result.reason.message
      }));

    res.json({
      successful_repositories: successful,
      failed_repositories: failed,
      total_processed: repositories.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error processing batch request:', error);
    res.status(500).json({ error: 'Failed to process batch request' });
  }
});

// Add custom badge generation with additional metadata
app.get('/badge/custom', async (req, res) => {
  const { 
    repo, 
    limit = 10, 
    style = 'horizontal', 
    theme = 'light',
    title,
    subtitle,
    show_contributions = 'false'
  } = req.query;

  if (!repo) {
    return res.status(400).json({ error: 'Repository parameter is required' });
  }

  try {
    const contributors = await getContributors(repo, parseInt(limit), true);
    
    // Generate custom SVG with title and subtitle
    const customSVG = generateCustomSVGBadge(
      contributors, 
      style, 
      theme, 
      title, 
      subtitle, 
      show_contributions === 'true'
    );
    
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(customSVG);
  } catch (error) {
    console.error('Error generating custom badge:', error);
    res.status(500).json({ error: 'Failed to generate custom badge' });
  }
});

// Function to generate custom SVG badge with additional features
function generateCustomSVGBadge(contributors, style, theme, title, subtitle, showContributions) {
  // This would be an enhanced version of generateSVGBadge with custom title, subtitle, and contribution counts
  const headerHeight = (title || subtitle) ? 60 : 0;
  const contributionHeight = showContributions ? 20 : 0;
  
  // Call the original function and modify the output
  let baseSVG = generateSVGBadge(contributors, style, theme);
  
  // Add custom elements if title or subtitle are provided
  if (title || subtitle) {
    // Insert title and subtitle elements into the SVG
    // This would require parsing and modifying the SVG structure
    // For brevity, this is a simplified version
    baseSVG = baseSVG.replace(
      '<rect width=', 
      `<text x="50%" y="30" text-anchor="middle" font-size="16" font-weight="bold" fill="#24292e">${title || ''}</text>
       <text x="50%" y="50" text-anchor="middle" font-size="12" fill="#586069">${subtitle || ''}</text>
       <rect width=`
    );
  }
  
  return baseSVG;
}

// Add server startup configuration
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 GitHub Contributors Badge Service running on port ${PORT}`);
  console.log(`📖 Documentation available at http://localhost:${PORT}/`);
  console.log(`🔑 GitHub Token: ${GITHUB_TOKEN ? 'Configured' : 'Not configured (rate limited)'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Export the app for testing
module.exports = app;