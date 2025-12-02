// netlify/functions/paypal-webhook.js
// Receives PayPal webhook events and sends emails to you and the customer
// when a payment is completed.

async function sendEmail(toEmail, subject, text) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || process.env.LAB_EMAIL;

  if (!apiKey || !fromEmail) {
    console.error("Missing SENDGRID_API_KEY or FROM_EMAIL / LAB_EMAIL");
    return;
  }

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

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const eventType = body.event_type;
    const resource = body.resource || {};

    // Only act on successful payment-related events
    if (
      eventType !== "CHECKOUT.ORDER.APPROVED" &&
      eventType !== "PAYMENT.CAPTURE.COMPLETED"
    ) {
      return { statusCode: 200, body: "Ignored other event" };
    }

    const purchaseUnits =
      resource.purchase_units ||
      (resource.supplementary_data && resource.supplementary_data.related_ids
        ? resource.purchase_units
        : []);

    const purchaseUnit =
      (Array.isArray(purchaseUnits) && purchaseUnits[0]) || {};

    const customId = purchaseUnit.custom_id || "";

    let meta = null;
    try {
      meta = JSON.parse(decodeURIComponent(customId));
    } catch (e) {
      console.error("Could not parse custom_id:", customId);
    }

    if (!meta || !meta.email) {
      console.error("Missing metadata or customer email in metadata");
      return { statusCode: 200, body: "No customer email in metadata" };
    }

    const { name, email, film, rolls, serviceText, amount } = meta;

    const summary =
      `Order details:\n\n` +
      `Name: ${name}\n` +
      `Email: ${email}\n` +
      `Film type: ${film}\n` +
      `Number of rolls: ${rolls}\n` +
      `Service: ${serviceText}\n` +
      `Total paid: ${amount} EUR\n`;

    // 1) Email to lab
    const labEmail = process.env.LAB_EMAIL || email;
    await sendEmail(labEmail, "New paid film order", summary);

    // 2) Confirmation email to customer
    await sendEmail(
      email,
      "Your Analog Film Lab order & payment confirmation",
      `Hi ${name},\n\nThank you for your order and payment.\n\n${summary}\nWe will start processing your film and get back to you when your scans are ready.\n\n– Analog Film Lab`
    );

    return { statusCode: 200, body: "Webhook handled" };
  } catch (err) {
    console.error("Webhook error:", err);
    return { statusCode: 500, body: "Server error" };
  }
};
