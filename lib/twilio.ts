import twilio from 'twilio';

/**
 * Enterprise Twilio Service Module
 * Strictly isolates all Twilio SDK mutations to prevent monolithic API failures.
 */

export class TwilioService {
  private client: twilio.Twilio;
  
  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    if (!accountSid || !authToken) {
      throw new Error('[TWILIO SERVICE] Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in environment.');
    }
    
    this.client = twilio(accountSid, authToken);
  }

  /**
   * Fetches all currently owned incoming phone numbers.
   */
  async getOwnedNumbers(): Promise<string[]> {
    try {
      const numbers = await this.client.incomingPhoneNumbers.list({ limit: 100 });
      return numbers.map(n => n.phoneNumber);
    } catch (error) {
      console.error('[TWILIO SERVICE] Failed to fetch owned numbers', error);
      throw error;
    }
  }

  /**
   * Purchases a net-new United States local phone number automatically.
   */
  async purchaseNewNumber(): Promise<string> {
    console.error('[TWILIO SERVICE] Purchasing blocked by administrative directive.');
    throw new Error('[TWILIO SERVICE] Manual number purchasing is ADMINISTRATIVELY DISABLED. Inventory exhausted.');
    /*
    try {
      const availableNumbers = await this.client.availablePhoneNumbers('US').local.list({ limit: 1 });
      if (!availableNumbers || availableNumbers.length === 0) {
        throw new Error('[TWILIO SERVICE] No available Twilio numbers found in the US toll registry.');
      }
      
      const newNumber = availableNumbers[0].phoneNumber;
      const purchased = await this.client.incomingPhoneNumbers.create({
        phoneNumber: newNumber
      });
      
      console.log(`[TWILIO SERVICE] Successfully purchased new number! SID: ${purchased.sid}`);
      return newNumber;
    } catch (error) {
      console.error('[TWILIO SERVICE] Failed to manually purchase new number', error);
      throw error;
    }
    */
  }

  /**
   * Generates a structural unconditional call-forwarding QR Code URL string (*72 scheme).
   */
  generateCallForwardingQR(phoneNumber: string): string {
    const cleanNumber = phoneNumber.replace(/^\+1/, ''); 
    const forwardingDialString = `*72${cleanNumber}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=tel:${encodeURIComponent(forwardingDialString)}`;
  }

  /**
   * Directly intercepts AI payload parameters and physically generates outbound texts explicitly to target cell numbers.
   */
  async sendSms(to: string, from: string, body: string): Promise<void> {
    try {
      if (!to || !from || !body) throw new Error('[TWILIO SERVICE] SMS Payload strictly malformed or empty.');
      await this.client.messages.create({
        body: body,
        from: from,
        to: to
      });
      console.log(`[TWILIO SERVICE] Successfully injected payload from ${from} explicitly to physical line: ${to}`);
    } catch (error: any) {
      console.error('[TWILIO SERVICE] Webhook explicit failure routing physical SMS payloads.', error.message);
      throw error;
    }
  }
}
