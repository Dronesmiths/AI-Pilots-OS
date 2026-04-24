"use client";

import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import { CheckCircle, ShieldCheck, Mail, Globe, Clock, Server } from 'lucide-react';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string);

export default function StandardCheckoutPage() {
  const [clientSecret, setClientSecret] = useState('');

  useEffect(() => {
    fetch('/api/checkout/session', {
      method: 'POST',
    })
      .then((res) => res.json())
      .then((data) => setClientSecret(data.clientSecret));
  }, []);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 py-12 px-4 font-sans selection:bg-teal-200">
      <div className="max-w-5xl mx-auto">
        
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 shadow-lg shadow-teal-500/20 mb-6">
            <Server className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 mb-4">
            Standard Website Package
          </h1>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto">
            Everything your business needs to establish a professional, secure, and lightning-fast presence online. Billed annually.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 items-start">
          
          {/* Left Column: Package Details */}
          <div className="w-full lg:w-1/3 bg-white rounded-3xl p-8 shadow-xl shadow-slate-200/50 border border-slate-100 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-teal-50 rounded-full blur-3xl -mr-10 -mt-10 opacity-70 pointer-events-none"></div>
            
            <h2 className="text-2xl font-bold text-slate-900 mb-2 relative z-10">What's Included</h2>
            <div className="text-4xl font-extrabold text-teal-600 mb-8 relative z-10">$250<span className="text-lg text-slate-400 font-medium">/year</span></div>
            
            <ul className="space-y-6 relative z-10">
              <li className="flex items-start gap-3">
                <Globe className="w-6 h-6 text-teal-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-slate-800">Custom Domain Name</h4>
                  <p className="text-sm text-slate-500 mt-1">Professional .com or local domain setup</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <ShieldCheck className="w-6 h-6 text-teal-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-slate-800">Enterprise SSL Security</h4>
                  <p className="text-sm text-slate-500 mt-1">Bank-level encryption for your visitors</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Mail className="w-6 h-6 text-teal-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-slate-800">Branded Email</h4>
                  <p className="text-sm text-slate-500 mt-1">Professional inbox (you@yourdomain.com)</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle className="w-6 h-6 text-teal-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-slate-800">Up to 5 Custom Pages</h4>
                  <p className="text-sm text-slate-500 mt-1">Home, About, Services, Contact, and more</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="w-6 h-6 text-teal-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-slate-800">Yearly Maintenance</h4>
                  <p className="text-sm text-slate-500 mt-1">Server hosting, uptime monitoring, and updates</p>
                </div>
              </li>
            </ul>
          </div>

          {/* Right Column: Stripe Embedded Checkout */}
          <div className="w-full lg:w-2/3 bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden min-h-[600px]">
            {clientSecret ? (
              <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
                <EmbeddedCheckout className="w-full h-full" />
              </EmbeddedCheckoutProvider>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[600px] text-slate-400">
                <div className="w-10 h-10 border-4 border-teal-200 border-t-teal-500 rounded-full animate-spin mb-4"></div>
                <p className="font-medium animate-pulse">Initializing secure checkout...</p>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
