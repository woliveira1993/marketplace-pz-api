module.exports = {
  apps: [
    {
      name: 'marketplace-pz-api',
      script: './dist/app.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
  ],
};
