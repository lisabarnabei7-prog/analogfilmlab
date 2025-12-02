// netlify/functions/create-order.js
// Creates a PayPal order based on data from your HTML form
// and returns the approval URL for the customer to pay.

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const {
      name,
      email,
      address,
      film,
      rolls,
      serviceText,
      amount, // e.g. "24.00"
      notes,
    } = body;

    if (!name || !email || !amount) {
      return { statusCode: 400, body: "Missing required fields" };
    }

    const clientId = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_SECRET;

    if (!clientId || !secret) {
      console.error("Missing PayPal env vars");
      return { statusCode: 500, body: "PayPal not configured" };
    }

    // 1) Get PayPal access token (SANDBOX endpoint - switch to live for production)
    const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");

    const tokenRes = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error("Token error:", text);
      return { statusCode: 500, body: "Failed to get PayPal token" };
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2) Build compact metadata to embed in custom_id (max 127 chars)
    const metaObj = {
      name,
      email,
      film,
      rolls,
      serviceText,
      amount,
    };
    let customId;
    try {
      customId = encodeURIComponent(JSON.stringify(metaObj)).slice(0, 127);
    } catch (e) {
      customId = encodeURIComponent(email).slice(0, 127);
    }

    // 3) Create PayPal order
    const orderRes = await fetch("https://api-m.sandbox.paypal.com/v2/checkout/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "EUR",
              value: amount,
            },
            custom_id: customId,
          },
        ],
        application_context: {
          brand_name: "Analog Film Lab",
          landing_page: "NO_PREFERENCE",
          user_action: "PAY_NOW",
          // You can create simple success/cancel pages later if you want:
          return_url: "https://your-site.netlify.app/payment-success",
          cancel_url: "https://your-site.netlify.app/payment-cancel",
        },
      }),
    });

    const orderData = await orderRes.json();

    if (!orderRes.ok) {
      console.error("Create order error:", orderData);
      return { statusCode: 500, body: "Failed to create PayPal order" };
    }

    const approveLink = (orderData.links || []).find((l) => l.rel === "approve");

    if (!approveLink) {
      console.error("No approve link in order:", orderData);
      return { statusCode: 500, body: "No PayPal approval link found" };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ approveUrl: approveLink.href }),
    };
  } catch (err) {
    console.error("create-order error:", err);
    return { statusCode: 500, body: "Server error" };
  }
};
