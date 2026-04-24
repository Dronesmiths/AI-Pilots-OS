'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function InviteRouter() {
  const params = useParams();
  const code = params.code as string;
  const [dots, setDots] = useState('');

  useEffect(() => {
    // Animate loading dots
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 400);

    // Redirect after 2.5 seconds to build suspense
    const PABBLY_BASE_CHECKOUT_URL = 'https://payments.pabbly.com/subscribe/69bca151d205d17e78d1a81f/monthly-voice-agent-access';
    const redirectUrl = `${PABBLY_BASE_CHECKOUT_URL}?referral_code=${code}`;
    
    const timeout = setTimeout(() => {
      window.location.href = redirectUrl;
    }, 2500);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [code]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f172a', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}>
      <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px', fontSize: '36px', animation: 'pulseRing 1.5s infinite', boxShadow: '0 0 20px rgba(37, 99, 235, 0.4)' }}>🎁</div>
      
      <h1 style={{ color: '#f8fafc', fontSize: '28px', marginBottom: '12px', fontWeight: 'bold' }}>You've been invited!</h1>
      <p style={{ color: '#cbd5e1', fontSize: '16px', marginBottom: '24px' }}>Applying your friend's affiliate code: <span style={{ background: '#1e293b', padding: '4px 10px', borderRadius: '6px', color: '#10b981', fontWeight: 'bold', fontFamily: 'monospace' }}>{code}</span></p>
      
      <div style={{ width: '200px', height: '4px', background: '#334155', borderRadius: '2px', overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ height: '100%', background: '#3b82f6', width: '50%', animation: 'loadingBar 2.5s ease-in forwards' }}></div>
      </div>
      
      <p style={{ color: '#64748b', fontSize: '13px' }}>Forwarding to secure checkout{dots}</p>
      
      <style>{`
        @keyframes pulseRing {
          0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7); }
          70% { box-shadow: 0 0 0 20px rgba(37, 99, 235, 0); }
          100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
        }
        @keyframes loadingBar {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
}
