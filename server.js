const http = require("http");
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const PORT = process.env.PORT || 3000;
const rootDir = __dirname;
const dataFile = path.join(rootDir, "submissions.json");
const dbFile = process.env.DB_PATH || path.join(rootDir, "submissions.db");
const ADMIN_KEY =
  process.env.ADMIN_KEY || (process.env.NODE_ENV === "production" ? "" : "admin123");

fs.mkdirSync(path.dirname(dbFile), { recursive: true });

const db = new sqlite3.Database(dbFile);

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    });
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentTypes = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
  };

  const contentType = contentTypes[extension] || "application/octet-stream";
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, { "Content-Type": contentType });
    response.end(data);
  });
}

function parseAdminKey(request) {
  const headerKey = request.headers["x-admin-key"];
  if (headerKey) {
    return String(headerKey);
  }

  const urlObject = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  return String(urlObject.searchParams.get("key") || "");
}

function isAdminAuthorized(request) {
  if (!ADMIN_KEY) {
    return false;
  }

  return parseAdminKey(request) === ADMIN_KEY;
}

function readSubmissions() {
  if (!fs.existsSync(dataFile)) {
    return [];
  }

  try {
    const contents = fs.readFileSync(dataFile, "utf8");
    return JSON.parse(contents || "[]");
  } catch {
    return [];
  }
}

async function initializeDatabase() {
  await runQuery(`
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      submittedAt TEXT NOT NULL
    )
  `);

  const countRows = await allQuery("SELECT COUNT(*) AS total FROM submissions");
  const total = Number(countRows[0]?.total || 0);

  if (total > 0) {
    return;
  }

  const legacySubmissions = readSubmissions();
  for (const item of legacySubmissions) {
    const name = String(item.name || "").trim();
    const email = String(item.email || "").trim();
    const message = String(item.message || "").trim();
    const submittedAt = String(item.submittedAt || new Date().toISOString());

    if (!name || !email || !message) {
      continue;
    }

    await runQuery(
      "INSERT INTO submissions (name, email, message, submittedAt) VALUES (?, ?, ?, ?)",
      [name, email, message, submittedAt]
    );
  }
}

const server = http.createServer((request, response) => {
  if (request.method === "POST" && request.url === "/api/submit") {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
    });

    request.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        const name = String(payload.name || "").trim();
        const email = String(payload.email || "").trim();
        const message = String(payload.message || "").trim();

        if (!name || !email || !message) {
          sendJson(response, 400, { error: "All fields are required." });
          return;
        }

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(email)) {
          sendJson(response, 400, { error: "Please enter a valid email address." });
          return;
        }

        runQuery(
          "INSERT INTO submissions (name, email, message, submittedAt) VALUES (?, ?, ?, ?)",
          [name, email, message, new Date().toISOString()]
        )
          .then(() => {
            sendJson(response, 200, { message: "Form Submitted Successfully" });
          })
          .catch(() => {
            sendJson(response, 500, { error: "Unable to save submission right now." });
          });
      } catch {
        sendJson(response, 400, { error: "Invalid request payload." });
      }
    });

    return;
  }

  if (request.method === "GET" && request.url.startsWith("/api/admin/submissions")) {
    if (!isAdminAuthorized(request)) {
      sendJson(response, 401, { error: "Unauthorized" });
      return;
    }

    allQuery(
      "SELECT id, name, email, message, submittedAt FROM submissions ORDER BY datetime(submittedAt) DESC"
    )
      .then((rows) => {
        sendJson(response, 200, { submissions: rows });
      })
      .catch(() => {
        sendJson(response, 500, { error: "Unable to fetch submissions right now." });
      });
    return;
  }

  if (request.method === "DELETE" && request.url.startsWith("/api/admin/submissions/")) {
    if (!isAdminAuthorized(request)) {
      sendJson(response, 401, { error: "Unauthorized" });
      return;
    }

    const urlObject = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    const id = Number(urlObject.pathname.split("/").pop());

    if (!Number.isInteger(id) || id <= 0) {
      sendJson(response, 400, { error: "Invalid submission id." });
      return;
    }

    runQuery("DELETE FROM submissions WHERE id = ?", [id])
      .then((result) => {
        if (result.changes === 0) {
          sendJson(response, 404, { error: "Submission not found." });
          return;
        }

        sendJson(response, 200, { message: "Submission deleted." });
      })
      .catch(() => {
        sendJson(response, 500, { error: "Unable to delete submission right now." });
      });
    return;
  }

  const route = request.url === "/" ? "/index.html" : request.url;
  const filePath = path.join(rootDir, route);

  if (!filePath.startsWith(rootDir)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  sendFile(response, filePath);
});

initializeDatabase()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`She Can Foundation app running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database:", error);
    process.exit(1);
  });