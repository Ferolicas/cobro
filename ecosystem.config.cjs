module.exports = {
  apps: [
    {
      name: "cobro",
      cwd: "/var/www/cobro",
      script: "pnpm",
      args: "start",
      instances: 1,
      exec_mode: "fork",
      env: { NODE_ENV: "production", PORT: "4009" },
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: "768M",
    },
  ],
};
