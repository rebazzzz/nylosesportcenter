const DEFAULT_BRAND = {
  name: "Nylöse SportCenter",
  siteUrl: process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || "http://localhost:3001",
  contactEmail: process.env.EMAIL_REPLY_TO || "nylosesportcenter@gmail.com",
  primary: "#0f2742",
  accent: "#f0c419",
  warm: "#d62828",
  dark: "#101820",
  light: "#ffffff",
  muted: "#eef2f6",
  body: "#243447",
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

function createEmailShell({ eyebrow, title, intro, sections = [], cta, footnote }) {
  const sectionMarkup = sections
    .map(
      (section) => `
        <tr>
          <td style="padding:0 32px 18px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #d8dee6;border-radius:18px;background:${section.background || DEFAULT_BRAND.light};">
              <tr>
                <td style="padding:20px 22px;">
                  ${section.kicker ? `<p style="margin:0 0 8px;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${DEFAULT_BRAND.warm};font-weight:700;">${section.kicker}</p>` : ""}
                  ${section.heading ? `<h2 style="margin:0 0 10px;font-size:20px;line-height:1.3;color:${DEFAULT_BRAND.dark};">${section.heading}</h2>` : ""}
                  ${section.body ? `<div style="font-size:15px;line-height:1.7;color:${DEFAULT_BRAND.body};">${section.body}</div>` : ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>`,
    )
    .join("");

  const ctaMarkup = cta
    ? `
      <tr>
        <td style="padding:6px 32px 28px;text-align:center;">
          <a href="${escapeHtml(cta.href)}" style="display:inline-block;background:${DEFAULT_BRAND.primary};color:${DEFAULT_BRAND.light};text-decoration:none;padding:14px 24px;border-radius:999px;font-size:15px;font-weight:700;">${cta.label}</a>
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
      <body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;color:${DEFAULT_BRAND.body};">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:${DEFAULT_BRAND.light};border-radius:24px;overflow:hidden;border:1px solid #dbe3eb;">
                <tr>
                  <td style="padding:0;background:linear-gradient(135deg, ${DEFAULT_BRAND.primary} 0%, ${DEFAULT_BRAND.dark} 72%, ${DEFAULT_BRAND.warm} 100%);">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="padding:32px;">
                          <p style="margin:0 0 10px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${DEFAULT_BRAND.accent};font-weight:700;">${escapeHtml(eyebrow)}</p>
                          <h1 style="margin:0 0 12px;font-size:30px;line-height:1.15;color:${DEFAULT_BRAND.light};">${escapeHtml(title)}</h1>
                          <p style="margin:0;font-size:16px;line-height:1.7;color:rgba(255,255,255,0.92);">${intro}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                ${sectionMarkup}
                ${ctaMarkup}
                <tr>
                  <td style="padding:0 32px 32px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${DEFAULT_BRAND.muted};border-radius:18px;">
                      <tr>
                        <td style="padding:18px 20px;font-size:13px;line-height:1.7;color:#536273;">
                          ${footnote}
                        </td>
                      </tr>
                    </table>
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
    const subject = "Vi har tagit emot ditt meddelande";
    const htmlContent = createEmailShell({
      eyebrow: DEFAULT_BRAND.name,
      title: "Tack för att du kontaktade oss",
      intro: `Hej ${escapeHtml(payload.name)}. Vi har tagit emot ditt meddelande och återkommer så snart vi kan.`,
      sections: [
        {
          kicker: "Bekräftelse",
          heading: "Det här skickade du till oss",
          body: `<p style="margin:0;">${normalizeMultilineText(payload.message)}</p>`,
          background: "#fffdf7",
        },
        {
          kicker: "Nästa steg",
          heading: "Vi hör av oss personligen",
          body: "<p style=\"margin:0;\">Om din fråga gäller träning, schema eller medlemskap återkommer vi med rätt information så snart som möjligt.</p>",
        },
      ],
      cta: {
        href: DEFAULT_BRAND.siteUrl,
        label: "Besök hemsidan",
      },
      footnote: `Det här är en automatisk bekräftelse från ${DEFAULT_BRAND.name}. Du kan svara på detta mejl eller skriva till ${escapeHtml(DEFAULT_BRAND.contactEmail)} om du vill komplettera din fråga.`,
    });

    return this.sendEmail({
      to: userEmail,
      subject,
      htmlContent,
      textContent: `Hej ${payload.name}, vi har tagit emot ditt meddelande och återkommer så snart vi kan.`,
      replyTo: DEFAULT_BRAND.contactEmail,
    });
  }

  async sendContactNotification(payload) {
    if (!DEFAULT_BRAND.contactEmail) {
      return { success: false, skipped: true, error: "No contact email configured" };
    }

    const subject = `Nytt kontaktmeddelande från ${payload.name}`;
    const htmlContent = createEmailShell({
      eyebrow: "Kontaktformulär",
      title: "Nytt meddelande från hemsidan",
      intro: "Ett nytt kontaktformulär har skickats in via webbplatsen.",
      sections: [
        {
          heading: "Avsändare",
          body: `<p style="margin:0 0 6px;"><strong>Namn:</strong> ${escapeHtml(payload.name)}</p><p style="margin:0;"><strong>E-post:</strong> ${escapeHtml(payload.email)}</p>`,
          background: "#fffdf7",
        },
        {
          heading: "Meddelande",
          body: `<p style="margin:0;">${normalizeMultilineText(payload.message)}</p>`,
        },
      ],
      footnote: "Det här mejlet skickades automatiskt från kontaktformuläret på hemsidan.",
    });

    return this.sendEmail({
      to: DEFAULT_BRAND.contactEmail,
      subject,
      htmlContent,
      textContent: `${payload.name} (${payload.email}) skrev: ${payload.message}`,
      replyTo: payload.email,
    });
  }

  async sendAdminSignupAlert(payload) {
    if (!DEFAULT_BRAND.contactEmail) {
      return { success: false, skipped: true, error: "No contact email configured" };
    }

    const subject = `Ny anmälan: ${payload.first_name} ${payload.last_name}`;
    const htmlContent = createEmailShell({
      eyebrow: "Adminnotis",
      title: "Ny registrering från hemsidan",
      intro: "En ny medlem har registrerat sig via webbplatsen.",
      sections: [
        {
          heading: "Medlemsuppgifter",
          body: `
            <p style="margin:0 0 6px;"><strong>Namn:</strong> ${escapeHtml(payload.first_name)} ${escapeHtml(payload.last_name)}</p>
            <p style="margin:0 0 6px;"><strong>E-post:</strong> ${escapeHtml(payload.email)}</p>
            <p style="margin:0 0 6px;"><strong>Telefon:</strong> ${escapeHtml(payload.phone || "-")}</p>
            <p style="margin:0;"><strong>Prova-på till:</strong> ${formatDate(payload.trial_ends_at)}</p>
          `,
          background: "#fffdf7",
        },
      ],
      footnote: "Den här adminnotisen skickades automatiskt efter en ny registrering.",
    });

    return this.sendEmail({
      to: DEFAULT_BRAND.contactEmail,
      subject,
      htmlContent,
      textContent: `Ny registrering: ${payload.first_name} ${payload.last_name}, ${payload.email}, prova-på till ${formatDate(payload.trial_ends_at)}.`,
      replyTo: DEFAULT_BRAND.contactEmail,
    });
  }

  async sendAdminInvoiceAlert(payload) {
    if (!DEFAULT_BRAND.contactEmail) {
      return { success: false, skipped: true, error: "No contact email configured" };
    }

    const subject = `Betalinfo skickad: ${payload.first_name} ${payload.last_name || ""}`.trim();
    const htmlContent = createEmailShell({
      eyebrow: "Adminnotis",
      title: "Betaluppgifter har skickats",
      intro: "En betalningspåminnelse eller faktura har skickats till en medlem.",
      sections: [
        {
          heading: "Utskick",
          body: `
            <p style="margin:0 0 6px;"><strong>Mottagare:</strong> ${escapeHtml(payload.first_name)} ${escapeHtml(payload.last_name || "")}</p>
            <p style="margin:0 0 6px;"><strong>E-post:</strong> ${escapeHtml(payload.email)}</p>
            <p style="margin:0 0 6px;"><strong>Typ:</strong> ${escapeHtml(payload.trigger || "Automatiskt utskick")}</p>
            <p style="margin:0;"><strong>Belopp:</strong> ${escapeHtml(String(payload.amount))} kr</p>
          `,
          background: "#fffdf7",
        },
      ],
      footnote: "Den här adminnotisen skickades automatiskt när betaluppgifter mejlades ut.",
    });

    return this.sendEmail({
      to: DEFAULT_BRAND.contactEmail,
      subject,
      htmlContent,
      textContent: `Betaluppgifter skickade till ${payload.first_name} ${payload.last_name || ""} (${payload.email}). Typ: ${payload.trigger || "Automatiskt utskick"}.`,
      replyTo: DEFAULT_BRAND.contactEmail,
    });
  }

  async sendRegistrationConfirmation(userEmail, userData) {
    const membershipStart = formatDate(userData.membership_start);
    const membershipEnd = formatDate(userData.membership_end);
    const trialEndDate = formatDate(userData.trial_ends_at || addDays(userData.membership_start, 14));
    const subject = "Din anmälan till Nylöse SportCenter är mottagen";

    const htmlContent = createEmailShell({
      eyebrow: DEFAULT_BRAND.name,
      title: "Välkommen till klubben",
      intro: `Hej ${escapeHtml(userData.first_name)}. Din anmälan är mottagen och du är varmt välkommen att börja träna med oss.`,
      sections: [
        {
          kicker: "Start",
          heading: "Din plats är registrerad",
          body: `<p style="margin:0 0 10px;">Medlemsperioden är upplagd från <strong>${membershipStart}</strong> till <strong>${membershipEnd}</strong>.</p><p style="margin:0;">Du har samtidigt <strong>2 veckors gratis prova-på</strong> till och med <strong>${trialEndDate}</strong>.</p>`,
          background: "#fffdf7",
        },
        {
          kicker: "Efter prova-på",
          heading: "Så fungerar betalningen",
          body: "<p style=\"margin:0 0 10px;\">Efter prova-på-perioden skickar vi betaluppgifterna automatiskt till dig.</p><p style=\"margin:0;\">Om du inte vill fortsätta efter dina två gratis veckor behöver du inte göra något alls. Det räcker att ignorera mejlet med betaluppgifterna.</p>",
        },
      ],
      cta: {
        href: DEFAULT_BRAND.siteUrl,
        label: "Se hemsidan",
      },
      footnote: `Har du frågor innan dess är du alltid välkommen att kontakta oss på ${escapeHtml(DEFAULT_BRAND.contactEmail)}.`,
    });

    return this.sendEmail({
      to: userEmail,
      subject,
      htmlContent,
      textContent: `Hej ${userData.first_name}! Din anmälan är mottagen. Du har två veckors gratis prova-på till och med ${trialEndDate}. Efter det skickar vi betaluppgifter automatiskt. Om du inte vill fortsätta kan du ignorera det mejlet.`,
      replyTo: DEFAULT_BRAND.contactEmail,
    });
  }

  async sendTrialInvoice(userEmail, invoiceData) {
    const subject = "Betaluppgifter för fortsatt medlemskap";
    const dueDate = formatDate(invoiceData.due_date);
    const htmlContent = createEmailShell({
      eyebrow: "Medlemskap",
      title: "Fortsätt träna med oss",
      intro: `Hej ${escapeHtml(invoiceData.first_name)}. Din gratis prova-på-period är nu slut och här kommer betaluppgifterna om du vill fortsätta träna hos oss.`,
      sections: [
        {
          kicker: "Avgift",
          heading: "Fakturaöversikt",
          body: `<p style="margin:0 0 6px;"><strong>Belopp:</strong> ${escapeHtml(String(invoiceData.amount))} kr</p><p style="margin:0 0 6px;"><strong>Avser period:</strong> ${formatDate(invoiceData.membership_start)} till ${formatDate(invoiceData.membership_end)}</p><p style="margin:0;"><strong>Förfallodatum:</strong> ${dueDate}</p>`,
          background: "#fffdf7",
        },
        {
          kicker: "Betaluppgifter",
          heading: "Betala med något av följande",
          body: createPaymentDetailsMarkup(),
        },
        {
          kicker: "Viktigt",
          heading: "Om du inte vill fortsätta",
          body: "<p style=\"margin:0;\">Om du inte vill fortsätta efter prova-på-perioden behöver du inte göra någonting. Du kan enkelt ignorera detta mejl.</p>",
        },
      ],
      footnote: `Ange gärna medlemsnamn${invoiceData.invoice_reference ? ` och referens <strong>${escapeHtml(invoiceData.invoice_reference)}</strong>` : ""} vid betalning så att vi kan matcha den snabbare.`,
    });

    return this.sendEmail({
      to: userEmail,
      subject,
      htmlContent,
      textContent: `Hej ${invoiceData.first_name}. Din prova-på-period är slut. Om du vill fortsätta träna är medlemsavgiften ${invoiceData.amount} kr med förfallodatum ${dueDate}. Om du inte vill fortsätta kan du ignorera detta mejl.`,
      replyTo: DEFAULT_BRAND.contactEmail,
    });
  }

  async sendManualPaymentInfo(userEmail, invoiceData) {
    const subject = "Betaluppgifter för medlemskap";
    const dueDate = formatDate(invoiceData.due_date);
    const htmlContent = createEmailShell({
      eyebrow: "Medlemskap",
      title: "Här kommer dina betaluppgifter",
      intro: `Hej ${escapeHtml(invoiceData.first_name)}. Här kommer betaluppgifterna för ditt medlemskap hos oss.`,
      sections: [
        {
          kicker: "Avgift",
          heading: "Betalningsöversikt",
          body: `<p style="margin:0 0 6px;"><strong>Belopp:</strong> ${escapeHtml(String(invoiceData.amount))} kr</p><p style="margin:0 0 6px;"><strong>Avser period:</strong> ${formatDate(invoiceData.membership_start)} till ${formatDate(invoiceData.membership_end)}</p><p style="margin:0;"><strong>Förfallodatum:</strong> ${dueDate}</p>`,
          background: "#fffdf7",
        },
        {
          kicker: "Betaluppgifter",
          heading: "Betala med något av följande",
          body: createPaymentDetailsMarkup(),
        },
      ],
      footnote: `Kontakta oss gärna på ${escapeHtml(DEFAULT_BRAND.contactEmail)} om du har frågor om medlemskapet eller betalningen.`,
    });

    return this.sendEmail({
      to: userEmail,
      subject,
      htmlContent,
      textContent: `Hej ${invoiceData.first_name}. Här kommer betaluppgifterna för ditt medlemskap. Belopp: ${invoiceData.amount} kr. Förfallodatum: ${dueDate}.`,
      replyTo: DEFAULT_BRAND.contactEmail,
    });
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
