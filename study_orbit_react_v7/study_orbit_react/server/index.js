import express from "express";
import {
  createBackup,
  getState,
  listBackups,
  putState,
  restoreBackup,
} from "./storage.js";

const app = express();
const PORT = Number(process.env.STUDY_ORBIT_API_PORT || 8766);
app.disable("x-powered-by");
app.use(express.json({ limit: "5mb" }));
// Prevent a website opened elsewhere from sending state-changing requests to the local service.
app.use("/api", (req, res, next) => {
  const origin = req.headers.origin;
  if (
    origin &&
    !["http://127.0.0.1:5173", "http://localhost:5173"].includes(origin)
  )
    return res.status(403).json({ error: "Origin not permitted" });
  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
    !req.is("application/json")
  )
    return res.status(415).json({ error: "Expected application/json" });
  next();
});
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/state", async (_req, res) => res.json(await getState()));
app.put("/api/state", async (req, res) => res.json(await putState(req.body)));
app.get("/api/backups", async (_req, res) => res.json(await listBackups()));
app.post("/api/backups", async (req, res) =>
  res.status(201).json(await createBackup(req.body?.timeZone)),
);
app.post("/api/backups/:name/restore", async (req, res) =>
  res.json(await restoreBackup(req.params.name)),
);
app.use((error, _req, res, _next) => {
  const code =
    error.statusCode ||
    error.status ||
    (error instanceof SyntaxError ? 400 : 500);
  console.error("[Study Orbit API]", error.message);
  res.status(code).json({
    error: code >= 500 ? `Server error: ${error.message}` : error.message,
  });
});
app.listen(PORT, "127.0.0.1", () =>
  console.log(`Study Orbit file API listening at http://127.0.0.1:${PORT}`),
);
