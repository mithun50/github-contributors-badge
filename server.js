// enhanced-server.js - Complete GitHub Contributors Badge Service
const express = require('express');
const axios = require('axios');
const app = express();

// Cache for storing contributor data
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// GitHub API configuration
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Helper function to get limited contributors from GitHub API
async function getContributors(repo, limit = 10) {
  const cacheKey = `${repo}-${limit}`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const headers = {
      'User-Agent': 'GitHub-Contributors-Badge-Service',
      'Accept': 'application/vnd.github.v3+json'
    };

    // Add authorization header if token is available
    if (GITHUB_TOKEN) {
      headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    }

    const response = await axios.get(`${GITHUB_API_BASE}/repos/${repo}/contributors`, {
      params: { per_page: Math.min(limit, 100) }, // GitHub API limit
      headers,
      timeout: 10000 // 10 second timeout
    });

    const contributors = response.data.map(contributor => ({
      login: contributor.login,
      avatar_url: contributor.avatar_url,
      html_url: contributor.html_url,
      contributions: contributor.contributions
    }));

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
async function getAllContributors(repo) {
  const cacheKey = `${repo}-all`;
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
          per_page: 100, // Maximum per page
          page: page
        },
        headers,
        timeout: 10000
      });

      if (response.data.length === 0) {
        hasMore = false;
      } else {
        allContributors.push(...response.data.map(contributor => ({
          login: contributor.login,
          avatar_url: contributor.avatar_url,
          html_url: contributor.html_url,
          contributions: contributor.contributions
        })));
        page++;
      }

      // Safety check to prevent infinite loops (max 10,000 contributors)
      if (page > 100) {
        break;
      }

      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    cache.set(cacheKey, {
      data: allContributors,
      timestamp: Date.now()
    });

    return allContributors;
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

