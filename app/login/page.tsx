'use client';

import { useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    try {
      const res = await fetch('/api/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim() })
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to send login link.');
      
      setSuccess(true);
      toast.success('Login Link Sent!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f172a', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}>
      <Toaster position="top-center" />
      
      <div style={{ width: '100%', maxWidth: '400px', padding: '40px', background: '#1e293b', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', border: '1px solid #334155', animation: 'fadeIn 0.5s ease-out' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <div style={{ width: '48px', height: '48px', background: '#2563eb', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '24px', boxShadow: '0 0 15px rgba(37, 99, 235, 0.5)' }}>AI</div>
        </div>
        
        <h1 style={{ color: '#f8fafc', fontSize: '24px', textAlign: 'center', margin: '0 0 8px 0', fontWeight: 'bold', letterSpacing: '-0.5px' }}>Client Portal Login</h1>
        <p style={{ color: '#94a3b8', fontSize: '14px', textAlign: 'center', margin: '0 0 32px 0', lineHeight: '1.5' }}>Enter the email address you used during checkout to receive a secure, one-click login link.</p>
        
        {success ? (
          <div style={{ background: '#064e3b', border: '1px solid #047857', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
            <p style={{ color: '#a7f3d0', fontSize: '14px', margin: 0 }}>✅ <strong>Link sent successfully!</strong> Please check your email inbox to access your dashboard directly.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', color: '#cbd5e1', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email Address</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com" 
                required
                style={{ width: '100%', padding: '14px 16px', borderRadius: '8px', border: '1px solid #475569', background: '#0f172a', color: '#f8fafc', fontSize: '15px', outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
              />
            </div>
            
            <button 
              type="submit" 
              disabled={loading}
              style={{ width: '100%', padding: '14px', borderRadius: '8px', border: 'none', background: loading ? '#334155' : '#2563eb', color: '#fff', fontSize: '15px', fontWeight: 'bold', cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.2s', marginTop: '8px', boxShadow: loading ? 'none' : '0 4px 14px rgba(37, 99, 235, 0.4)' }}
            >
              {loading ? 'Sending Link...' : 'Send Magic Link ✨'}
            </button>
          </form>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        input:focus { border-color: #3b82f6 !important; }
        button:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(37, 99, 235, 0.5) !important; filter: brightness(1.1); }
      `}</style>
    </div>
  );
}
