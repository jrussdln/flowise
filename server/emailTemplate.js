/* ------------------------------------------------------------------
   HTML + plain-text templates for the contact form notification email.

   Kept in one place so the design is easy to tweak. The markup is
   table-based with inline styles — the format that renders
   consistently across Gmail, Outlook, Apple Mail and mobile clients.
   A small <style> block only handles dark mode and small screens
   (clients that strip <style> simply fall back to the light design).

   Card structure: an outer table with 1px padding paints the border,
   so header / body / footer cells never double up their edges.
   ------------------------------------------------------------------ */

import { SITE } from "../src/constants/site.js";

const ACCENT = "#4a6b8a"; // matches --accent in src/index.css
const ACCENT_SOFT = "#7a9bb5";
const BORDER = "#e4e9f2";

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Escape first, then add <br> — CodeIgniter's nl2br() equivalent. */
function nl2br(value) {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, "<br>");
}

function metaRow(label, valueHtml) {
  return `
                        <tr>
                          <td width="78" valign="top" style="padding:8px 0;font-size:11px;line-height:1.5;letter-spacing:.09em;text-transform:uppercase;color:#8892a6">${label}</td>
                          <td valign="top" style="padding:8px 0;font-size:14px;line-height:1.5;color:#1f2a3a;word-break:break-word">${valueHtml}</td>
                        </tr>`;
}

function hairline() {
  return `
                        <tr>
                          <td colspan="2" style="padding:0;height:1px;line-height:1px">
                            <div class="e-divider" style="background-color:${BORDER};height:1px;font-size:0;line-height:0">&nbsp;</div>
                          </td>
                        </tr>`;
}

const LABEL = "margin:0 0 10px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8892a6";

/**
 * @param {{ email: string, message: string, ip?: string, userAgent?: string, sentAt: string }} data
 * @returns {string} full HTML email document
 */
