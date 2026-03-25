/**
 * Run this script to get a Gmail refresh token:
 *   node scripts/get-gmail-token.mjs
 *
 * Prerequisites:
 *   - GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET set in .env
 *   - OAuth client type must be "Desktop app" in Google Cloud Console
 *     (NOT "Web application"). Desktop apps are allowed to use localhost
 *     redirects without registering them.
 */

import "dotenv/config";
import http from "http";
import { google } from "googleapis";

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const PORT = 3456;
const REDIRECT_URI = `http://localhost:${PORT}`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET in .env");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.labels",
    "https://www.googleapis.com/auth/gmail.modify",
  ],
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(`<h2>Error</h2><p>${error}</p>`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(200);
    res.end("Waiting for authorization...");
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
      <h2>Success!</h2>
      <p>You can close this window and go back to the terminal.</p>
    `);

    console.log("\nSuccess! Add this to your .env file:\n");
    console.log(`GMAIL_REFRESH_TOKEN="${tokens.refresh_token}"\n`);

    server.close();
    process.exit(0);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/html" });
    res.end(`<h2>Error</h2><p>${err.message}</p>`);
    console.error("\nError exchanging code:", err.message);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log("\nOpen this URL in your browser:\n");
  console.log(authUrl);
  console.log("\nSign in with the mediainvoices@ account.");
  console.log("Waiting for authorization...\n");
});
