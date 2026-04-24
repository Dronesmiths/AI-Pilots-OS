import axios from 'axios';

/**
 * Enterprise VAPI Service Module
 * Strictly isolates Voice Agent generation and telecom linking APIs.
 */

export class VapiService {
  private apiKey: string;
  private baseUrl = 'https://api.vapi.ai';

  constructor() {
    const key = process.env.VAPI_API_KEY;
    if (!key) throw new Error('[VAPI SERVICE] Missing VAPI_API_KEY in environment.');
    this.apiKey = key;
  }

  /**
   * Queries the live Vapi server to fetch all assigned telecom numbers actively bound to agents.
   * Useful for duplicate collision detection.
   */
  async getAssignedNumbers(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/phone-number`, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });
      const numbers = Array.isArray(response.data) ? response.data : response.data.results || [];
      return numbers.map((n: any) => n.number);
    } catch (error: any) {
      console.warn('[VAPI SERVICE] Failed to pull Vapi inventory list. Defaulting to empty array.', error.message);
      return [];
    }
  }

  /**
   * Fully constructs a net-new GPT-4o-Mini Voice Assistant dynamically.
   */
  async createVapiAgent(customerName: string): Promise<string> {
    try {
      const response = await axios.post(`${this.baseUrl}/assistant`, {
        name: `Agent for ${customerName || 'New Client'}`,
        firstMessage: `Hello ${customerName || 'there'}, how can I assist you today?`,
        model: {
          provider: "openai",
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are a helpful AI Voice Assistant exclusively built for ${customerName || 'our client'}. The caller's physical phone number is dynamically injected here: {{call.customer.number}}. You have the explicit ability to natively send SMS text messages to the caller during this exact phone call using your 'sendSmsMessage' tool. If they ask for information, links, or a prayer, you can impress them by saying "I see you're calling from {{call.customer.number}}, I can shoot that over to you in a text right now if you'd like!"`
            }
          ],
          tools: [
            {
              type: "function",
              messages: [
                { type: "request-start", content: "I am sending that text message to your phone right now." },
                { type: "request-complete", content: "Okay, the text message has been sent!" },
                { type: "request-failed", content: "I apologize, I wasn't able to send the text message." }
              ],
              function: {
                name: "sendSmsMessage",
                description: "Sends a physical SMS text message natively to the caller's phone number during the active phone call.",
                parameters: {
                  type: "object",
                  properties: {
                    body: { type: "string", description: "The exact literal text message content you want to securely send to the user." }
                  },
                  required: ["body"]
                }
              },
              server: { url: "https://dashboard.aipilots.site/api/vapi/webhook" }
            }
          ]
        },
        voice: {
          provider: "11labs",
          voiceId: "bIHbv24MWmeRgasZH58o" // Stable default Emily
        }
      }, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });

      console.log(`[VAPI SERVICE] Created net-new agent! ID: ${response.data.id}`);
      return response.data.id;
    } catch (error) {
      console.error('[VAPI SERVICE] Critical error generating new Vapi Agent', error);
      throw error;
    }
  }

  /**
   * Imports a raw Twilio Phone Number into Vapi and irreversibly links it to the target Agent ID.
   */
  async linkTwilioToVapi(phoneNumber: string, agentId: string, customerName: string): Promise<string> {
    try {
      const response = await axios.post(`${this.baseUrl}/phone-number`, {
        provider: "twilio",
        number: phoneNumber,
        twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
        twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
        name: `Number for ${customerName || 'New Client'}`,
        assistantId: agentId,
        serverUrl: "https://dashboard.aipilots.site/api/vapi/webhook" 
      }, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });

      console.log(`[VAPI SERVICE] Twilio Number successfully bonded to Vapi! Node ID: ${response.data.id}`);
      return response.data.id;
    } catch (error) {
      console.error('[VAPI SERVICE] Failed to link Twilio number to Vapi', error);
      throw error;
    }
  }

  /**
   * Fetches the live configuration of an active agent to preserve specific configurations (like Custom Tools).
   */
  async getAgentTools(agentId: string): Promise<any[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/assistant/${agentId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });
      if (response.data.model && response.data.model.tools) {
        return response.data.model.tools;
      }
      return [];
    } catch (error: any) {
      console.warn('[VAPI SERVICE] Could not fetch existing agent tools. Defaulting to empty array.', error.message);
      return [];
    }
  }

  /**
   * Pushes a massive structured update securely to the Vapi HTTP endpoint to overwrite agent characteristics.
   */
  async configureAgent(agentId: string, payload: any): Promise<void> {
    try {
      await axios.patch(`${this.baseUrl}/assistant/${agentId}`, payload, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });
      console.log(`[VAPI SERVICE] Successfully Patched Vapi Agent ${agentId}!`);
    } catch (error: any) {
      const errorTrace = error?.response?.data ? JSON.stringify(error.response.data) : error.message;
      console.error('[VAPI SERVICE ERROR] Critical failure configuring agent', errorTrace);
      throw new Error(`Vapi Rejected Configuration: ${errorTrace}`);
    }
  }
}
