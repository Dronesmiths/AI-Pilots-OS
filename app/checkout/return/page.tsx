"use client";

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import Link from 'next/link';

function CheckoutReturnContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4 selection:bg-teal-200">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl shadow-slate-200/50 border border-slate-100 text-center animate-in fade-in zoom-in duration-500">
        <div className="w-20 h-20 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="w-10 h-10 text-teal-600" />
        </div>
        
        <h1 className="text-3xl font-extrabold text-slate-900 mb-2">Payment Successful!</h1>
        <p className="text-slate-500 mb-8">
          Welcome aboard! Your Standard Website Package is now active. We've sent a receipt to your email address and our team has been notified to begin provisioning your new website.
        </p>

        <div className="bg-slate-50 rounded-2xl p-4 mb-8 text-left border border-slate-100">
          <h3 className="font-semibold text-slate-800 mb-1">What happens next?</h3>
          <p className="text-sm text-slate-500">
            Our team will reach out shortly to secure your domain name and start the setup process for your 5 custom pages and branded email.
          </p>
        </div>

        <Link 
          href="/"
          className="inline-flex items-center justify-center w-full gap-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
        >
          Return to Homepage
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}

export default function CheckoutReturnPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <CheckoutReturnContent />
    </Suspense>
  );
}
