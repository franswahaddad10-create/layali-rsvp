const axios = require('axios');
const twilio = require('twilio');
require('dotenv').config();

let client;

const WHATSAPP_PROVIDER = (process.env.WHATSAPP_PROVIDER || 'twilio').trim().toLowerCase();
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v22.0';

const buildInvitationTemplateVariables = (event) => {
  const eventDate = new Date(event.date);

  return {
    1: eventDate.toLocaleDateString('en-GB'),
    2: eventDate.toLocaleTimeString('en-GB', {
      hour: 'numeric',
      minute: '2-digit',
    }),
  };
};

const normalizeMetaPhone = (guestPhone) => String(guestPhone || '').replace(/\D/g, '');

const buildMetaInvitationParameters = (guest, event) => {
  const eventDate = new Date(event.date);

  return [guest.name, event.name, eventDate.toLocaleDateString('en-GB'), eventDate.toLocaleTimeString('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
  })].map((value) => ({ type: 'text', text: String(value || '') }));
};

const getMetaApiUrl = () => `https://graph.facebook.com/${META_GRAPH_VERSION}/${process.env.META_PHONE_NUMBER_ID}/messages`;

const hasMetaConfig = () => Boolean(process.env.META_ACCESS_TOKEN && process.env.META_PHONE_NUMBER_ID);

const hasTwilioConfig = () => Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_ACCOUNT_SID.startsWith('AC'));

if (WHATSAPP_PROVIDER === 'twilio') {
  try {
    if (hasTwilioConfig()) {
      client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      console.log('✓ Twilio WhatsApp client initialized');
    } else {
      console.log('⚠ Twilio credentials not configured. WhatsApp features will be unavailable.');
    }
  } catch (error) {
    console.log('⚠ Twilio initialization failed:', error.message);
  }
} else if (WHATSAPP_PROVIDER === 'meta') {
  if (hasMetaConfig()) {
    console.log('✓ Meta WhatsApp Cloud API configured');
  } else {
    console.log('⚠ Meta WhatsApp credentials not configured. WhatsApp features will be unavailable.');
  }
}

const sendMetaMessage = async (payload, guestPhone) => {
  try {
    if (!hasMetaConfig()) {
      return { success: false, error: 'Meta WhatsApp service not configured. Please add Meta credentials.' };
    }

    const response = await axios.post(getMetaApiUrl(), payload, {
      headers: {
        Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });תעשה

    const messageId = response.data?.messages?.[0]?.id;
    console.log(`✓ Meta WhatsApp message sent to ${guestPhone}. ID: ${messageId}`);
    return { success: true, sid: messageId, provider: 'meta' };
  } catch (error) {
    const providerMessage = error.response?.data?.error?.message || error.message;
    console.error(`✗ Error sending Meta WhatsApp message to ${guestPhone}:`, providerMessage);
    return { success: false, error: providerMessage };
  }
};

const sendWhatsAppMessage = async (guestPhone, message) => {
  try {
    if (WHATSAPP_PROVIDER === 'meta') {
      return sendMetaMessage({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizeMetaPhone(guestPhone),
        type: 'text',
        text: {
          preview_url: false,
          body: message,
        },
      }, guestPhone);
    }

    if (!client) {
      return { success: false, error: 'WhatsApp service not configured. Please add Twilio credentials.' };
    }
    
    const formattedPhone = guestPhone.startsWith('whatsapp:') ? guestPhone : `whatsapp:${guestPhone}`;
    
    const result = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: formattedPhone,
      body: message,
    });

    console.log(`✓ WhatsApp message sent to ${guestPhone}. SID: ${result.sid}`);
    return { success: true, sid: result.sid };
  } catch (error) {
    console.error(`✗ Error sending WhatsApp message to ${guestPhone}:`, error.message);
    return { success: false, error: error.message };
  }
};

const sendWhatsAppTemplate = async (guestPhone, contentSid, contentVariables) => {
  try {
    if (WHATSAPP_PROVIDER === 'meta') {
      if (!process.env.META_TEMPLATE_NAME) {
        return { success: false, error: 'Meta template name not configured. Please add META_TEMPLATE_NAME.' };
      }

      return sendMetaMessage({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizeMetaPhone(guestPhone),
        type: 'template',
        template: {
          name: process.env.META_TEMPLATE_NAME,
          language: {
            code: process.env.META_TEMPLATE_LANGUAGE || 'en',
          },
          components: [
            {
              type: 'body',
              parameters: Object.keys(contentVariables)
                .sort((left, right) => Number(left) - Number(right))
                .map((key) => ({ type: 'text', text: String(contentVariables[key] || '') })),
            },
          ],
        },
      }, guestPhone);
    }

    if (!client) {
      return { success: false, error: 'WhatsApp service not configured. Please add Twilio credentials.' };
    }

    const formattedPhone = guestPhone.startsWith('whatsapp:') ? guestPhone : `whatsapp:${guestPhone}`;

    const result = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: formattedPhone,
      contentSid,
      contentVariables: JSON.stringify(contentVariables),
    });

    console.log(`✓ WhatsApp template sent to ${guestPhone}. SID: ${result.sid}`);
    return { success: true, sid: result.sid };
  } catch (error) {
    console.error(`✗ Error sending WhatsApp template to ${guestPhone}:`, error.message);
    return { success: false, error: error.message };
  }
};

const sendInvitation = async (guest, event, options = {}) => {
  const { rsvpLink, replyMode } = options;

  if (WHATSAPP_PROVIDER === 'meta' && process.env.META_TEMPLATE_NAME) {
    return sendMetaMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizeMetaPhone(guest.phone),
      type: 'template',
      template: {
        name: process.env.META_TEMPLATE_NAME,
        language: {
          code: process.env.META_TEMPLATE_LANGUAGE || 'en',
        },
        components: [
          {
            type: 'body',
            parameters: buildMetaInvitationParameters(guest, event),
          },
        ],
      },
    }, guest.phone);
  }

  if (!rsvpLink && process.env.TWILIO_INVITATION_CONTENT_SID) {
    return sendWhatsAppTemplate(
      guest.phone,
      process.env.TWILIO_INVITATION_CONTENT_SID,
      buildInvitationTemplateVariables(event)
    );
  }

  const responseInstructions = replyMode
    ? 'Reply with YES or NO. In Hebrew you can reply: מגיע or לא מגיע.'
    : `Confirm in one tap:\n${rsvpLink || 'Reply to confirm your attendance.'}\n\nTap the link and choose if you are coming or not coming.`;

  const message = `Hello ${guest.name}!\n\nYou're invited to: ${event.name}\nDate: ${new Date(event.date).toLocaleDateString()}\nLocation: ${event.location}\n\n${responseInstructions}`;
  return sendWhatsAppMessage(guest.phone, message);
};

const sendArrivalConfirmation = async (guest, event) => {
  const message = `Hi ${guest.name}! 🎉\n\nWe're excited to see you at ${event.name}!\n\nReply "ARRIVED" when you get here to confirm your arrival.`;
  return sendWhatsAppMessage(guest.phone, message);
};

const sendReminder = async (guest, event) => {
  const eventDate = new Date(event.date);
  const message = `Reminder: ${event.name} is on ${eventDate.toLocaleDateString()} at ${eventDate.toLocaleTimeString()}!\n\nWe look forward to seeing you!`;
  return sendWhatsAppMessage(guest.phone, message);
};

module.exports = {
  WHATSAPP_PROVIDER,
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
  sendInvitation,
  sendArrivalConfirmation,
  sendReminder,
};
