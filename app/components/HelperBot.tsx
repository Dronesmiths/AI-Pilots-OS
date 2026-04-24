'use client';
import { useState } from 'react';

export default function HelperBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', text: `Hi there! 👋 I'm your AI Setup Assistant!` },
    { role: 'assistant', text: `See that glowing "Configure AI Settings" button at the top of your dashboard? Click it right now to fully customize your new Voice Agent!` }
  ]);
  const [inputText, setInputText] = useState('');

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    
    setMessages([...messages, { role: 'user', text: inputText }]);
    setInputText('');
    
    // Simple logic routing
    setTimeout(() => {
      setMessages(prev => [...prev, { role: 'assistant', text: "Right now, your absolute best step is clicking that glowing 'Configure AI Settings' button so we can dial in your custom scripts and voice tone!" }]);
    }, 1000);
  };

  return (
    <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {isOpen ? (
        <div style={{ width: '340px', height: '480px', background: 'white', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          
          <div style={{ background: '#2563eb', color: 'white', padding: '16px 20px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px' }}>🤖</span>
              <span style={{ fontSize: '16px', letterSpacing: '0.5px' }}>Setup Assistant</span>
            </div>
            <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '16px', opacity: 0.8 }}>✖</button>
          </div>
          
          <div style={{ flex: 1, padding: '20px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', background: '#f8fafc' }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ 
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', 
                background: msg.role === 'user' ? '#2563eb' : 'white', 
                color: msg.role === 'user' ? 'white' : '#1e293b', 
                border: msg.role === 'user' ? 'none' : '1px solid #e2e8f0', 
                padding: '12px 16px', 
                borderRadius: '14px', 
                borderBottomRightRadius: msg.role === 'user' ? '4px' : '14px', 
                borderBottomLeftRadius: msg.role === 'assistant' ? '4px' : '14px', 
                maxWidth: '85%', 
                fontSize: '14px', 
                lineHeight: '1.5', 
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)' 
              }}>
                {msg.text}
              </div>
            ))}
          </div>

          <form onSubmit={handleSend} style={{ padding: '16px', background: 'white', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px' }}>
            <input 
              type="text" 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ask for help..." 
              style={{ flex: 1, padding: '12px 16px', borderRadius: '99px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '14px', background: '#f8fafc', transition: 'border 0.2s' }}
              onFocus={(e) => e.target.style.border = '1px solid #2563eb'}
              onBlur={(e) => e.target.style.border = '1px solid #e2e8f0'}
            />
            <button type="submit" style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '50%', width: '42px', height: '42px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', transition: 'transform 0.2s' }} onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'} onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}>
              ↑
            </button>
          </form>
        </div>
      ) : (
        <button 
          onClick={() => setIsOpen(true)}
          className="btn-glow"
          style={{ width: '64px', height: '64px', borderRadius: '32px', background: '#2563eb', color: 'white', border: 'none', cursor: 'pointer', fontSize: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(37,99,235,0.4)', transition: 'transform 0.2s' }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          🤖
        </button>
      )}
    </div>
  );
}
