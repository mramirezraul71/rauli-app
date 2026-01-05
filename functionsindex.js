/**
 * functions/index.js
 * RAULI - Alertas WhatsApp (Meta Cloud API) - OPCIONAL
 * Autor del prototipo: ChatGPT
 *
 * Requisitos cuando lo actives:
 * - firebase init functions (Node 18+)
 * - Secrets:
 *    WA_TOKEN
 *    WA_PHONE_NUMBER_ID
 *    WA_TO_RAUL
 * - Templates aprobadas en Meta:
 *    rauli_alerta_inventario
 *    rauli_alerta_caja
 *    rauli_alerta_fondo
 *    rauli_alerta_cierre
 *    rauli_alerta_general
 */

const admin = require("firebase-admin");
admin.initializeApp();

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");

// ===== Secrets (NO poner tokens en el frontend) =====
const WA_TOKEN = defineSecret("WA_TOKEN");
const WA_PHONE_NUMBER_ID = defineSecret("WA_PHONE_NUMBER_ID");
const WA_TO_RAUL = defineSecret("WA_TO_RAUL");

async function sendWhatsAppTemplate({
  token,
  phoneNumberId,
  to,
  templateName,
  lang = "es",
  bodyParams = [],
}) {
  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

  const components = bodyParams.length
    ? [
        {
          type: "body",
          parameters: bodyParams.map((t) => ({ type: "text", text: String(t) })),
        },
      ]
    : [];

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: lang },
      ...(components.length ? { components } : {}),
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`WhatsApp API error: ${JSON.stringify(data)}`);
  }
  return data;
}

// ===== Trigger: cuando se crea una alerta en RAULI =====
exports.whatsappAlert = onDocumentCreated(
  {
    document: "business/rauli/alerts/{alertId}",
    secrets: [WA_TOKEN, WA_PHONE_NUMBER_ID, WA_TO_RAUL],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const alert = snap.data();
    if (!alert) return;

    // Evitar spam: si notify !== true, no manda WhatsApp
    if (alert.notify !== true) return;

    // Evitar re-envíos si ya fue enviado
    if (alert.wa?.sent === true) return;

    const templateMap = {
      inventario_bajo: "rauli_alerta_inventario",
      caja_faltante: "rauli_alerta_caja",
      fondo_bajo: "rauli_alerta_fondo",
      cierre_pendiente: "rauli_alerta_cierre",
      deficit_operativo: "rauli_alerta_general",
      general: "rauli_alerta_general",
    };

    const templateName = templateMap[alert.type] || templateMap.general;

    const token = WA_TOKEN.value();
    const phoneNumberId = WA_PHONE_NUMBER_ID.value();
    const to = WA_TO_RAUL.value();

    // Variables para template: {{1}}, {{2}}, {{3}}
    const p1 = alert.title || "Alerta RAULI";
    const p2 = alert.message || "";
    const p3 = alert.day || "";

    try {
      const resp = await sendWhatsAppTemplate({
        token,
        phoneNumberId,
        to,
        templateName,
        lang: "es",
        bodyParams: [p1, p2, p3],
      });

      // Marcar enviado
      await snap.ref.set(
        {
          wa: {
            sent: true,
            templateName,
            to,
            sentAt: Date.now(),
            resp,
          },
        },
        { merge: true }
      );
    } catch (err) {
      // Registrar error sin romper
      await snap.ref.set(
        {
          wa: {
            sent: false,
            errorAt: Date.now(),
            error: String(err?.message || err),
          },
        },
        { merge: true }
      );
    }
  }
);
