const DEFAULT_BRAND = {
  name: "Nylöse SportCenter",
  siteUrl: process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || "http://localhost:3001",
  contactEmail: process.env.EMAIL_REPLY_TO || "nylosesportcenter@gmail.com",
  primary: "#0069bb",
  cta: "#e64522",
  badge: "#f4ed15",
  cream: "#f5f5f0",
  dark: "#101820",
  light: "#ffffff",
  muted: "#f7fbff",
  body: "#17324d",
  border: "rgba(16, 24, 32, 0.12)",
};

let invoiceScheduler = null;

function isBrevoConfigured() {
  return Boolean(process.env.BREVO_API_KEY && process.env.EMAIL_FROM);
}

function formatDate(value) {
  if (!value) return "";

  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Europe/Stockholm",
  }).format(new Date(value));
}

function addDays(dateLike, days) {
  const date = new Date(dateLike);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeMultilineText(value) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function createMetaList(items) {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      ${items
        .filter((item) => item && item.value)
        .map(
          (item) => `
            <tr>
              <td style="padding:0 0 10px;vertical-align:top;width:138px;font-size:14px;line-height:1.6;color:#5e6975;">
                ${escapeHtml(item.label)}
              </td>
              <td style="padding:0 0 10px;vertical-align:top;font-size:15px;line-height:1.6;color:${DEFAULT_BRAND.dark};font-weight:600;">
                ${item.value}
              </td>
            </tr>`,
        )
        .join("")}
    </table>
  `;
}

function createEmailShell({ eyebrow, title, intro, sections = [], cta, footnote }) {
  const sectionMarkup = sections
    .map(
      (section) => `
        <tr>
          <td style="padding:0 36px 24px;">
            ${section.heading ? `<h2 style="margin:0 0 10px;font-size:18px;line-height:1.35;color:${DEFAULT_BRAND.dark};">${section.heading}</h2>` : ""}
            ${section.body ? `<div style="font-size:15px;line-height:1.75;color:${DEFAULT_BRAND.body};">${section.body}</div>` : ""}
          </td>
        </tr>`,
    )
    .join("");

  const ctaMarkup = cta
    ? `
      <tr>
        <td style="padding:0 36px 28px;">
          <a href="${escapeHtml(cta.href)}" style="display:inline-block;background:${DEFAULT_BRAND.cta};color:${DEFAULT_BRAND.light};text-decoration:none;padding:14px 22px;border-radius:999px;font-size:15px;font-weight:700;">${cta.label}</a>
        </td>
      </tr>`
    : "";

  return `
    <!DOCTYPE html>
    <html lang="sv">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapeHtml(title)}</title>
      </head>
      <body style="margin:0;padding:0;background:${DEFAULT_BRAND.cream};font-family:Arial,sans-serif;color:${DEFAULT_BRAND.body};">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${DEFAULT_BRAND.cream};padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:${DEFAULT_BRAND.light};border-radius:18px;overflow:hidden;border:1px solid ${DEFAULT_BRAND.border};">
                <tr>
                  <td style="height:8px;background:${DEFAULT_BRAND.primary};font-size:0;line-height:0;">&nbsp;</td>
                </tr>
                <tr>
                  <td style="padding:34px 36px 26px;">
                    <p style="display:inline-block;margin:0 0 14px;padding:6px 10px;border-radius:999px;background:${DEFAULT_BRAND.badge};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${DEFAULT_BRAND.dark};font-weight:700;">${escapeHtml(eyebrow)}</p>
                    <h1 style="margin:0 0 14px;font-size:30px;line-height:1.18;color:${DEFAULT_BRAND.dark};">${escapeHtml(title)}</h1>
                    <p style="margin:0;font-size:16px;line-height:1.75;color:${DEFAULT_BRAND.body};">${intro}</p>
                  </td>
                </tr>
                ${sectionMarkup}
                ${ctaMarkup}
                <tr>
                  <td style="padding:0 36px 36px;border-top:1px solid #edf1f4;">
                    <div style="padding-top:18px;font-size:13px;line-height:1.7;color:#6a7380;">
                      ${footnote}
                    </div>
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

function createPaymentDetailsMarkup() {
  const details = [
    process.env.PAYMENT_SWISH ? `<p style="margin:0 0 6px;"><strong>Swish:</strong> ${escapeHtml(process.env.PAYMENT_SWISH)}</p>` : "",
    process.env.PAYMENT_BANKGIRO ? `<p style="margin:0 0 6px;"><strong>Bankgiro:</strong> ${escapeHtml(process.env.PAYMENT_BANKGIRO)}</p>` : "",
    process.env.PAYMENT_PLUSGIRO ? `<p style="margin:0 0 6px;"><strong>Plusgiro:</strong> ${escapeHtml(process.env.PAYMENT_PLUSGIRO)}</p>` : "",
    process.env.PAYMENT_ACCOUNT_NAME ? `<p style="margin:0;"><strong>Mottagare:</strong> ${escapeHtml(process.env.PAYMENT_ACCOUNT_NAME)}</p>` : "",
  ].filter(Boolean);

  if (details.length === 0) {
    return "<p style=\"margin:0;\">Betaluppgifter skickas separat av klubben.</p>";
  }

  return details.join("");
}

class EmailService {
  buildContactConfirmationEmail(userEmail, payload) {
    return {
      to: userEmail,
      subject: "Vi har tagit emot ditt meddelande",
      htmlContent: createEmailShell({
        eyebrow: DEFAULT_BRAND.name,
        title: "Tack för ditt meddelande",
        intro: `Hej ${escapeHtml(payload.name)}. Vi har tagit emot ditt meddelande och återkommer så snart vi kan.`,
        sections: [
          {
            heading: "Ditt meddelande",
            body: `<p style="margin:0;">${normalizeMultilineText(payload.message)}</p>`,
          },
        ],
        cta: {
          href: DEFAULT_BRAND.siteUrl,
          label: "Besök hemsidan",
        },
        footnote: `Du kan svara på detta mejl eller skriva till ${escapeHtml(DEFAULT_BRAND.contactEmail)} om du vill lägga till något.`,
      }),
      textContent: `Hej ${payload.name}, vi har tagit emot ditt meddelande och återkommer så snart vi kan.`,
      replyTo: DEFAULT_BRAND.contactEmail,
    };
  }

  buildContactNotificationEmail(payload) {
    return {
      to: DEFAULT_BRAND.contactEmail,
      subject: `Nytt kontaktmeddelande från ${payload.name}`,
      htmlContent: createEmailShell({
        eyebrow: DEFAULT_BRAND.name,
        title: "Nytt kontaktmeddelande",
        intro: "Ett nytt meddelande har skickats via hemsidan.",
        sections: [
          {
            body: `${createMetaList([
              { label: "Namn", value: escapeHtml(payload.name) },
              { label: "E-post", value: escapeHtml(payload.email) },
            ])}<p style="margin:10px 0 0;">${normalizeMultilineText(payload.message)}</p>`,
          },
        ],
        footnote: "Skickat automatiskt från kontaktformuläret.",
      }),
      textContent: `${payload.name} (${payload.email}) skrev: ${payload.message}`,
      replyTo: payload.email,
    };
  }

  buildAdminSignupAlertEmail(payload) {
    return {
      to: DEFAULT_BRAND.contactEmail,
      subject: `Ny anmälan: ${payload.first_name} ${payload.last_name}`,
      htmlContent: createEmailShell({
        eyebrow: DEFAULT_BRAND.name,
        title: "Ny anmälan",
        intro: "En ny medlem har registrerat sig via hemsidan.",
        sections: [
          {
            body: createMetaList([
              {
                label: "Namn",
                value: `${escapeHtml(payload.first_name)} ${escapeHtml(payload.last_name)}`,
              },
              { label: "E-post", value: escapeHtml(payload.email) },
              { label: "Telefon", value: escapeHtml(payload.phone || "-") },
              { label: "Prova-på till", value: escapeHtml(formatDate(payload.trial_ends_at)) },
            ]),
          },
        ],
        footnote: "Skickat automatiskt efter en ny registrering.",
      }),
      textContent: `Ny registrering: ${payload.first_name} ${payload.last_name}, ${payload.email}, prova-på till ${formatDate(payload.trial_ends_at)}.`,
      replyTo: DEFAULT_BRAND.contactEmail,
    };
  }

  buildAdminInvoiceAlertEmail(payload) {
    return {
      to: DEFAULT_BRAND.contactEmail,
      subject: `Betalinfo skickad: ${payload.first_name} ${payload.last_name || ""}`.trim(),
      htmlContent: createEmailShell({
        eyebrow: DEFAULT_BRAND.name,
        title: "Betaluppgifter skickade",
        intro: "Betaluppgifter har skickats till en medlem.",
        sections: [
          {
            body: createMetaList([
              {
                label: "Mottagare",
                value: `${escapeHtml(payload.first_name)} ${escapeHtml(payload.last_name || "")}`.trim(),
              },
              { label: "E-post", value: escapeHtml(payload.email) },
              { label: "Typ", value: escapeHtml(payload.trigger || "Automatiskt utskick") },
              { label: "Belopp", value: `${escapeHtml(String(payload.amount))} kr` },
            ]),
          },
        ],
        footnote: "Skickat automatiskt när betaluppgifter mejlades ut.",
      }),
      textContent: `Betaluppgifter skickade till ${payload.first_name} ${payload.last_name || ""} (${payload.email}). Typ: ${payload.trigger || "Automatiskt utskick"}.`,
      replyTo: DEFAULT_BRAND.contactEmail,
    };
  }

  buildRegistrationConfirmationEmail(userEmail, userData) {
    const membershipStart = formatDate(userData.membership_start);
    const membershipEnd = formatDate(userData.membership_end);
    const trialEndDate = formatDate(userData.trial_ends_at || addDays(userData.membership_start, 14));

    return {
      to: userEmail,
      subject: "Din anmälan till Nylöse SportCenter är mottagen",
      htmlContent: createEmailShell({
        eyebrow: DEFAULT_BRAND.name,
        title: "Välkommen till klubben",
        intro: `Hej ${escapeHtml(userData.first_name)}. Din anmälan är mottagen och du är varmt välkommen att börja träna med oss.`,
        sections: [
          {
            body: `${createMetaList([
              { label: "Period", value: `${escapeHtml(membershipStart)} till ${escapeHtml(membershipEnd)}` },
              { label: "Prova-på till", value: escapeHtml(trialEndDate) },
            ])}<p style="margin:8px 0 0;">Efter prova-på-perioden skickar vi betaluppgifterna automatiskt. Om du inte vill fortsätta kan du ignorera det mejlet.</p>`,
          },
        ],
        cta: {
          href: DEFAULT_BRAND.siteUrl,
          label: "Se hemsidan",
        },
        footnote: `Frågor? Kontakta oss på ${escapeHtml(DEFAULT_BRAND.contactEmail)}.`,
      }),
      textContent: `Hej ${userData.first_name}! Din anmälan är mottagen. Du har två veckors gratis prova-på till och med ${trialEndDate}. Efter det skickar vi betaluppgifter automatiskt. Om du inte vill fortsätta kan du ignorera det mejlet.`,
      replyTo: DEFAULT_BRAND.contactEmail,
    };
  }

  buildTrialInvoiceEmail(userEmail, invoiceData) {
    const dueDate = formatDate(invoiceData.due_date);

    return {
      to: userEmail,
      subject: "Betaluppgifter för medlemskap",
      htmlContent: createEmailShell({
        eyebrow: DEFAULT_BRAND.name,
        title: "Betaluppgifter för medlemskap",
        intro: `Hej ${escapeHtml(invoiceData.first_name)}. Här kommer betaluppgifterna om du vill fortsätta träna hos oss.`,
        sections: [
          {
            body: createMetaList([
              { label: "Belopp", value: `${escapeHtml(String(invoiceData.amount))} kr` },
              {
                label: "Period",
                value: `${escapeHtml(formatDate(invoiceData.membership_start))} till ${escapeHtml(formatDate(invoiceData.membership_end))}`,
              },
              { label: "Förfallodatum", value: escapeHtml(dueDate) },
            ]),
          },
          {
            heading: "Betalningsuppgifter",
            body: createPaymentDetailsMarkup(),
          },
          {
            heading: "Om du inte vill fortsätta",
            body: "<p style=\"margin:0;\">Om du inte vill fortsätta efter prova-på-perioden behöver du inte göra någonting. Du kan ignorera detta mejl.</p>",
          },
        ],
        footnote: `Ange gärna medlemsnamn${invoiceData.invoice_reference ? ` och referens ${escapeHtml(invoiceData.invoice_reference)}` : ""} vid betalning.`,
      }),
      textContent: `Hej ${invoiceData.first_name}. Din prova-på-period är slut. Om du vill fortsätta träna är medlemsavgiften ${invoiceData.amount} kr med förfallodatum ${dueDate}. Om du inte vill fortsätta kan du ignorera detta mejl.`,
      replyTo: DEFAULT_BRAND.contactEmail,
    };
  }

  buildManualPaymentInfoEmail(userEmail, invoiceData) {
    const dueDate = formatDate(invoiceData.due_date);

    return {
      to: userEmail,
      subject: "Betaluppgifter för medlemskap",
      htmlContent: createEmailShell({
        eyebrow: DEFAULT_BRAND.name,
        title: "Betaluppgifter för medlemskap",
        intro: `Hej ${escapeHtml(invoiceData.first_name)}. Här kommer betaluppgifterna för ditt medlemskap hos oss.`,
        sections: [
          {
            body: createMetaList([
              { label: "Belopp", value: `${escapeHtml(String(invoiceData.amount))} kr` },
              {
                label: "Period",
                value: `${escapeHtml(formatDate(invoiceData.membership_start))} till ${escapeHtml(formatDate(invoiceData.membership_end))}`,
              },
              { label: "Förfallodatum", value: escapeHtml(dueDate) },
            ]),
          },
          {
            heading: "Betalningsuppgifter",
            body: createPaymentDetailsMarkup(),
          },
        ],
        footnote: `Frågor? Kontakta oss på ${escapeHtml(DEFAULT_BRAND.contactEmail)}.`,
      }),
      textContent: `Hej ${invoiceData.first_name}. Här kommer betaluppgifterna för ditt medlemskap. Belopp: ${invoiceData.amount} kr. Förfallodatum: ${dueDate}.`,
      replyTo: DEFAULT_BRAND.contactEmail,
    };
  }

  async sendEmail({ to, subject, htmlContent, textContent, replyTo }) {
    if (!isBrevoConfigured()) {
      return { success: false, skipped: true, error: "Brevo email service not configured" };
    }

    try {
      const response = await fetch(
        process.env.BREVO_API_URL || "https://api.brevo.com/v3/smtp/email",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "api-key": process.env.BREVO_API_KEY,
          },
          body: JSON.stringify({
            sender: {
              email: process.env.EMAIL_FROM,
              name: process.env.EMAIL_FROM_NAME || DEFAULT_BRAND.name,
            },
            to: Array.isArray(to) ? to : [{ email: to }],
            replyTo: replyTo ? { email: replyTo } : undefined,
            subject,
            htmlContent,
            textContent,
          }),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Brevo request failed (${response.status}): ${body}`);
      }

      const data = await response.json();
      return { success: true, messageId: data.messageId || null };
    } catch (error) {
      console.error("Email send failed:", error);
      return { success: false, error: error.message };
    }
  }

  async sendContactConfirmation(userEmail, payload) {
    return this.sendEmail(this.buildContactConfirmationEmail(userEmail, payload));
  }

  async sendContactNotification(payload) {
    if (!DEFAULT_BRAND.contactEmail) {
      return { success: false, skipped: true, error: "No contact email configured" };
    }

    return this.sendEmail(this.buildContactNotificationEmail(payload));
  }

  async sendAdminSignupAlert(payload) {
    if (!DEFAULT_BRAND.contactEmail) {
      return { success: false, skipped: true, error: "No contact email configured" };
    }

    return this.sendEmail(this.buildAdminSignupAlertEmail(payload));
  }

  async sendAdminInvoiceAlert(payload) {
    if (!DEFAULT_BRAND.contactEmail) {
      return { success: false, skipped: true, error: "No contact email configured" };
    }

    return this.sendEmail(this.buildAdminInvoiceAlertEmail(payload));
  }

  async sendRegistrationConfirmation(userEmail, userData) {
    return this.sendEmail(this.buildRegistrationConfirmationEmail(userEmail, userData));
  }

  async sendTrialInvoice(userEmail, invoiceData) {
    return this.sendEmail(this.buildTrialInvoiceEmail(userEmail, invoiceData));
  }

  async sendManualPaymentInfo(userEmail, invoiceData) {
    return this.sendEmail(this.buildManualPaymentInfoEmail(userEmail, invoiceData));
  }

  getPreviewTemplates() {
    const previewData = {
      contact: {
        name: "Sara Andersson",
        email: "sara.andersson@example.com",
        message:
          "Hej! Jag vill veta vilken grupp som passar bäst för en nybörjare på 12 år och vilka tider som gäller just nu.",
      },
      member: {
        first_name: "Ali",
        last_name: "Hassan",
        email: "ali.hassan@example.com",
        phone: "070-123 45 67",
      },
      membership: {
        membership_start: "2026-04-07",
        membership_end: "2026-07-07",
        trial_ends_at: "2026-04-21T10:00:00.000Z",
        due_date: "2026-04-30T10:00:00.000Z",
        amount: 600,
        invoice_reference: "NSC-4242",
      },
    };

    return [
      {
        slug: "contact-confirmation",
        label: "Kontaktbekräftelse",
        ...this.buildContactConfirmationEmail(previewData.contact.email, previewData.contact),
      },
      {
        slug: "contact-notification-admin",
        label: "Kontakt till admin",
        ...this.buildContactNotificationEmail(previewData.contact),
      },
      {
        slug: "signup-confirmation-member",
        label: "Anmälningsbekräftelse",
        ...this.buildRegistrationConfirmationEmail(previewData.member.email, {
          ...previewData.member,
          ...previewData.membership,
        }),
      },
      {
        slug: "signup-alert-admin",
        label: "Ny anmälan till admin",
        ...this.buildAdminSignupAlertEmail({
          ...previewData.member,
          trial_ends_at: previewData.membership.trial_ends_at,
        }),
      },
      {
        slug: "trial-ending-invoice-member",
        label: "Automatisk betalinfo",
        ...this.buildTrialInvoiceEmail(previewData.member.email, {
          ...previewData.member,
          ...previewData.membership,
        }),
      },
      {
        slug: "invoice-alert-admin",
        label: "Betalinfo till admin",
        ...this.buildAdminInvoiceAlertEmail({
          ...previewData.member,
          amount: previewData.membership.amount,
          trigger: "Automatisk efter prova-på",
        }),
      },
      {
        slug: "manual-payment-member",
        label: "Manuell betalinfo",
        ...this.buildManualPaymentInfoEmail(previewData.member.email, {
          ...previewData.member,
          ...previewData.membership,
        }),
      },
    ];
  }

  async processPendingTrialInvoices(db) {
    if (!db || !isBrevoConfigured()) {
      return { processed: 0, skipped: true };
    }

    const memberships = await db.getPendingTrialInvoices();
    let processed = 0;

    for (const membership of memberships) {
      const result = await this.sendTrialInvoice(membership.email, {
        first_name: membership.first_name,
        membership_start: membership.start_date,
        membership_end: membership.end_date,
        due_date: addDays(new Date(), 10),
        amount: membership.amount_paid,
        invoice_reference: `NSC-${membership.id}`,
      });

      if (result.success) {
        await db.markTrialInvoiceSent(membership.id);
        await this.sendAdminInvoiceAlert({
          first_name: membership.first_name,
          last_name: membership.last_name,
          email: membership.email,
          amount: membership.amount_paid,
          trigger: "Automatisk efter prova-på",
        });
        processed += 1;
      }
    }

    return { processed };
  }

  startInvoiceScheduler(db) {
    if (invoiceScheduler || !db) {
      return;
    }

    const intervalMinutes = Number(process.env.EMAIL_INVOICE_INTERVAL_MINUTES || 60);
    const intervalMs = Math.max(intervalMinutes, 15) * 60 * 1000;

    const run = async () => {
      try {
        await this.processPendingTrialInvoices(db);
      } catch (error) {
        console.error("Invoice scheduler failed:", error);
      }
    };

    run();
    invoiceScheduler = setInterval(run, intervalMs);
    invoiceScheduler.unref?.();
  }
}

module.exports = new EmailService();
