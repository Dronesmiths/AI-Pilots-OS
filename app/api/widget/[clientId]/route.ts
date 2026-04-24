import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params;
    await connectToDatabase();
    
    // We lean() to go fast
    const client = await User.findById(clientId).lean();

    // 1. Kill Switch Logic
    if (!client || client.widgetEnabled === false) {
      return new NextResponse('console.log("AI Pilots Master CRM: Widget remotely deactivated for this client.");', {
        headers: {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'no-store'
        }
      });
    }

    // 2. Resolve target Agent
    let agentId = client.vapiAgentId;
    if (!agentId && client.agents && client.agents.length > 0) {
      agentId = client.agents[0].vapiAgentId;
    }

    if (!agentId) {
      return new NextResponse('console.log("AI Pilots Master CRM: No Voice Agent bound to this client hash.");', {
        headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' }
      });
    }

    const VAPI_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPI_WEB_TOKEN || '74c72495-b876-477b-84cd-3bcff1c23c0d';

    // 3. Construct Vanilla JS Payload Architecture
    // We use isolated scopes to ensure we don't bleed into the host website's global variables.
    const widgetJS = `
(function() {
  // Load Vapi Web SDK Dynamically
  const vapiScript = document.createElement('script');
  vapiScript.src = "https://cdn.jsdelivr.net/npm/@vapi-ai/web/dist/vapi.min.js";
  document.head.appendChild(vapiScript);

  let vapiInstance = null;
  let isCallActive = false;

  // Wait for Vapi to initialize
  vapiScript.onload = () => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectWidgetUI);
    } else {
      injectWidgetUI();
    }
  };

  function injectWidgetUI() {
    // Master Container
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.bottom = '24px';
    container.style.right = '24px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'flex-end';
    container.style.zIndex = '999999';
    container.style.fontFamily = '"Inter", "Google Sans", sans-serif';
    document.body.appendChild(container);

    // Menu Popover (Initially Hidden)
    const menu = document.createElement('div');
    menu.style.display = 'none';
    menu.style.flexDirection = 'column';
    menu.style.gap = '8px';
    menu.style.marginBottom = '16px';
    menu.style.backgroundColor = '#ffffff';
    menu.style.padding = '12px';
    menu.style.borderRadius = '16px';
    menu.style.boxShadow = '0 4px 12px rgba(60,64,67,0.15)';
    menu.style.border = '1px solid #e8eaed';
    menu.style.transformOrigin = 'bottom right';
    menu.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
    menu.style.opacity = '0';
    menu.style.transform = 'scale(0.9)';
    container.appendChild(menu);

    // Build Menu Cards
    const btnVoice = createCardBtn('🎤', 'Live Voice AI', 'Quick appointments and questions spoken to you live from our voice agent.', '#1a73e8', '#f8fbff');
    const btnChat = createCardBtn('💬', 'AI Text Chat', 'Say hello! Get instant answers via text from our intelligent AI associate.', '#673ab7', '#fcf9ff');
    const btnHuman = createCardBtn('🙋', 'Request Human', 'Place a live call or escalate your inquiry to a real human agent.', '#d93025', '#fffaf9');

    menu.appendChild(btnVoice);
    menu.appendChild(btnChat);
    menu.appendChild(btnHuman);

    // Primary Floating Action Button
    const fab = document.createElement('button');
    fab.innerHTML = '<span style="font-size:24px;">✨</span>';
    fab.style.width = '64px';
    fab.style.height = '64px';
    fab.style.borderRadius = '50%';
    fab.style.backgroundColor = '#1a73e8';
    fab.style.color = '#ffffff';
    fab.style.border = 'none';
    fab.style.boxShadow = '0 4px 12px rgba(26,115,232,0.4)';
    fab.style.cursor = 'pointer';
    fab.style.display = 'flex';
    fab.style.alignItems = 'center';
    fab.style.justifyContent = 'center';
    fab.style.transition = 'all 0.2s';
    container.appendChild(fab);

    // Hover Animations
    fab.onmouseover = () => { fab.style.transform = 'scale(1.05)'; fab.style.boxShadow = '0 6px 16px rgba(26,115,232,0.5)'; };
    fab.onmouseout = () => { fab.style.transform = 'scale(1)'; fab.style.boxShadow = '0 4px 12px rgba(26,115,232,0.4)'; };

    // Toggle Menu Expansion
    let menuOpen = false;
    fab.onclick = () => {
      menuOpen = !menuOpen;
      if (menuOpen) {
        menu.style.display = 'flex';
        setTimeout(() => {
          menu.style.opacity = '1';
          menu.style.transform = 'scale(1)';
        }, 10);
        fab.innerHTML = '<span style="font-size:24px;">✕</span>';
      } else {
        menu.style.opacity = '0';
        menu.style.transform = 'scale(0.9)';
        setTimeout(() => { menu.style.display = 'none'; }, 200);
        fab.innerHTML = '<span style="font-size:24px;">✨</span>';
      }
    };

    // Voice Engine Logic
    btnVoice.onclick = async () => {
      const titleSpan = btnVoice.querySelector('.card-title');
      if(titleSpan) titleSpan.innerHTML = 'Connecting to Cortex...';
      
      try {
        if (!window.vapi) throw new Error('Vapi Core Missing');
        // @ts-ignore
        vapiInstance = new window.vapi('${VAPI_PUBLIC_KEY}');
        await vapiInstance.start('${agentId}');
        
        if(titleSpan) titleSpan.innerHTML = '🔴 Call Active (Tap to End)';
        btnVoice.style.borderLeft = '4px solid #d93025';
        isCallActive = true;

        vapiInstance.on('call-end', () => {
          if(titleSpan) titleSpan.innerHTML = 'Live Voice AI';
          btnVoice.style.borderLeft = '1px solid #e8eaed';
          // reset border color logic
          isCallActive = false;
        });

      } catch (err) {
        console.error("Master CRM WebRTC Handshake Failed:", err);
        if(titleSpan) titleSpan.innerHTML = 'Live Voice AI';
      }
    };

    btnChat.onclick = () => {
      alert("AI Text Chat terminal is initializing... (Phase 12 deployment pending)");
    };

    btnHuman.onclick = () => {
      alert("Human requested. Connecting...");
    };
  }

  function createCardBtn(emoji, title, desc, iconBg, hoverBg) {
    const card = document.createElement('div');
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '6px';
    card.style.padding = '16px';
    card.style.backgroundColor = '#ffffff';
    card.style.border = '1px solid #e8eaed';
    card.style.borderRadius = '12px';
    card.style.cursor = 'pointer';
    card.style.transition = 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)';
    card.style.width = '280px';
    card.style.textAlign = 'left';
    card.style.boxShadow = '0 1px 3px rgba(60,64,67,0.05)';
    
    card.onmouseover = () => {
      card.style.backgroundColor = hoverBg;
      card.style.borderColor = iconBg;
      card.style.transform = 'translateY(-2px)';
      card.style.boxShadow = '0 6px 16px rgba(60,64,67,0.1)';
    };
    card.onmouseout = () => {
      card.style.backgroundColor = '#ffffff';
      card.style.borderColor = '#e8eaed';
      card.style.transform = 'translateY(0)';
      card.style.boxShadow = '0 1px 3px rgba(60,64,67,0.05)';
    };

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.gap = '12px';
    header.innerHTML = '<div style="width:36px;height:36px;border-radius:50%;background:'+iconBg+'15;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">'+emoji+'</div><span class="card-title" style="font-weight:600;font-size:15px;color:#202124;">'+title+'</span>';
    
    const bodyText = document.createElement('div');
    bodyText.style.fontSize = '12.5px';
    bodyText.style.color = '#5f6368';
    bodyText.style.lineHeight = '1.5';
    bodyText.style.paddingLeft = '48px';
    bodyText.innerHTML = desc;

    card.appendChild(header);
    card.appendChild(bodyText);

    return card;
  }
})();
    `;

    return new NextResponse(widgetJS, {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-store'
      }
    });

  } catch (error: any) {
    console.error("[WIDGET SERVER ERROR]", error.message);
    return new NextResponse('console.log("AI Pilots: Widget Server Offline");', {
      headers: { 'Content-Type': 'application/javascript' }
    });
  }
}
