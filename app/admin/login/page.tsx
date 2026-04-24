 
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (res.ok) {
        toast.success('Access Granted. Redirecting securely...');
        setTimeout(() => {
          window.location.href = '/admin';
        }, 1000);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Authentication failed.');
        setIsLoading(false);
      }
    } catch (err) {
      toast.error('Network Error.');
      setIsLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f2f5', padding: '20px', fontFamily: '"Inter", -apple-system, sans-serif' }}>
      <Toaster position="top-center" />
      
      <div style={{ 
        maxWidth: '440px', 
        width: '100%', 
        backgroundColor: '#ffffff', 
        borderRadius: '12px', 
        padding: '48px 40px', 
        border: '1px solid #dadce0',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)' 
      }}>
        
        {/* Google-like logo visual header */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <div style={{ 
              width: '48px', 
              height: '48px', 
              borderRadius: '50%', 
              background: 'linear-gradient(135deg, #4285F4 0%, #34A853 33%, #FBBC05 66%, #EA4335 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
                <span style={{ color: 'white', fontSize: '24px' }}>🛡️</span>
            </div>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <h1 style={{ color: '#202124', fontSize: '24px', margin: '0 0 8px 0', fontWeight: '500', letterSpacing: '-0.3px' }}>Command Center</h1>
          <p style={{ color: '#5f6368', fontSize: '15px', margin: '0' }}>Enter your credentials to manage the CRM</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <label style={{ display: 'block', color: '#5f6368', fontSize: '13px', marginBottom: '8px', fontWeight: '500', paddingLeft: '2px' }}>Master Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ 
                width: '100%', 
                padding: '14px 16px', 
                backgroundColor: '#ffffff', 
                border: '1px solid #dadce0', 
                borderRadius: '8px', 
                color: '#202124', 
                fontSize: '15px',
                outline: 'none',
                transition: 'border-color 0.2s',
                lineHeight: '1.5'
              }}
              onFocus={(e) => e.target.style.border = '2px solid #1a73e8'}
              onBlur={(e) => e.target.style.border = '1px solid #dadce0'}
              placeholder="admin@aipilots.site"
            />
          </div>

          <div>
            <label style={{ display: 'block', color: '#5f6368', fontSize: '13px', marginBottom: '8px', fontWeight: '500', paddingLeft: '2px' }}>Passphrase</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ 
                width: '100%', 
                padding: '14px 16px', 
                backgroundColor: '#ffffff', 
                border: '1px solid #dadce0', 
                borderRadius: '8px', 
                color: '#202124', 
                fontSize: '15px',
                outline: 'none',
                transition: 'border-color 0.2s',
                lineHeight: '1.5'
              }}
              onFocus={(e) => e.target.style.border = '2px solid #1a73e8'}
              onBlur={(e) => e.target.style.border = '1px solid #dadce0'}
              placeholder="••••••••"
            />
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            style={{ 
              marginTop: '12px',
              padding: '12px 24px',
              backgroundColor: '#1a73e8',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: '500',
              fontSize: '15px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.7 : 1,
              transition: 'background-color 0.2s, box-shadow 0.2s',
              boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseOver={(e) => { if (!isLoading) e.currentTarget.style.backgroundColor = '#1557b0' }}
            onMouseOut={(e) => { if (!isLoading) e.currentTarget.style.backgroundColor = '#1a73e8' }}
          >
            {isLoading ? 'Verifying...' : 'Authenticate'}
          </button>
        </form>
      </div>
    </div>
  );
}
