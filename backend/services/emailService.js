const nodemailer = require("nodemailer");

let transporter;

function isEmailConfigured() {
  return (
    process.env.EMAIL_HOST &&
    process.env.EMAIL_PORT &&
    process.env.EMAIL_USER &&
    process.env.EMAIL_PASS &&
    process.env.EMAIL_FROM
  );
}

function getTransporter() {
  if (!isEmailConfigured()) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT),
      secure: process.env.EMAIL_SECURE === "true",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }

  return transporter;
}

class EmailService {
  async sendRegistrationConfirmation(userEmail, userData) {
    const client = getTransporter();
    if (!client) {
      return { success: false, error: "Email service not configured" };
    }

    try {
      const info = await client.sendMail({
        from: process.env.EMAIL_FROM,
        to: userEmail,
        subject: "Välkommen till Nylöse SportCenter",
        html: this.getRegistrationEmailTemplate(userData),
      });

      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error("Error sending registration email:", error);
      return { success: false, error: error.message };
    }
  }

  getRegistrationEmailTemplate(userData) {
    const appUrl =
      process.env.PUBLIC_APP_URL ||
      process.env.FRONTEND_URL ||
      "http://localhost:3001";

    return `
      <!DOCTYPE html>
      <html lang="sv">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Välkommen till Nylöse SportCenter</title>
      </head>
      <body style="margin:0;padding:0;background:#f4f1ea;font-family:Arial,sans-serif;color:#14202b;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ea;padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:20px;overflow:hidden;">
                <tr>
                  <td style="background:#102a43;color:#ffffff;padding:32px 28px;text-align:center;">
                    <p style="margin:0 0 8px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#f4ed15;">Nylöse SportCenter</p>
                    <h1 style="margin:0;font-size:30px;line-height:1.1;">Din anmälan är registrerad</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px 28px;">
                    <p style="margin:0 0 16px;font-size:18px;">Hej ${this.escapeHtml(userData.first_name)}!</p>
                    <p style="margin:0 0 16px;">Vad roligt att du vill börja träna med oss. Vi har tagit emot din registrering och ser fram emot att välkomna dig till klubben.</p>
                    <p style="margin:0 0 16px;">Din medlemsperiod är förberedd från <strong>${this.escapeHtml(userData.membership_start)}</strong> till <strong>${this.escapeHtml(userData.membership_end)}</strong>.</p>
                    <p style="margin:0 0 24px;">Om vi behöver något mer kontaktar vi dig direkt. Annars är nästa steg bara att dyka upp och komma igång.</p>
                    <p style="margin:0 0 24px;text-align:center;">
                      <a href="${appUrl}" style="display:inline-block;background:#f05a28;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:700;">Besök hemsidan</a>
                    </p>
                    <p style="margin:0;color:#5c6670;font-size:14px;">Tack för förtroendet och varmt välkommen till Nylöse SportCenter.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
}

module.exports = new EmailService();
