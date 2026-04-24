'use client';

import Link            from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import toast, { Toaster } from 'react-hot-toast';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [currentTenant, setCurrentTenant] = useState('aipilots');
  // Bootstrap: platform owners see the switcher. Replace with session check once auth is wired.
  const isPlatformOwner = true;
  const [systemStatus, setSystemStatus] = useState({ 
    operational: false, 
    services: { mongodb: false, twilio: false, vapi: false } 
  });
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);

  useEffect(() => {
    fetch('/api/admin/system-status')
      .then(res => res.json())
      .then(data => {
        setSystemStatus(data);
        setIsCheckingStatus(false);
      })
      .catch(err => {
        console.error("Health Check Failed:", err);
        setIsCheckingStatus(false);
      });
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    document.cookie = "admin_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    toast.success('Logged out successfully');
    setTimeout(() => {
      window.location.href = '/admin/login';
    }, 1000);
  };

  const seoItems = [
    { name: 'Nova AI',        path: '/admin/seo/nova',        icon: '🧠' },
    { name: 'Nova Vision',    path: '/admin/seo/nova/vision', icon: '👁️' },
    { name: 'Mission Control',path: '/admin/nova/mission',    icon: '🚀' },
    { name: 'Activity Feed',  path: '/admin/seo/activity',    icon: '🛰️' },
    { name: 'Engine Hub',     path: '/admin/seo',             icon: '⚡' },
  ];


  const voiceItems = [
    { name: 'Conversations', path: '/admin/agents',       icon: '💬' },
  ];

  const getStatusColor = (isOnline: boolean) => isOnline ? '#34a853' : '#ea4335';

  const NavLink = ({ item }: { item: { name: string; path: string; icon: string } }) => {
    const isActive = pathname === item.path || (item.path !== '/admin' && pathname.startsWith(item.path));
    return (
      <Link
        href={item.path}
        style={{
          padding: '10px 24px',
          borderRadius: '0 50px 50px 0',
          color: isActive ? '#1967d2' : '#3c4043',
          backgroundColor: isActive ? '#e8f0fe' : 'transparent',
          textDecoration: 'none',
          fontSize: '13px',
          fontWeight: isActive ? '600' : '500',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          transition: 'background-color 0.2s ease',
          marginLeft: '-12px',
        }}
        onMouseOver={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = '#f1f3f4'; }}
        onMouseOut={(e)  => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        <span style={{ fontSize: '16px', filter: isActive ? 'none' : 'grayscale(100%) opacity(70%)' }}>{item.icon}</span>
        {item.name}
      </Link>
    );
  };

  const SectionLabel = ({ label }: { label: string }) => (
    <div style={{ padding: '16px 12px 6px', fontSize: '10px', fontWeight: '700', color: '#9aa0a6', textTransform: 'uppercase', letterSpacing: '1.2px' }}>
      {label}
    </div>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8f9fa', color: '#202124', fontFamily: '"Google Sans", Roboto, system-ui, sans-serif' }}>
      <Toaster position="top-right" toastOptions={{ style: { background: '#333', color: '#fff', borderRadius: '8px' } }} />

      {/* Sidebar */}
      <aside style={{ width: '260px', backgroundColor: '#ffffff', borderRight: '1px solid #dadce0', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 10 }}>

        {/* Logo */}
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #f1f3f4' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', width: '24px', height: '24px', flexShrink: 0 }}>
            <div style={{ backgroundColor: '#ea4335', borderRadius: '4px 0 0 0' }}></div>
            <div style={{ backgroundColor: '#4285f4', borderRadius: '0 4px 0 0' }}></div>
            <div style={{ backgroundColor: '#fbbc05', borderRadius: '0 0 0 4px' }}></div>
            <div style={{ backgroundColor: '#34a853', borderRadius: '0 0 4px 0' }}></div>
          </div>
          <h1 style={{ fontSize: '18px', fontWeight: '600', margin: 0, color: '#5f6368', letterSpacing: '-0.5px' }}>
            <span style={{ color: '#4285f4' }}>AI</span>
            <span style={{ color: '#5f6368' }}> Pilots</span>
            <span style={{ color: '#34a853', marginLeft: '6px' }}>OS</span>
          </h1>
        </div>

        {/* Nav */}
        <nav style={{ padding: '12px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>

          {/* Top-level */}
          <NavLink item={{ name: 'Clients', path: '/admin', icon: '👥' }} />

          {/* SEO Engine section */}
          <SectionLabel label="SEO Engine" />
          {seoItems.map(item => <NavLink key={item.path} item={item} />)}

          {/* Voice Agent section */}
          <SectionLabel label="Voice Agent" />
          {voiceItems.map(item => <NavLink key={item.path} item={item} />)}

          {/* Nova Command section */}
          <div style={{ padding: '16px 12px 4px', fontSize: '10px', fontWeight: '700', color: '#d97706', textTransform: 'uppercase', letterSpacing: '1.2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: systemStatus.operational ? '#34a853' : '#ea4335', flexShrink: 0 }} />
            Nova Command
          </div>
          <NavLink item={{ name: 'Boardroom',       path: '/admin/boardroom',                          icon: '🏛️' }} />
          <NavLink item={{ name: 'War Room',        path: '/admin/war-room',                           icon: '⚔️' }} />
          <NavLink item={{ name: 'Observatory',     path: '/admin/observatory',                        icon: '🔭' }} />
          <NavLink item={{ name: 'Tenant Settings', path: `/admin/${currentTenant}/settings`,           icon: '🎛️' }} />
          <NavLink item={{ name: 'Nova Activate',   path: '/admin/nova-activate',                      icon: '⚡' }} />
          <NavLink item={{ name: 'Agency Dashboard',path: '/admin/agency/aipilots/dashboard',           icon: '🏢' }} />
          <NavLink item={{ name: 'Reports',         path: '/admin/reports',                             icon: '📊' }} />
          <NavLink item={{ name: 'Prospects',       path: '/admin/prospects',                           icon: '💰' }} />
          <NavLink item={{ name: 'Demo Generator',  path: '/admin/demos',                               icon: '🎯' }} />

          {/* Bottom */}
          <div style={{ marginTop: '8px' }}>
            <NavLink item={{ name: 'System Settings', path: '/admin/settings', icon: '⚙️' }} />
          </div>

        </nav>

        {/* Status + logout */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #dadce0' }}>
          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: '#f8f9fa', border: '1px solid #e8eaed', marginBottom: '12px' }}>
            <div style={{ fontSize: '10px', color: '#5f6368', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>Live Services</div>
            {isCheckingStatus ? (
              <div style={{ color: '#80868b', fontSize: '12px' }}>Pinging...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  { label: 'Database',      ok: systemStatus.services.mongodb },
                  { label: 'Vapi Engine',   ok: systemStatus.services.vapi    },
                  { label: 'Twilio',        ok: systemStatus.services.twilio  },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#3c4043' }}>{s.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: getStatusColor(s.ok), fontSize: '11px', fontWeight: 'bold' }}>
                      <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: getStatusColor(s.ok) }}></div>
                      {s.ok ? 'LIVE' : 'DOWN'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            style={{ width: '100%', padding: '9px 16px', backgroundColor: '#fff', color: '#d93025', border: '1px solid #dadce0', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: isLoggingOut ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#fce8e6'}
            onMouseOut={(e)  => e.currentTarget.style.backgroundColor = '#fff'}
          >
            {isLoggingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: '60px', backgroundColor: '#ffffff', borderBottom: '1px solid #dadce0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px' }}>
          <div style={{ width: '360px', backgroundColor: '#f1f3f4', borderRadius: '8px', padding: '9px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ filter: 'grayscale(100%) opacity(50%)' }}>🔍</span>
            <input type="text" placeholder="Search clients, activity, settings..." style={{ backgroundColor: 'transparent', border: 'none', outline: 'none', width: '100%', fontSize: '14px', color: '#202124' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Tenant switcher — visible to platform owners only */}
            {isPlatformOwner && (
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:10, color:'#9aa0a6', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.8px' }}>Tenant</span>
                <select
                  value={currentTenant}
                  onChange={e => {
                    setCurrentTenant(e.target.value);
                    router.push(`/admin/${e.target.value}/war-room`);
                  }}
                  style={{ padding:'4px 10px', borderRadius:7, fontSize:12, border:'1px solid #dadce0', background:'#f8f9fa', color:'#202124', cursor:'pointer', fontWeight:600 }}
                >
                  <option value="aipilots">AI Pilots</option>
                  <option value="swapp">SWAPP</option>
                  <option value="cas">CAS</option>
                  <option value="platform">Platform (All)</option>
                </select>
              </div>
            )}
            <span style={{ fontSize: '18px', filter: 'grayscale(100%) opacity(50%)', cursor: 'pointer' }}>🔔</span>
            <div style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: '#1a73e8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '15px' }}>A</div>
          </div>
        </header>
        <div style={{ flex: 1, padding: pathname.includes('/nova/vision') ? '0' : '28px 40px', overflowY: 'auto', backgroundColor: pathname.includes('/nova/vision') ? '#050816' : 'transparent' }}>
          {children}
        </div>
      </main>
    </div>
  );
}
