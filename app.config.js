const fs = require("fs");
const path = require("path");

// Fallback if env is missing; should match your DigitalOcean app URL (same as in the browser).
const DEFAULT_API_BASE = "https://plankton-app-bjwn2.ondigitalocean.app";

function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  let content;
  try {
    content = fs.readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadDotEnv();

const appJson = require("./app.json");

const apiBaseUrl = String(process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE)
  .trim()
  .replace(/\/+$/, "");
const adminSecret = String(process.env.EXPO_PUBLIC_ADMIN_SECRET || "").trim();

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...(appJson.expo?.extra || {}),
      eas: {
        projectId: "b85e90e0-4895-42e8-8464-0d1126ad2ddd",
      },
      apiBaseUrl,
      adminSecret,
    },
  },
};
