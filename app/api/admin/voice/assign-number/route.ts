/**
 * app/api/admin/voice/assign-number/route.ts
 *
 * POST { userId, twilioNumber?, vapiAgentId? }
 *
 * Path A — twilioNumber provided: skips ALL Twilio SDK calls.
 *   1. Save number to MongoDB immediately (always succeeds).
 *   2. Attempt VAPI link — best-effort, non-fatal.
 *
 * Path B — no twilioNumber: auto-assign from Twilio inventory.
 *   1. Scan Twilio-owned numbers for orphans, or purchase new.
 *   2. VAPI link (best-effort) + MongoDB save.
 *   3. If Twilio SDK errors → return 422 with clear message.
 */
import { NextResponse }  from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User              from '@/models/User';
import { TwilioService } from '@/lib/twilio';
import { VapiService }   from '@/lib/vapi';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, twilioNumber: manualNumber, vapiAgentId: bodyAgentId } = body;

    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

    await connectToDatabase();
    const user = await User.findById(userId).lean() as any;
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Resolve VAPI agent ID — DB first, then body override, gracefully null if none
    const existingAgentId: string | null =
      bodyAgentId ||
      user.agents?.[0]?.vapiAgentId ||
      user.vapiAgentId ||
      null;

    let selectedNumber: string | null = manualNumber?.trim() || null;
    let vapiLinked = false;
    let vapiLinkError: string | null = null;

    // ── PATH A: Manual number provided → skip Twilio SDK entirely ──────────
    if (selectedNumber) {
      console.log(`[ASSIGN-NUMBER] Manual path: saving ${selectedNumber} directly`);

      // Best-effort VAPI link — non-fatal, save proceeds regardless
      if (existingAgentId) {
        try {
          const vapi = new VapiService();
          await vapi.linkTwilioToVapi(selectedNumber, existingAgentId, user.name || user.email);
          vapiLinked = true;
          console.log(`[ASSIGN-NUMBER] VAPI linked: ${selectedNumber} → ${existingAgentId}`);
        } catch (vapiErr: any) {
          vapiLinkError = vapiErr?.response?.data?.message || vapiErr.message;
          console.warn(`[ASSIGN-NUMBER] VAPI link failed (non-fatal, number still saved): ${vapiLinkError}`);
        }
      }
    }
    // ── PATH B: Auto-assign from Twilio inventory ───────────────────────────
    else {
      try {
        const twilio = new TwilioService();
        const vapi   = new VapiService();

        const activeUsers    = await User.find({ twilioNumber: { $exists: true, $ne: null } }).lean() as any[];
        const assignedInDb   = new Set(activeUsers.map((u: any) => u.twilioNumber));
        const agentsAssigned = new Set(
          activeUsers.flatMap((u: any) => (u.agents ?? []).map((a: any) => a.twilioNumber).filter(Boolean))
        );
        const owned = await twilio.getOwnedNumbers();

        for (const num of owned) {
          if (!assignedInDb.has(num) && !agentsAssigned.has(num)) {
            selectedNumber = num;
            console.log(`[ASSIGN-NUMBER] Orphaned number selected: ${selectedNumber}`);
            break;
          }
        }

        if (!selectedNumber) {
          console.log('[ASSIGN-NUMBER] No orphaned numbers — purchasing new');
          selectedNumber = await twilio.purchaseNewNumber();
        }

        // Best-effort VAPI link
        if (existingAgentId && selectedNumber) {
          try {
            await vapi.linkTwilioToVapi(selectedNumber, existingAgentId, user.name || user.email);
            vapiLinked = true;
          } catch (vapiErr: any) {
            vapiLinkError = vapiErr?.response?.data?.message || vapiErr.message;
            console.warn(`[ASSIGN-NUMBER] VAPI link failed (non-fatal): ${vapiLinkError}`);
          }
        }
      } catch (twilioErr: any) {
        const msg = twilioErr?.response?.data?.message || twilioErr.message;
        console.error('[ASSIGN-NUMBER] Twilio auto-assign failed:', msg);
        return NextResponse.json({
          error: `Auto-assign failed (${msg}). Please enter the number manually in the field below.`
        }, { status: 422 });
      }
    }

    if (!selectedNumber) {
      return NextResponse.json({ error: 'Could not determine a phone number to assign.' }, { status: 400 });
    }

    // ── Persist to MongoDB ──────────────────────────────────────────────────
    if (user.agents?.length > 0) {
      await User.findByIdAndUpdate(userId, {
        $set: {
          twilioNumber: selectedNumber,
          'agents.0.twilioNumber': selectedNumber,
          ...(existingAgentId ? { 'agents.0.vapiAgentId': existingAgentId } : {}),
        },
      });
    } else {
      await User.findByIdAndUpdate(userId, {
        $set: { twilioNumber: selectedNumber },
        $push: {
          agents: {
            name: `${user.name || 'Client'}'s AI Line`,
            twilioNumber: selectedNumber,
            ...(existingAgentId ? { vapiAgentId: existingAgentId } : {}),
            purchasedAt: new Date(),
          },
        },
      });
    }

    console.log(`[ASSIGN-NUMBER] Done — ${selectedNumber} saved for user ${userId}`);
    return NextResponse.json({
      success: true,
      twilioNumber: selectedNumber,
      vapiAgentId: existingAgentId,
      vapiLinked,
      ...(vapiLinkError ? { vapiLinkWarning: vapiLinkError } : {}),
    });

  } catch (err: any) {
    console.error('[ASSIGN-NUMBER ERROR]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
