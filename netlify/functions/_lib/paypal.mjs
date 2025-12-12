function getEnv(key) {
  return globalThis.Netlify?.env?.get?.(key) ?? process.env[key];
}

export function getPayPalConfig() {
  const env = (getEnv("PAYPAL_ENV") || "sandbox").toLowerCase();
  const clientId = getEnv("PAYPAL_CLIENT_ID");
  const secret = getEnv("PAYPAL_SECRET");

  const baseUrl =
    env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

  return { env, clientId, secret, baseUrl };
}

export async function getPayPalAccessToken({ baseUrl, clientId, secret }) {
  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");

  const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`PayPal token error: ${text}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

export function jsonResponse(status, bodyObj) {
  return new Response(JSON.stringify(bodyObj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export function textResponse(status, bodyText) {
  return new Response(bodyText, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export function getRequestBaseUrl(req) {
  const url = new URL(req.url);

  const explicit =
    globalThis.Netlify?.env?.get?.("URL") ??
    globalThis.Netlify?.env?.get?.("DEPLOY_PRIME_URL") ??
    process.env.URL ??
    process.env.DEPLOY_PRIME_URL;

  if (explicit) return explicit.replace(/\/$/, "");

  return `${url.protocol}//${url.host}`;
}

