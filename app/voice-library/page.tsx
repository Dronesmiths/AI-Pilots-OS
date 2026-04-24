import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import Link from 'next/link';
import VoiceLibraryCard from '../client-dashboard/VoiceLibraryCard'; // Reuse the raw React mechanics directly

export const dynamic = 'force-dynamic';

export default async function VoiceLibraryPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('ai_pilots_client_session')?.value;

  if (!token) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f8fafc' }}>
        <h1 style={{ color: '#0f172a', fontSize: '24px', marginBottom: '16px' }}>Access Denied 🔒</h1>
        <p style={{ color: '#64748b' }}>Please login to view your secure dashboard.</p>
        <Link href="/client-login" style={{ marginTop: '20px', color: '#2563eb', fontWeight: 'bold' }}>&rarr; Login Here</Link>
      </div>
    );
  }

  let clientData: any = null;
  try {
    const jwtSecret = process.env.JWT_SECRET || 'aipilots-temporary-secure-secret-2026';
    const decoded = jwt.verify(token, jwtSecret) as any;
    
    await connectToDatabase();
    clientData = await User.findOne({ email: decoded.email.toLowerCase().trim() });
    
    if (!clientData) {
      throw new Error("Client logic signature fundamentally missing from central Database.");
    }

  } catch (err: any) {
    return (
      <div style={{ padding: '50px', color: 'red' }}>Session expired or fatal connection loss. Please re-login.</div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}>
      <header style={{ background: '#ffffff', padding: '20px 40px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '36px', height: '36px', background: '#2563eb', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '18px' }}>AI</div>
          <h2 style={{ fontSize: '20px', color: '#0f172a', margin: 0, fontWeight: '700', letterSpacing: '-0.5px' }}>AI Pilots</h2>
        </div>
        <Link href="/client-dashboard" style={{ color: '#64748b', textDecoration: 'none', fontWeight: 'bold', fontSize: '14px' }}>
          &larr; Back to Dashboard
        </Link>
      </header>

      <main style={{ maxWidth: '1000px', margin: '40px auto', padding: '0 20px', animation: 'fadeIn 0.5s ease-out' }}>
        <VoiceLibraryCard initialFavorites={clientData.favoriteVoices || []} />
      </main>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