// Helper function to generate SVG badge with improved styling
function generateSVGBadge(contributors, style = 'horizontal', theme = 'light') {
  const avatarSize = 32;
  const padding = 8;
  const usernameHeight = 16;
  const spacing = 4;
  
  // Theme colors
  const themes = {
    light: {
      bg: '#ffffff',
      border: '#e1e4e8',
      text: '#586069',
      shadow: 'rgba(0,0,0,0.1)'
    },
    dark: {
      bg: '#2d333b',
      border: '#444c56',
      text: '#adbac7',
      shadow: 'rgba(0,0,0,0.3)'
    }
  };
  
  const colors = themes[theme] || themes.light;
  
  let width, height;
  let contributorElements = '';

  if (style === 'grid') {
    const cols = Math.ceil(Math.sqrt(contributors.length));
    const rows = Math.ceil(contributors.length / cols);
    width = cols * (avatarSize + padding) + padding;
    height = rows * (avatarSize + usernameHeight + spacing + padding) + padding;

    contributors.forEach((contributor, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = col * (avatarSize + padding) + padding;
      const y = row * (avatarSize + usernameHeight + spacing + padding) + padding;

      contributorElements += `
        <g class="contributor" style="cursor: pointer;">
          <a href="${contributor.html_url}" target="_blank">
            <circle cx="${x + avatarSize/2}" cy="${y + avatarSize/2}" r="${avatarSize/2}" fill="url(#avatar${index})" stroke="${colors.border}" stroke-width="1"/>
            <circle cx="${x + avatarSize/2}" cy="${y + avatarSize/2}" r="${avatarSize/2}" fill="transparent" class="avatar-hover"/>
            <text x="${x + avatarSize/2}" y="${y + avatarSize + spacing + 12}" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="${colors.text}" class="username">${contributor.login}</text>
          </a>
        </g>
      `;
    });
  } else {
    // Horizontal layout
    width = contributors.length * (avatarSize + padding) + padding;
    height = avatarSize + usernameHeight + spacing + padding * 2;

    contributors.forEach((contributor, index) => {
      const x = index * (avatarSize + padding) + padding;
      const y = padding;

      contributorElements += `
        <g class="contributor" style="cursor: pointer;">
          <a href="${contributor.html_url}" target="_blank">
            <circle cx="${x + avatarSize/2}" cy="${y + avatarSize/2}" r="${avatarSize/2}" fill="url(#avatar${index})" stroke="${colors.border}" stroke-width="1"/>
            <circle cx="${x + avatarSize/2}" cy="${y + avatarSize/2}" r="${avatarSize/2}" fill="transparent" class="avatar-hover"/>
            <text x="${x + avatarSize/2}" y="${y + avatarSize + spacing + 12}" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="${colors.text}" class="username">${contributor.login}</text>
          </a>
        </g>
      `;
    });
  }

  // Generate avatar patterns
  const avatarPatterns = contributors.map((contributor, index) => `
    <pattern id="avatar${index}" patternUnits="objectBoundingBox" width="1" height="1">
      <image href="${contributor.avatar_url}" width="${avatarSize}" height="${avatarSize}" preserveAspectRatio="xMidYMid slice"/>
    </pattern>
  `).join('');

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        ${avatarPatterns}
        <filter id="shadow">
          <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="${colors.shadow}"/>
        </filter>
      </defs>
      <style>
        .contributor:hover .avatar-hover {
          fill: rgba(0,0,0,0.1);
        }
        .contributor .username {
          transition: fill 0.2s ease;
        }
        .contributor:hover .username {
          fill: #0366d6;
        }
      </style>
      <rect width="${width}" height="${height}" fill="${colors.bg}" stroke="${colors.border}" stroke-width="1" rx="6" filter="url(#shadow)"/>
      ${contributorElements}
    </svg>
  `;
}

// Main badge endpoint
app.get('/badge', async (req, res) => {
  const { repo, limit = 10, style = 'horizontal', theme = 'light' } = req.query;

  if (!repo) {
    return res.status(400).json({ error: 'Repository parameter is required' });
  }

  // Validate repo format
  if (!repo.includes('/') || repo.split('/').length !== 2) {
    return res.status(400).json({ error: 'Repository must be in format "username/repo-name"' });
  }

  // Validate style parameter
  if (!['horizontal', 'grid'].includes(style)) {
    return res.status(400).json({ error: 'Style must be "horizontal" or "grid"' });
  }

  // Validate theme parameter
  if (!['light', 'dark'].includes(theme)) {
    return res.status(400).json({ error: 'Theme must be "light" or "dark"' });
  }

  try {
    let contributors;
    let finalStyle = style;
    
    if (limit === 'all') {
      // Fetch ALL contributors
      contributors = await getAllContributors(repo);
      
      // For large lists, automatically switch to grid layout if horizontal
      if (contributors.length > 20 && style === 'horizontal') {
        finalStyle = 'grid';
      }
    } else {
      // Validate limit parameter
      const limitNum = parseInt(limit);
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        return res.status(400).json({ error: 'Limit must be between 1 and 100, or "all"' });
      }
      
      contributors = await getContributors(repo, limitNum);
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

// Dedicated endpoint for all contributors (with warning)
app.get('/badge/all', async (req, res) => {
  const { repo, style = 'grid', theme = 'light' } = req.query;

  if (!repo) {
    return res.status(400).json({ error: 'Repository parameter is required' });
  }

  if (!repo.includes('/') || repo.split('/').length !== 2) {
    return res.status(400).json({ error: 'Repository must be in format "username/repo-name"' });
  }

  try {
    console.log(`Fetching ALL contributors for ${repo} - this may take a while...`);
    
    const contributors = await getAllContributors(repo);
    
    if (contributors.length === 0) {
      return res.status(404).json({ error: 'No contributors found' });
    }

    console.log(`Found ${contributors.length} contributors for ${repo}`);

    // For very large contributor lists, force grid layout
    const finalStyle = contributors.length > 20 ? 'grid' : style;
    
    const svgBadge = generateSVGBadge(contributors, finalStyle, theme);
    
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600'); // Cache for 1 hour
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
    const contributors = await getAllContributors(repo);
    
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
    version: '1.0.0'
  });
});

// Clear cache endpoint (for development/admin)
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
        </style>
      </head>
      <body>
        <div class="hero">
          <h1>🏆 GitHub Contributors Badge Service</h1>
          <p>Generate beautiful, dynamic contributor badges for any public GitHub repository</p>
        </div>
        
        <div class="badge-demo">
          <h3>🚀 Live Demo</h3>
          <img src="/badge?repo=facebook/react&limit=8&style=horizontal" alt="React Contributors" style="margin: 10px;">
          <br>
          <img src="/badge?repo=microsoft/vscode&limit=9&style=grid" alt="VSCode Contributors" style="margin: 10px;">
        </div>
        
        <h2>📋 API Endpoints</h2>
        
        <div class="endpoint">
          <h3>GET /badge</h3>
          <p>Generate a contributor badge for a repository</p>
          <code>/badge?repo=username/repo-name&limit=10&style=horizontal&theme=light</code>
        </div>
        
        <div class="endpoint">
          <h3>GET /badge/all</h3>
          <p>Generate a badge with ALL contributors (use with caution)</p>
          <code>/badge/all?repo=username/repo-name&style=grid&theme=light</code>
        </div>
        
        <div class="endpoint">
          <h3>GET /stats</h3>
          <p>Get repository contributor statistics</p>
          <code>/stats?repo=username/repo-name</code>
        </div>
        
        <div class="endpoint">
          <h3>GET /repo-info</h3>
          <p>Get basic repository information</p>
          <code>/repo-info?repo=username/repo-name</code>
        </div>
        
        <h2>📊 Parameters</h2>
        <table>
          <tr>
            <th>Parameter</th>
            <th>Required</th>
            <th>Default</th>
            <th>Description</th>
          </tr>
          <tr>
            <td><code>repo</code></td>
            <td>✅</td>
            <td>-</td>
            <td>Repository in format "username/repo-name"</td>
          </tr>
          <tr>
            <td><code>limit</code></td>
            <td>❌</td>
            <td>10</td>
            <td>Number of contributors (1-100) or "all"</td>
          </tr>
          <tr>
            <td><code>style</code></td>
            <td>❌</td>
            <td>horizontal</td>
            <td>Layout: "horizontal" or "grid"</td>
          </tr>
          <tr>
            <td><code>theme</code></td>
            <td>❌</td>
            <td>light</td>
            <td>Theme: "light" or "dark"</td>
          </tr>
        </table>
        
        <h2>💡 Usage Examples</h2>
        <div class="example">
          <p><strong>Basic horizontal badge:</strong></p>
          <code>/badge?repo=facebook/react</code><br><br>
          
          <p><strong>Grid layout with specific limit:</strong></p>
          <code>/badge?repo=facebook/react&limit=12&style=grid</code><br><br>
          
          <p><strong>Dark theme:</strong></p>
          <code>/badge?repo=facebook/react&theme=dark&limit=8</code><br><br>
          
          <p><strong>All contributors (large projects):</strong></p>
          <code>/badge?repo=facebook/react&limit=all&style=grid</code>
        </div>
        
        <div class="warning">
          <strong>⚠️ Warning:</strong> Using <code>limit=all</code> or <code>/badge/all</code> endpoint with large repositories 
          (1000+ contributors) may result in very large badges and slower response times.
        </div>
        
        <h2>🔧 Embedding in README</h2>
        <div class="example">
          <p><strong>Markdown:</strong></p>
          <code>![Contributors](https://your-service.vercel.app/badge?repo=username/repo-name)</code><br><br>
          
          <p><strong>HTML:</strong></p>
          <code>&lt;img src="https://your-service.vercel.app/badge?repo=username/repo-name" alt="Contributors"&gt;</code>
        </div>
        
        <h2>📊 Service Status</h2>
        <p>
          <strong>Cache Size:</strong> ${cache.size} entries<br>
          <strong>GitHub Token:</strong> ${GITHUB_TOKEN ? '✅ Configured' : '❌ Not configured'}<br>
          <strong>Version:</strong> 1.0.0
        </p>
        
        <footer style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e1e4e8; color: #586069;">
          <p>Built with ❤️ for the open source community | <a href="/health">Health Check</a></p>
        </footer>
      </body>
    </html>
  `);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    available_endpoints: [
      'GET /badge',
      'GET /badge/all',
      'GET /stats',
      'GET /repo-info',
      'GET /health',
      'POST /clear-cache'
    ],
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 GitHub Contributors Badge Service running on port ${PORT}`);
  console.log(`📡 GitHub token: ${GITHUB_TOKEN ? '✅ Configured' : '❌ Not configured (using anonymous requests)'}`);
  console.log(`🌐 Visit http://localhost:${PORT} for documentation`);
});

module.exports = app;