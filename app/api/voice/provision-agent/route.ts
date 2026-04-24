import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import { TwilioService } from '@/lib/twilio';
import { VapiService } from '@/lib/vapi';
import { EmailService } from '@/lib/email';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { customerName, customerEmail, pabblySubscriptionId } = body;

    console.log(`[PROVISION AGENT] Orchestrating provisioning for ${customerName || 'Unknown Client'}...`);

    const twilio = new TwilioService();
    const vapi = new VapiService();
    const emailData = new EmailService();

    // 1. Fetch live environments for collision detection
    await connectToDatabase();
    const activeUsers = await User.find({ twilioNumber: { $exists: true, $ne: null } });
    const assignedNumbers = new Set(activeUsers.map(u => u.twilioNumber));
    
    const [ownedNumbers, vapiAssignedNumbers] = await Promise.all([
      twilio.getOwnedNumbers(),
      vapi.getAssignedNumbers()
    ]);
    const vapiAssignedSet = new Set(vapiAssignedNumbers);

    let selectedNumber = null;

    // 2. Detect 100% clean orphaned numbers
    for (const num of ownedNumbers) {
      if (!assignedNumbers.has(num) && !vapiAssignedSet.has(num)) {
        selectedNumber = num;
        console.log(`[PROVISION ROUTER] Hijacked clean orphaned number: ${selectedNumber}`);
        break;
      }
    }

    // 3. Fallback: Purchase a net-new number
    if (!selectedNumber) {
      console.log("[PROVISION ROUTER] Inventory exhausted! Purchasing net-new Twilio number...");
      selectedNumber = await twilio.purchaseNewNumber();
    }

    // 4. Create Vapi Agent
    const agentId = await vapi.createVapiAgent(customerName);

    // 5. Import and Link Twilio Number
    await vapi.linkTwilioToVapi(selectedNumber, agentId, customerName);

    // 6. Generate QR Code
    const qrCodeUrl = twilio.generateCallForwardingQR(selectedNumber);

    // 7. Save to MongoDB
    if (customerEmail) {
      await User.findOneAndUpdate(
        { email: customerEmail.toLowerCase().trim() },
        { 
          $set: { name: customerName || 'New Client' },
          $push: {
            agents: {
              name: `${customerName || 'New Client'}'s AI Line`,
              twilioNumber: selectedNumber,
              vapiAgentId: agentId,
              pabblySubscriptionId: pabblySubscriptionId || undefined,
              purchasedAt: new Date()
            }
          },
          $setOnInsert: {
            referralCode: `AIP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
            createdAt: new Date()
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      
      // 8. Dispatch Administrative Alerts & Secure Magic Links
      await emailData.sendAdminProvisioningAlert(customerName, customerEmail, selectedNumber);
      
      const dashboardUrl = emailData.generateMagicLink(customerEmail, customerName, agentId, selectedNumber);
      await emailData.sendClientWelcomePayload(customerEmail, customerName, dashboardUrl);
    }

    console.log(`[PROVISION ROUTER] Successfully orchestrated full infrastructure deployment!`);
    return NextResponse.json({ success: true, agentId, twilioNumber: selectedNumber, qrCodeUrl });

  } catch (error: any) {
    console.error("[PROVISION ROUTER ERROR] Critical architectural failure:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
