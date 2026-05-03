module.exports = {
  apps: [
    {
      name: "envmat-backend",
      cwd: "./backend",
      script: "./venv/Scripts/python.exe",
      args: "main.py",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "envmat-frontend",
      script: "serve",
      env: {
        PM2_SERVE_PATH: './frontend/dist',
        PM2_SERVE_PORT: 8380,
        PM2_SERVE_SPA: 'true',
        PM2_SERVE_HOMEPAGE: '/index.html',
        NODE_ENV: "production"
      }
    }
  ]
};
