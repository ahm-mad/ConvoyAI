// pm2 process definitions for the plain-Node deployment path (Phase 7,
// D-0095) — the fallback for a server without Docker. Each of this app's
// 4 processes (ARCHITECTURE.md §1) runs as its own pm2-managed process:
// auto-restarted on crash, log-rotated, survives a server reboot once
// `pm2 startup` + `pm2 save` are run once (see DEPLOY.md).
//
// CommonJS (`.cjs`), not ESM, deliberately — this is pm2's own config file
// format, loaded by the pm2 CLI itself (not this project's `"type":
// "module"` runtime), and pm2's documented config shape is a plain
// `module.exports`.
module.exports = {
  apps: [
    {
      name: "convoyai-http",
      script: "dist/main.http.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: "production" },
      out_file: "logs/http.out.log",
      error_file: "logs/http.error.log",
    },
    {
      name: "convoyai-worker",
      script: "dist/main.worker.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: "production" },
      out_file: "logs/worker.out.log",
      error_file: "logs/worker.error.log",
    },
    {
      name: "convoyai-mqtt",
      script: "dist/main.mqtt.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: "production" },
      out_file: "logs/mqtt.out.log",
      error_file: "logs/mqtt.error.log",
    },
    {
      name: "convoyai-scheduler",
      script: "dist/main.scheduler.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: "production" },
      out_file: "logs/scheduler.out.log",
      error_file: "logs/scheduler.error.log",
    },
  ],
};
