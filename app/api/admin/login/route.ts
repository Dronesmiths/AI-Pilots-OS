/* eslint-disable @typescript-eslint/no-explicit-any */
 
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      console.error("ADMIN_EMAIL or ADMIN_PASSWORD not configured in .env");
      return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
    }

    if (
      email.toLowerCase().trim() !== adminEmail.toLowerCase().trim() || 
      password !== adminPassword
    ) {
      return NextResponse.json({ error: 'Invalid master credentials.' }, { status: 401 });
    }

    const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';

    // Sign a powerful admin token
    const token = jwt.sign(
      { role: 'superadmin', email: adminEmail },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    (await cookies()).set({
      name: 'admin_token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 // 24 hours
    });

    return NextResponse.json({ success: true, message: 'Authenticated successfully' });
  } catch (error: any) {
    console.error("[ADMIN LOGIN ERROR]", error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
