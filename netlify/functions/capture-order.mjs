import { getPayPalAccessToken, getPayPalConfig, jsonResponse, textResponse } from "./_lib/paypal.mjs";

export default async (req) => {
  if (req.method !== "POST") return textResponse(405, "Method Not Allowed");

  let body;
  try {
    body = await req.json();
  } catch {
    return textResponse(400, "Invalid JSON");
  }

  const orderId = body?.orderId || body?.token;
  if (!orderId || typeof orderId !== "string") return textResponse(400, "Missing orderId");

  const { baseUrl, clientId, secret } = getPayPalConfig();
  if (!clientId || !secret) return textResponse(500, "PayPal not configured");

  try {
    const accessToken = await getPayPalAccessToken({ baseUrl, clientId, secret });

    const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    const captureData = await captureRes.json().catch(() => ({}));

    if (!captureRes.ok) {
      return jsonResponse(500, { ok: false, message: "Failed to capture PayPal order" });
    }

    return jsonResponse(200, { ok: true, capture: captureData });
  } catch (err) {
    console.error("capture-order error:", err);
    return textResponse(500, "Server error");
  }
};

