module.exports = {
  apps: [
    {
      name: "envmat-backend",
      cwd: "./backend",
      script: "python",
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
      cwd: "./frontend",
      script: "npx",
      args: "serve -s dist -l 8380",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
