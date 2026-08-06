import { Hono } from "hono";

const app = new Hono();

// Root health check route
app.get("/", (c) => {
  return c.text("App is running");
});

// Sample JSON API endpoint
app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
    service: "geekykey-backend",
    timestamp: new Date().toISOString(),
  });
});

// Start server on default Deno port (8000)
Deno.serve(app.fetch);
