/* eslint-disable @typescript-eslint/no-explicit-any */
 
'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function AdminDashboard() {
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', email: '', twilio: '', agentId: '' });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [quickOnboard, setQuickOnboard] = useState({ name: '', domain: '', repoUrl: '', branch: '', email: '', notes: '' });

  useEffect(() => {
    fetch(`/api/admin/users?t=${new Date().getTime()}`, { cache: 'no-store' })
      .then(async res => {
        if (!res.ok) {
          if (res.status === 401) {
            window.location.href = '/admin/login';
            throw new Error('Unauthorized');
          }
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Fatal Server Error 500: Check Backend Logs');
        }
        return res.json();
      })
      .then(data => {
        const fetchedUsers = data.users || [];
        const sortedUsers = fetchedUsers.sort((a: any, b: any) => {
           const aIsLegacy = a.email?.toLowerCase().includes('legacy-import');
           const bIsLegacy = b.email?.toLowerCase().includes('legacy-import');
           
           const aIsMaster = !aIsLegacy && (a.name?.toLowerCase().includes('ai pilots') || a.email?.toLowerCase().includes('aipilots'));
           const bIsMaster = !bIsLegacy && (b.name?.toLowerCase().includes('ai pilots') || b.email?.toLowerCase().includes('aipilots'));
           
           if (aIsMaster && !bIsMaster) return -1;
           if (!aIsMaster && bIsMaster) return 1;
           if (aIsLegacy && !bIsLegacy) return 1;
           if (!aIsLegacy && bIsLegacy) return -1;
           return 0;
        });
        setUsers(sortedUsers);
        setIsLoading(false);
      })
      .catch(err => {
        toast.error(err.message);
        setIsLoading(false);
      });
  }, []);

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const loadToast = toast.loading('Securely importing client...', { style: { borderRadius: '8px', background: '#333', color: '#fff' }});
    try {
      const res = await fetch('/api/admin/add-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newClient.name,
          email: newClient.email,
          twilioNumber: newClient.twilio,
          vapiAgentId: newClient.agentId
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      toast.success('Client provisioned successfully!', { id: loadToast });
      setUsers([data.client, ...users]);
      setShowAddModal(false);
      setNewClient({ name: '', email: '', twilio: '', agentId: '' });
    } catch (err: any) {
      toast.error(err.message, { id: loadToast });
    }
  };

  const handleQuickOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    const loadToast = toast.loading('Initializing Fast-Lane Onboarding...', { style: { borderRadius: '8px', background: '#333', color: '#fff' }});
    try {
      const res = await fetch('/api/admin/quick-onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quickOnboard)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      toast.success('Architecture staged. Awaiting Approval.', { id: loadToast });
      setUsers([data.client, ...users]);
      setShowCreateModal(false);
      setQuickOnboard({ name: '', domain: '', repoUrl: '', branch: '', email: '', notes: '' });
      router.push(`/admin/user/${data.client._id}?tab=onboarding`);
    } catch (err: any) {
      toast.error(err.message, { id: loadToast });
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
         <div style={{ width: '40px', height: '40px', border: '4px solid rgba(66, 133, 244, 0.2)', borderTop: '4px solid #4285f4', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
      </div>
    );
  }

  const toggleWidget = async (userId: string, currentStatus: boolean) => {
    setUsers(users.map(u => u._id === userId ? { ...u, widgetEnabled: !currentStatus } : u));
    try {
      await fetch('/api/admin/toggle-widget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, widgetEnabled: !currentStatus })
      });
      toast.success(currentStatus ? 'Widget Securely Disabled' : 'Widget Synchronized & Live', { style: { borderRadius: '8px', background: '#333', color: '#fff' }});
    } catch (err) {
      toast.error('Failed to toggle widget matrix');
      setUsers(users.map(u => u._id === userId ? { ...u, widgetEnabled: currentStatus } : u));
    }
  };

  const copyWidgetCode = (userId: string) => {
    const code = `<script src="https://ai-pilots-crm.vercel.app/api/widget/${userId}"></script>`;
    navigator.clipboard.writeText(code);
    toast.success('Widget HTML snippet secured to clipboard!', { style: { borderRadius: '8px', background: '#333', color: '#fff' }});
  };

  return (
    <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '400', color: '#202124', margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>Global Clients</h1>
          <p style={{ color: '#5f6368', margin: 0, fontSize: '15px' }}>
            Master overview of all provisioned accounts and digital assets.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link
            href="/admin/observatory"
            style={{ background: '#f8f9fa', color: '#3c4043', border: '1px solid #dadce0', padding: '10px 20px', borderRadius: '24px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s', textDecoration: 'none' }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#f1f3f4'; }}
            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#f8f9fa'; }}
          >
            🔭 Observatory
          </Link>
          <button 
            onClick={() => setShowAddModal(true)}
            style={{ background: '#f8f9fa', color: '#3c4043', border: '1px solid #dadce0', padding: '10px 20px', borderRadius: '24px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#f1f3f4'; }}
            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#f8f9fa'; }}
          >
            + Import Legacy
          </button>
          
          <button 
            onClick={() => setShowCreateModal(true)}
            style={{ background: '#1a73e8', color: '#ffffff', border: 'none', padding: '10px 24px', borderRadius: '24px', fontWeight: '500', fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3)', transition: 'background-color 0.2s, box-shadow 0.2s' }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#1b66c9'; e.currentTarget.style.boxShadow = '0 1px 3px 1px rgba(60,64,67,0.15)'; }}
            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#1a73e8'; e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(60,64,67,0.3)'; }}
          >
            <span style={{ fontSize: '18px' }}>⚡</span> Quick Onboard
          </button>
        </div>
      </div>

      {/* ── CREATE NEW CLIENT MODAL ── */}
      {showCreateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(32,33,36,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#ffffff', padding: '32px', borderRadius: '12px', width: '450px', boxShadow: '0 4px 24px rgba(0,0,0,0.2)' }}>
            <h2 style={{ color: '#202124', marginTop: 0, marginBottom: '8px', fontSize: '22px', fontWeight: '400' }}>Fast-Lane Onboarding</h2>
            <p style={{ color: '#5f6368', fontSize: '14px', marginBottom: '24px' }}>Provide a unified payload. Nova will inspect the architecture and stage the tenant autonomously.</p>
            
            <form onSubmit={handleQuickOnboard} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#5f6368', fontWeight: '500', marginBottom: '4px' }}>Client Name <span style={{ color: '#d93025' }}>*</span></label>
                <input required type="text" placeholder="Acme Construction" value={quickOnboard.name} onChange={e => setQuickOnboard({...quickOnboard, name: e.target.value})} style={{ width: '100%', padding: '12px 14px', borderRadius: '4px', border: '1px solid #dadce0', background: '#fff', color: '#202124', fontSize: '15px', outline: 'none' }} onFocus={(e) => e.target.style.border = '2px solid #1a73e8'} onBlur={(e) => e.target.style.border = '1px solid #dadce0'} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#5f6368', fontWeight: '500', marginBottom: '4px' }}>Target Domain <span style={{ color: '#d93025' }}>*</span></label>
                <input required type="text" placeholder="acmebuilds.com" value={quickOnboard.domain} onChange={e => setQuickOnboard({...quickOnboard, domain: e.target.value})} style={{ width: '100%', padding: '12px 14px', borderRadius: '4px', border: '1px solid #dadce0', background: '#fff', color: '#202124', fontSize: '15px', outline: 'none' }} onFocus={(e) => e.target.style.border = '2px solid #1a73e8'} onBlur={(e) => e.target.style.border = '1px solid #dadce0'} />
              </div>
              
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#5f6368', fontWeight: '500', marginBottom: '4px' }}>GitHub Repo URL <span style={{ color: '#d93025' }}>*</span></label>
                  <input required type="text" placeholder="https://github.com/..." value={quickOnboard.repoUrl} onChange={e => setQuickOnboard({...quickOnboard, repoUrl: e.target.value})} style={{ width: '100%', padding: '12px 14px', borderRadius: '4px', border: '1px solid #dadce0', background: '#fff', color: '#202124', fontSize: '15px', outline: 'none' }} onFocus={(e) => e.target.style.border = '2px solid #1a73e8'} onBlur={(e) => e.target.style.border = '1px solid #dadce0'} />
                </div>
                <div style={{ width: '100px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#5f6368', fontWeight: '500', marginBottom: '4px' }}>Branch</label>
                  <input placeholder="main" value={quickOnboard.branch} onChange={e => setQuickOnboard({...quickOnboard, branch: e.target.value})} style={{ width: '100%', padding: '12px 14px', borderRadius: '4px', border: '1px solid #dadce0', background: '#fff', color: '#202124', fontSize: '15px', outline: 'none' }} onFocus={(e) => e.target.style.border = '2px solid #1a73e8'} onBlur={(e) => e.target.style.border = '1px solid #dadce0'} />
                </div>
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#5f6368', fontWeight: '500', marginBottom: '4px' }}>Contact Email (Optional)</label>
                <input type="email" placeholder="ceo@acmebuilds.com" value={quickOnboard.email} onChange={e => setQuickOnboard({...quickOnboard, email: e.target.value})} style={{ width: '100%', padding: '12px 14px', borderRadius: '4px', border: '1px solid #dadce0', background: '#fff', color: '#202124', fontSize: '15px', outline: 'none' }} onFocus={(e) => e.target.style.border = '2px solid #1a73e8'} onBlur={(e) => e.target.style.border = '1px solid #dadce0'} />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#5f6368', fontWeight: '500', marginBottom: '4px' }}>Primary Architectural Directives (Optional)</label>
                <textarea rows={3} placeholder="Local general contractor expanding out to multiple counties." value={quickOnboard.notes} onChange={e => setQuickOnboard({...quickOnboard, notes: e.target.value})} style={{ width: '100%', padding: '12px 14px', borderRadius: '4px', border: '1px solid #dadce0', background: '#fff', color: '#202124', fontSize: '15px', outline: 'none', resize: 'vertical' }} onFocus={(e) => e.target.style.border = '2px solid #1a73e8'} onBlur={(e) => e.target.style.border = '1px solid #dadce0'} />
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                <button type="button" onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', color: '#5f6368', fontWeight: '500', padding: '10px 16px', cursor: 'pointer', borderRadius: '4px' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f1f3f4'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Cancel</button>
                <button type="submit" style={{ background: '#1a73e8', color: '#fff', border: 'none', fontWeight: '500', padding: '10px 24px', cursor: 'pointer', borderRadius: '4px' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1557b0'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1a73e8'}>Start Nova Onboarding</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── IMPORT LEGACY MODAL ── */}
      {showAddModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(32,33,36,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#ffffff', padding: '32px', borderRadius: '12px', width: '450px', boxShadow: '0 4px 24px rgba(0,0,0,0.2)' }}>
            <h2 style={{ color: '#202124', marginTop: 0, marginBottom: '8px', fontSize: '22px', fontWeight: '400' }}>Import Legacy Profile</h2>
            <p style={{ color: '#5f6368', fontSize: '14px', marginBottom: '24px' }}>Manually bind a client signature into the CRM ledger.</p>
            
            <form onSubmit={handleAddClient} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#5f6368', fontWeight: '500', marginBottom: '4px' }}>Client Email</label>
                <input required type="email" placeholder="client@example.com" value={newClient.email} onChange={e => setNewClient({...newClient, email: e.target.value})} style={{ width: '100%', padding: '12px 14px', borderRadius: '4px', border: '1px solid #dadce0', background: '#fff', color: '#202124', fontSize: '15px', outline: 'none' }} onFocus={(e) => e.target.style.border = '2px solid #1a73e8'} onBlur={(e) => e.target.style.border = '1px solid #dadce0'} />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#5f6368', fontWeight: '500', marginBottom: '4px' }}>Client Name</label>
                <input required type="text" placeholder="John Doe" value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} style={{ width: '100%', padding: '12px 14px', borderRadius: '4px', border: '1px solid #dadce0', background: '#fff', color: '#202124', fontSize: '15px', outline: 'none' }} onFocus={(e) => e.target.style.border = '2px solid #1a73e8'} onBlur={(e) => e.target.style.border = '1px solid #dadce0'} />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#5f6368', fontWeight: '500', marginBottom: '4px' }}>Twilio Routing Number (Optional)</label>
                <input type="text" placeholder="+1234567890" value={newClient.twilio} onChange={e => setNewClient({...newClient, twilio: e.target.value})} style={{ width: '100%', padding: '12px 14px', borderRadius: '4px', border: '1px solid #dadce0', background: '#fff', color: '#202124', fontSize: '15px', outline: 'none' }} onFocus={(e) => e.target.style.border = '2px solid #1a73e8'} onBlur={(e) => e.target.style.border = '1px solid #dadce0'} />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#5f6368', fontWeight: '500', marginBottom: '4px' }}>Vapi Agent ID (Optional)</label>
                <input type="text" placeholder="Agent WebRTC Node ID" value={newClient.agentId} onChange={e => setNewClient({...newClient, agentId: e.target.value})} style={{ width: '100%', padding: '12px 14px', borderRadius: '4px', border: '1px solid #dadce0', background: '#fff', color: '#202124', fontSize: '15px', outline: 'none' }} onFocus={(e) => e.target.style.border = '2px solid #1a73e8'} onBlur={(e) => e.target.style.border = '1px solid #dadce0'} />
              </div>
              
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowAddModal(false)} style={{ background: 'transparent', color: '#1a73e8', border: 'none', padding: '10px 16px', borderRadius: '4px', fontWeight: '500', cursor: 'pointer', transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>Cancel</button>
                <button type="submit" style={{ background: '#1a73e8', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: '4px', fontWeight: '500', cursor: 'pointer', boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3)', transition: 'background-color 0.2s' }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1b66c9'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1a73e8'}>Import Client</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Top Level Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '32px' }}>
        
        {/* Total Clients / API */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #dadce0', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 2px 0 rgba(60,64,67,0.1)' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: '#5f6368', textTransform: 'uppercase', marginBottom: '8px' }}>Provisioned Clients</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <span style={{ fontSize: '36px', fontWeight: '400', color: '#1a73e8', lineHeight: '1' }}>{users.length}</span>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#137333', backgroundColor: '#e6f4ea', padding: '4px 8px', borderRadius: '12px', border: '1px solid #ceead6' }}>LIVE CORE</span>
          </div>
        </div>

        {/* Voice Agents */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #dadce0', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 2px 0 rgba(60,64,67,0.1)' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: '#5f6368', textTransform: 'uppercase', marginBottom: '8px' }}>Active Voice Agents</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <span style={{ fontSize: '36px', fontWeight: '400', color: '#ea4335', lineHeight: '1' }}>{users.filter(u => u.vapiAgentId && u.vapiAgentId !== 'None').length}</span>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#137333', backgroundColor: '#e6f4ea', padding: '4px 8px', borderRadius: '12px', border: '1px solid #ceead6' }}>WEB RTC</span>
          </div>
        </div>

        {/* Websites Managed */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #dadce0', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 2px 0 rgba(60,64,67,0.1)' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: '#5f6368', textTransform: 'uppercase', marginBottom: '8px' }}>Website Portfolios</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <span style={{ fontSize: '36px', fontWeight: '400', color: '#fbbc05', lineHeight: '1' }}>{users.filter(u => u.seoEngine || u.targetDomain).length}</span>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#137333', backgroundColor: '#e6f4ea', padding: '4px 8px', borderRadius: '12px', border: '1px solid #ceead6' }}>DOMAINS SECURED</span>
          </div>
        </div>

        {/* SEO Engines */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #dadce0', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 2px 0 rgba(60,64,67,0.1)' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: '#5f6368', textTransform: 'uppercase', marginBottom: '8px' }}>SEO Engines Running</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <span style={{ fontSize: '36px', fontWeight: '400', color: '#137333', lineHeight: '1' }}>{users.filter(u => u.seoEngine && u.seoAutomation).length}</span>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#137333', backgroundColor: '#e6f4ea', padding: '4px 8px', borderRadius: '12px', border: '1px solid #ceead6' }}>24/7 AUTOMATION</span>
          </div>
        </div>

      </div>

      <div style={{ backgroundColor: '#ffffff', border: '1px solid #dadce0', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 1px 2px 0 rgba(60,64,67,0.1)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '1px solid #dadce0' }}>
              <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: '500', color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Client Configuration</th>
              <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: '500', color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Number Linked</th>
              <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: '500', color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Domains Sync</th>
              <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: '500', color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.5px' }}>SEO Crawler Hub</th>
              <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: '500', color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Vapi Logic Node</th>
              <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: '500', color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '48px', textAlign: 'center', color: '#5f6368', fontSize: '15px' }}>No clients bound to this ledger.</td>
              </tr>
            ) : (
              users.map(user => {
                const isLegacy = user.email?.toLowerCase().includes('legacy-import');
                const isMaster = !isLegacy && (user.name?.toLowerCase().includes('ai pilots') || user.email?.toLowerCase().includes('aipilots'));
                return (
                <tr key={user._id} style={{ borderBottom: isMaster ? '2px solid #fbbc05' : '1px solid #e8eaed', transition: 'background-color 0.2s', backgroundColor: isMaster ? '#fef7e0' : (isLegacy ? '#fef7e0' : '#ffffff') }}>
                  <td style={{ padding: '16px 24px' }}>
                    <div style={{ fontWeight: isMaster ? '700' : '500', color: isMaster ? '#b06000' : '#202124', marginBottom: '2px', fontSize: '15px' }}>
                      {user.name || 'Unknown User'} {isMaster && <span style={{ fontSize: '14px', marginLeft: '4px' }} title="Master CRM Administrator">👑</span>}
                    </div>
                    <div style={{ fontSize: '13px', color: isMaster ? '#b06000' : '#5f6368' }}>{user.email}</div>
                  </td>
                  <td style={{ padding: '16px 24px' }}>
                    {(user.agents?.[0]?.twilioNumber || user.twilioNumber) ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', border: '1px solid #dadce0', padding: '6px 12px', borderRadius: '16px', fontSize: '13px', color: '#1a73e8', fontFamily: 'monospace', fontWeight: '500', backgroundColor: '#f8f9fa' }}>
                         📞 {user.agents?.[0]?.twilioNumber || user.twilioNumber}
                      </div>
                    ) : (
                      <Link 
                        href={`/admin/user/${user._id}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', border: '1px dashed #1a73e8', padding: '6px 12px', borderRadius: '16px', fontSize: '13px', color: '#1a73e8', fontWeight: '600', backgroundColor: '#e8f0fe', textDecoration: 'none', cursor: 'pointer', transition: 'background-color 0.2s' }}
                        onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#d2e3fc'; }}
                        onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#e8f0fe'; }}
                      >
                         📞 Setup Phone Link
                      </Link>
                    )}
                  </td>
                  <td style={{ padding: '16px 24px' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '500', color: '#137333', backgroundColor: '#e6f4ea', padding: '6px 12px', borderRadius: '16px', border: '1px solid #ceead6' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#137333' }}></div>
                      Live (Cloudflare)
                    </div>
                  </td>
                  <td style={{ padding: '16px 24px' }}>
                    <Link 
                      href={`/admin/user/${user._id}?tab=seo`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '500', color: '#a142f4', backgroundColor: '#f3e8fd', padding: '6px 12px', borderRadius: '16px', border: '1px solid #e9d2fd', textDecoration: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
                      onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#e9d2fd'; }}
                      onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#f3e8fd'; }}
                      title="View Generated SEO Pages"
                    >
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#a142f4' }}></div>
                      Generate Report
                    </Link>
                  </td>
                  <td style={{ padding: '16px 24px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '500', color: '#b06000', backgroundColor: '#fef7e0', padding: '6px 12px', borderRadius: '16px', border: '1px solid #feefc3', width: 'fit-content' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#b06000' }}></div>
                        WebRTC Ready
                      </div>
                      {(user.agents?.[0]?.vapiAgentId || user.vapiAgentId) ? (
                        <span style={{ fontSize: '11px', color: '#5f6368', fontFamily: 'monospace', paddingLeft: '4px' }}>
                          ID: {`${(user.agents?.[0]?.vapiAgentId || user.vapiAgentId).substring(0, 8)}...`}
                        </span>
                      ) : (
                        <Link href={`/admin/user/${user._id}`} style={{ fontSize: '11px', color: '#d93025', fontWeight: 'bold', textDecoration: 'none', paddingLeft: '4px', cursor: 'pointer' }}>
                          + Bind Vapi ID
                        </Link>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8f9fa', padding: '4px 8px', borderRadius: '16px', border: '1px solid #dadce0' }}>
                          <span style={{ fontSize: '10px', color: '#5f6368', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>WebRTC</span>
                          <div 
                            onClick={() => toggleWidget(user._id, !!user.widgetEnabled)}
                            style={{
                              width: '32px', height: '18px', borderRadius: '10px',
                              backgroundColor: user.widgetEnabled ? '#1a73e8' : '#dadce0',
                              position: 'relative', cursor: 'pointer', transition: 'background-color 0.2s',
                              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)'
                            }}
                            title={user.widgetEnabled ? "Disable Widget on Client Site" : "Activate Widget"}
                          >
                            <div style={{
                              width: '14px', height: '14px', borderRadius: '50%', backgroundColor: '#fff',
                              position: 'absolute', top: '2px', left: user.widgetEnabled ? '16px' : '2px',
                              transition: 'left 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                            }} />
                          </div>
                        </div>
                        <button 
                          onClick={() => copyWidgetCode(user._id)}
                          style={{ backgroundColor: '#e8f0fe', border: '1px dashed #1a73e8', borderRadius: '6px', padding: '4px 8px', fontSize: '11px', color: '#1a73e8', cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s' }}
                          title="Copy Embed Snippet"
                          onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#d2e3fc'; }}
                          onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#e8f0fe'; }}
                        >
                          &lt;/&gt;
                        </button>
                      </div>
                      <Link 
                        href={`/admin/user/${user._id}`}
                      style={{ 
                        backgroundColor: '#fff', 
                        border: '1px solid #dadce0', 
                        color: '#1a73e8', 
                        padding: '8px 16px', 
                        borderRadius: '4px', 
                        fontSize: '13px',
                        fontWeight: '500', 
                        cursor: 'pointer',
                        textDecoration: 'none',
                        transition: 'all 0.2s',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                      onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#f8f9fa'; }}
                      onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#fff'; }}
                    >
                      Access Dashboard
                    </Link>
                    </div>
                  </td>
                </tr>
              )})
            )}
          </tbody>
        </table>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
        tbody tr:hover {
          background-color: #f8f9fa !important;
        }
      `}} />
    </div>
  );
}
