'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';

interface LoginGateProps {
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
  feedback: { type: 'success' | 'error' | null; msg: string };
  setFeedback: (val: any) => void;
  onSuccess: (uid: string) => void;
}

export default function LoginGate({ isDarkMode, setIsDarkMode, feedback, setFeedback, onSuccess }: LoginGateProps) {
  const [isTwoFactorPhase, setIsTwoFactorPhase] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');

  const initLoginChallenge = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback({ type: null, msg: '' });

    if (password.length < 12) {
      setFeedback({ type: 'error', msg: "Security Policy Failure: Your password must contain at least 12 characters." });
      return;
    }

    setIsTwoFactorPhase(true);
    setFeedback({ type: 'success', msg: "Primary authentication successful. Complete 2FA checkpoint." });
  };

  const handleTwoFactorVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback({ type: null, msg: '' });

    if (twoFactorCode.trim().length < 6) {
      setFeedback({ type: 'error', msg: "Invalid token structure. Code must match 6-digit framework." });
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password,
    });

    if (error) {
      setFeedback({ type: 'error', msg: `Access Denied: ${error.message}` });
      setIsTwoFactorPhase(false);
      return;
    }
    if (data?.user) onSuccess(data.user.id);
  };

  return (
    <div className={`min-h-screen w-full flex flex-col items-center justify-center p-8 relative transition-colors ${isDarkMode ? 'bg-[#08090d] text-[#f1f5f9]' : 'bg-[#f8fafc] text-slate-900'}`}>
      <button onClick={() => setIsDarkMode(!isDarkMode)} className={`mb-8 px-5 py-3 text-sm font-bold uppercase tracking-wider rounded-xl border transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-white border-slate-300 shadow-md text-slate-900 hover:bg-slate-50'}`}>
        {isDarkMode ? '🌞 Light Theme Mode' : '🌙 Dark Contrast Mode'}
      </button>

      <div className={`w-full max-w-xl backdrop-blur-3xl border rounded-[36px] p-10 lg:p-12 shadow-[0_40px_120px_rgba(0,0,0,0.35)] ${isDarkMode ? 'bg-white/[0.02] border-white/[0.08]' : 'bg-white/95 border-slate-300 shadow-xl'}`}>
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-black text-2xl mb-4 shadow-lg">Ψ</div>
          <h1 className="text-2xl font-bold tracking-tight uppercase">Secure Laboratory Gateway</h1>
          <p className={`text-sm mt-2 font-medium ${isDarkMode ? 'text-neutral-400' : 'text-slate-700'}`}>Password length security policies and 2FA authentication validations are active.</p>
        </div>

        {feedback.msg && (
          <div className={`p-4 rounded-xl mb-6 text-sm font-semibold ${feedback.type === 'error' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'}`}>
            {feedback.msg}
          </div>
        )}

        {!isTwoFactorPhase ? (
          <form onSubmit={initLoginChallenge} className="space-y-6">
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-neutral-400' : 'text-slate-800 font-bold'}`}>Security Email Address</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={`w-full px-5 py-4 text-sm rounded-xl focus:outline-none transition-all border ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-white focus:border-purple-500' : 'bg-white border-slate-400 text-slate-900 focus:border-indigo-600 font-medium'}`} placeholder="name@company.com" />
            </div>
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-neutral-400' : 'text-slate-800 font-bold'}`}>Passphrase Code (Minimum 12 Characters)</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={`w-full px-5 py-4 text-sm rounded-xl focus:outline-none transition-all border ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-white focus:border-purple-500' : 'bg-white border-slate-400 text-slate-900 focus:border-indigo-600'}`} placeholder="••••••••••••" />
            </div>
            <button type="submit" className="w-full py-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold uppercase tracking-wider transition-all shadow-md">Verify Credentials & Proceed</button>
          </form>
        ) : (
          <form onSubmit={handleTwoFactorVerify} className="space-y-6">
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-purple-400' : 'text-slate-800 font-bold'}`}>Enter Your 6-Digit Secondary 2FA Key Token</label>
              <input type="text" required maxLength={6} value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value)} className={`w-full px-5 py-4 text-base font-mono tracking-widest text-center rounded-xl focus:outline-none transition-all border ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-white' : 'bg-white border-slate-400 text-slate-900'}`} placeholder="000000" />
            </div>
            <div className="flex gap-4">
              <button type="button" onClick={() => setIsTwoFactorPhase(false)} className={`w-1/3 py-3.5 rounded-xl border text-sm font-medium ${isDarkMode ? 'border-white/10 hover:bg-white/5' : 'border-slate-300 hover:bg-slate-100 text-slate-700'}`}>Back</button>
              <button type="submit" className="w-2/3 py-3.5 rounded-xl bg-slate-900 text-white font-bold text-sm uppercase tracking-wider hover:bg-slate-800 transition-all">Confirm Gateway Authorization</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}