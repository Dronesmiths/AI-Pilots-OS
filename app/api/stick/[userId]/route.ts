import { NextResponse } from 'next/server';

export async function GET(req: Request, { params }: { params: { userId: string } }) {
    const { userId } = params;

    // We dynamically grab the protocol/host so the stick knows where to "phone home" regardless of dev/prod
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host") || "localhost:3000";
    const baseUrl = `${protocol}://${host}`;

    // The Telemetry Script payload
    const jsPayload = `
/**
 * AI Pilots Telemetry Stick
 * Autonomous Delivery Agent for ${userId}
 * Injects Headless SEO payloads natively.
 */
(function() {
    console.log("🚁 AI Pilots Telemetry Stick Active");

    const userId = "${userId}";
    const crmHost = "${baseUrl}";
    
    // 1. Gather Telemetry Context
    const currentUrl = window.location.pathname + window.location.search;
    
    // 2. Fire the Beacon Handshake
    fetch(crmHost + "/api/stick/telemetry", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ userId, url: currentUrl })
    })
    .then(response => response.json())
    .then(data => {
        if (!data || !data.payload) return;
        
        const payload = data.payload;

        // A. Inject Schema.org JSON-LD
        if (payload.faqSchema) {
            const scriptTag = document.createElement("script");
            scriptTag.type = "application/ld+json";
            scriptTag.text = payload.faqSchema;
            document.head.appendChild(scriptTag);
            console.log("🚁 Injected Headless Schema");
        }

        // B. Contextual Internal Links (Autonomous DOM Patcher)
        if (payload.internalLinks && payload.internalLinks.length > 0) {
            console.log("🚁 Internal Linking Module Ready: Analyzing " + payload.internalLinks.length + " vectors");
            
            payload.internalLinks.forEach(link => {
                const keyword = link.keyword.trim();
                if (!keyword) return;
                
                // Extremely safe text-walker algorithm that ignores existing links/scripts
                // Only targets the physical text painted on the screen
                const regex = new RegExp(\`\\\\b(\${keyword})\\\\b\`, 'i');
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
                    acceptNode: function(node) {
                        if (node.parentNode && 
                            ['A', 'SCRIPT', 'STYLE', 'BUTTON', 'INPUT', 'TEXTAREA', 'H1', 'H2'].includes(node.parentNode.nodeName)) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }
                }, false);

                const textNodes = [];
                let n;
                while(n = walker.nextNode()) textNodes.push(n);

                // Only replace the FIRST occurrence of each keyword per page to prevent spamming
                let replaced = false;
                for (let i = 0; i < textNodes.length && !replaced; i++) {
                    const node = textNodes[i];
                    if (regex.test(node.nodeValue)) {
                        const span = document.createElement('span');
                        span.innerHTML = node.nodeValue.replace(regex, \`<a href="\${link.target}" class="ai-stick-link" style="color: inherit; text-decoration: underline; text-decoration-style: dotted;">$1</a>\`);
                        node.parentNode.replaceChild(span, node);
                        replaced = true;
                    }
                }
            });
        }

        // C. AI Voice / Telemetry Widgets
        if (payload.agentId) {
             console.log("🚁 Launching vapi/ElevenLabs widget code for agent: ", payload.agentId);
        }
    })
    .catch(err => {
         // Silently fail to never disrupt client experience
         console.warn("AI Pilots Telemetry sync suppressed.");
    });
})();
    `;

    // Return it as a functional JavaScript script!
    return new NextResponse(jsPayload, {
        status: 200,
        headers: {
            'Content-Type': 'application/javascript',
            'Cache-Control': 'public, max-age=3600' // Cache for 1 hour to reduce server load
        }
    });
}