export function buildContactEmailHtml({ email, message, ip, userAgent, sentAt }) {
  const safeEmail = escapeHtml(email);
  const replyHref = `mailto:${safeEmail}?subject=${encodeURIComponent(
    `Re: your message via the ${SITE.name} contact form`
  )}`;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>New Contact Form Message</title>
  <style type="text/css">
    /* Dark mode — applied only by clients that allow <style>. */
    @media (prefers-color-scheme: dark) {
      .e-bg       { background-color: #0d1424 !important; }
      .e-frame    { background-color: #26334c !important; }
      .e-panel    { background-color: #141d2f !important; }
      .e-text     { color: #d9e0ec !important; }
      .e-meta     { background-color: #101927 !important; border-color: #26334c !important; }
      .e-box      { background-color: #101927 !important; border-color: #26334c !important; color: #d9e0ec !important; }
      .e-label    { color: #8fa9c4 !important; }
      .e-muted    { color: #93a0b5 !important; }
      .e-sub      { color: #a8b4c7 !important; }
      .e-footer   { background-color: #101927 !important; border-color: #26334c !important; }
      .e-divider  { background-color: #26334c !important; }
      .e-cell     { color: #d9e0ec !important; }
    }
    @media only screen and (max-width: 620px) {
      .e-shell { width: 100% !important; }
      .e-pad   { padding-left: 20px !important; padding-right: 20px !important; }
      .e-cta   { width: 100% !important; }
      .e-cta a { display: block !important; text-align: center !important; }
    }
  </style>
</head>
<body class="e-bg" style="margin:0;padding:0;background-color:#eef1f7;-webkit-font-smoothing:antialiased;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="e-bg" style="background-color:#eef1f7;padding:28px 12px">
    <tr>
      <td align="center">

        <!-- 1px frame -->
        <table role="presentation" class="e-shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:${BORDER};border-radius:16px;border-collapse:separate">
          <tr>
            <td class="e-frame" style="padding:1px;background-color:${BORDER};border-radius:16px">

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:separate">

                <!-- Header -->
                <tr>
                  <td class="e-pad" style="background-image:linear-gradient(135deg, ${ACCENT} 0%, #2f4a66 100%);border-radius:15px 15px 0 0;padding:26px 32px 24px">
                    <p style="margin:0;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.75)">Portfolio Contact Form</p>
                    <h1 style="margin:10px 0 6px;font-size:23px;line-height:1.3;font-weight:700;color:#ffffff">New Contact Form Message</h1>
                    <p class="e-sub" style="margin:0;font-size:13px;line-height:1.5;color:rgba(255,255,255,.85)">Someone filled out the contact form on ${escapeHtml(SITE.website)}</p>
                  </td>
                </tr>

                <!-- Accent rule -->
                <tr>
                  <td class="e-divider" style="background-image:linear-gradient(90deg, ${ACCENT} 0%, ${ACCENT_SOFT} 100%);height:4px;font-size:0;line-height:0">&nbsp;</td>
                </tr>

                <!-- Body -->
                <tr>
                  <td class="e-panel e-pad" style="background-color:#ffffff;padding:26px 32px 30px">

                    <p class="e-label" style="${LABEL}">Details</p>
                    <table role="presentation" class="e-meta" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f6f8fc;border:1px solid ${BORDER};border-radius:12px;border-collapse:separate">
                      <tr>
                        <td style="padding:12px 20px 13px">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                            ${metaRow(
                              "From",
                              `<a href="mailto:${safeEmail}" style="color:${ACCENT};font-weight:600;text-decoration:none;border-bottom:1px solid rgba(74,107,138,.35)">${safeEmail}</a>`
                            )}
                            ${hairline()}
                            ${metaRow("Sent", `<span class="e-cell">${escapeHtml(sentAt)}</span>`)}
                            ${hairline()}
                            ${metaRow("IP", `<span class="e-cell">${escapeHtml(ip || "unknown")}</span>`)}
                          </table>
                        </td>
                      </tr>
                    </table>

                    <!-- Reply CTA -->
                    <table role="presentation" class="e-cta" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px">
                      <tr>
                        <td align="center" bgcolor="${ACCENT}" style="background-color:${ACCENT};border-radius:9px">
                          <a href="${replyHref}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:9px;background-color:${ACCENT}">&#8592;&nbsp; Reply to this message</a>
                        </td>
                      </tr>
                    </table>

                    <!-- Message -->
                    <p class="e-label" style="margin:26px 0 10px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8892a6">Message</p>
                    <div class="e-box" style="background-color:#ffffff;border:1px solid ${BORDER};border-left:4px solid ${ACCENT_SOFT};border-radius:10px;padding:18px 20px;font-size:15px;line-height:1.7;color:#24303f;white-space:pre-wrap;word-break:break-word">${nl2br(message)}</div>

                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td class="e-footer e-pad" style="background-color:#f6f8fc;border-top:1px solid ${BORDER};border-radius:0 0 15px 15px;padding:16px 32px;text-align:center">
                    <p class="e-muted" style="margin:0;font-size:12px;line-height:1.6;color:#8892a6">
                      You received this because a visitor submitted the contact form on
                      <a href="${escapeHtml(SITE.website)}" style="color:${ACCENT};text-decoration:none">${escapeHtml(SITE.website)}</a>.
                    </p>
                    ${
                      userAgent
                        ? `<p class="e-muted" style="margin:6px 0 0;font-size:11px;line-height:1.5;color:#a2abbf;word-break:break-word">Browser: ${escapeHtml(userAgent)}</p>`
                        : ""
                    }
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
</html>`;
}

/**
 * Plain-text fallback for clients that don't render HTML.
 * @returns {string}
 */
export function buildContactEmailText({ email, message, ip, userAgent, sentAt }) {
  const divider = "─".repeat(52);
  return [
    "NEW CONTACT FORM MESSAGE",
    divider,
    `From: ${email}`,
    `Sent: ${sentAt}`,
    `IP:   ${ip || "unknown"}`,
    "",
    "MESSAGE",
    divider,
    message,
    "",
    divider,
    `Received from the contact form at ${SITE.website}`,
    userAgent ? `Browser: ${userAgent}` : null,
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");
}
