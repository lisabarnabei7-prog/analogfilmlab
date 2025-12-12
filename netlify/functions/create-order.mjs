import { getPayPalAccessToken, getPayPalConfig, getRequestBaseUrl, jsonResponse, textResponse } from "./_lib/paypal.mjs";

export default async (req) => {
  if (req.method !== "POST") return textResponse(405, "Method Not Allowed");

  let body;
  try {
    body = await req.json();
  } catch {
    return textResponse(400, "Invalid JSON");
  }

  const { name, email, film, rolls, serviceText, amount } = body || {};

  if (!name || !email || !amount) return textResponse(400, "Missing required fields");

  const parsedAmount = Number.parseFloat(String(amount));
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return textResponse(400, "Invalid amount");
  }

  const { baseUrl, clientId, secret } = getPayPalConfig();
  if (!clientId || !secret) return textResponse(500, "PayPal not configured");

  try {
    const accessToken = await getPayPalAccessToken({ baseUrl, clientId, secret });

    const metaObj = { name, email, film, rolls, serviceText, amount: parsedAmount.toFixed(2) };
    const candidate = encodeURIComponent(JSON.stringify(metaObj));
    const customId = candidate.length <= 127 ? candidate : encodeURIComponent(String(email)).slice(0, 127);

    const baseSiteUrl = getRequestBaseUrl(req);
    const returnUrl = `${baseSiteUrl}/payment-success.html`;
    const cancelUrl = `${baseSiteUrl}/payment-cancel.html`;

    const orderRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: { currency_code: "EUR", value: parsedAmount.toFixed(2) },
            custom_id: customId,
          },
        ],
        application_context: {
          brand_name: "Analog Film Lab",
          landing_page: "NO_PREFERENCE",
          user_action: "PAY_NOW",
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      }),
    });

    const orderData = await orderRes.json().catch(() => ({}));
    if (!orderRes.ok) return textResponse(500, "Failed to create PayPal order");

    const approveLink = (orderData.links || []).find((l) => l.rel === "approve");
    if (!approveLink?.href) return textResponse(500, "No PayPal approval link found");

    return jsonResponse(200, { approveUrl: approveLink.href, orderId: orderData.id });
  } catch (err) {
    console.error("create-order error:", err);
    return textResponse(500, "Server error");
  }
};

