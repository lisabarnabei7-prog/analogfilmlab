import { getPayPalAccessToken, getPayPalConfig, textResponse } from "./_lib/paypal.mjs";

async function sendEmail(toEmail, subject, text) {
  const apiKey = globalThis.Netlify?.env?.get?.("SENDGRID_API_KEY") ?? process.env.SENDGRID_API_KEY;
  const fromEmail =
    globalThis.Netlify?.env?.get?.("FROM_EMAIL") ??
    globalThis.Netlify?.env?.get?.("LAB_EMAIL") ??
    process.env.FROM_EMAIL ??
    process.env.LAB_EMAIL;

  if (!apiKey || !fromEmail || !toEmail) return;

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: toEmail }] }],
      from: { email: fromEmail, name: "Analog Film Lab" },
      subject,
      content: [{ type: "text/plain", value: text }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("SendGrid error:", errText);
  }
}

async function getOrderDetails(orderId) {
  const { baseUrl, clientId, secret } = getPayPalConfig();
  if (!clientId || !secret) throw new Error("PayPal not configured");

  const accessToken = await getPayPalAccessToken({ baseUrl, clientId, secret });

  const orderRes = await fetch(`${baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!orderRes.ok) {
    const text = await orderRes.text();
    throw new Error(`PayPal get order error: ${text}`);
  }

  return orderRes.json();
}

export default async (req) => {
  if (req.method !== "POST") return textResponse(405, "Method Not Allowed");

  let body;
  try {
    body = await req.json();
  } catch {
    return textResponse(400, "Invalid JSON");
  }

  const eventType = body?.event_type;
  const resource = body?.resource || {};

  // Only send emails once payment has actually been captured.
  if (eventType !== "PAYMENT.CAPTURE.COMPLETED") return textResponse(200, "Ignored other event");

  const orderId = resource?.supplementary_data?.related_ids?.order_id;
  if (!orderId) return textResponse(200, "Missing order_id");

  try {
    const order = await getOrderDetails(orderId);
    const purchaseUnit = Array.isArray(order?.purchase_units) ? order.purchase_units[0] : null;
    const customId = purchaseUnit?.custom_id || "";

    let meta = null;
    try {
      meta = JSON.parse(decodeURIComponent(customId));
    } catch {
      meta = null;
    }

    const customerEmail =
      meta?.email ||
      order?.payer?.email_address ||
      order?.payer?.payer_info?.email; // legacy fallback

    if (!customerEmail) return textResponse(200, "No customer email");

    const name = meta?.name || order?.payer?.name?.given_name || "Customer";

    const summary =
      `Order details:\n\n` +
      (meta?.name ? `Name: ${meta.name}\n` : "") +
      `Email: ${customerEmail}\n` +
      (meta?.film ? `Film type: ${meta.film}\n` : "") +
      (meta?.rolls ? `Number of rolls: ${meta.rolls}\n` : "") +
      (meta?.serviceText ? `Service: ${meta.serviceText}\n` : "") +
      (meta?.amount ? `Total paid: ${meta.amount} EUR\n` : "");

    const labEmail =
      globalThis.Netlify?.env?.get?.("LAB_EMAIL") ?? process.env.LAB_EMAIL ?? null;

    if (labEmail) await sendEmail(labEmail, "New paid film order", summary);

    await sendEmail(
      customerEmail,
      "Your Analog Film Lab order & payment confirmation",
      `Hi ${name},\n\nThank you for your order and payment.\n\n${summary}\nWe will start processing your film and get back to you when your scans are ready.\n\n– Analog Film Lab`
    );

    return textResponse(200, "Webhook handled");
  } catch (err) {
    console.error("paypal-webhook error:", err);
    return textResponse(500, "Server error");
  }
};

