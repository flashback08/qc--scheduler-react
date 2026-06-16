'use client';

import React, { useState, useEffect } from 'react';
import { supabase, UserRole } from '@/lib/supabase';
import LoginGate from '@/components/auth/LoginGate';
import DashboardRuntime from '@/app/dashboard/page';

export default function RootPage() {
  const [hasMounted, setHasMounted] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [operatorName, setOperatorName] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('QA_VIEWER');
  const [globalFeedback, setGlobalFeedback] = useState<{ type: 'success' | 'error' | null; msg: string }>({ type: null, msg: '' });

  const verifyAndSetupWorkspace = async (uid: string) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', uid)
        .single();

      if (error || !profile) throw new Error("Security verification matrix failed to resolve identity mapping.");

      setUserRole(profile.role as UserRole);
      setOperatorName(profile.full_name);
      setIsLoggedIn(true);
      setGlobalFeedback({ type: 'success', msg: `Secure Session Confirmed: Operator ${profile.full_name} online.` });
    } catch (err: any) {
      setGlobalFeedback({ type: 'error', msg: err.message });
      supabase.auth.signOut();
    }
  };

  useEffect(() => {
    setHasMounted(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) verifyAndSetupWorkspace(session.user.id);
    });
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    setOperatorName('');
    setGlobalFeedback({ type: null, msg: '' });
  };

  if (!hasMounted) return <div className={isDarkMode ? 'bg-[#08090d]' : 'bg-[#f4f5f6]'} />;

  if (!isLoggedIn) {
    return (
      <LoginGate 
        isDarkMode={isDarkMode} 
        setIsDarkMode={setIsDarkMode} 
        feedback={globalFeedback} 
        setFeedback={setGlobalFeedback} 
        onSuccess={verifyAndSetupWorkspace} 
      />
    );
  }

  return (
    <DashboardRuntime 
      isDarkMode={isDarkMode} 
      setIsDarkMode={setIsDarkMode} 
      operatorName={operatorName} 
      userRole={userRole} 
      handleSignOut={handleSignOut}
      initialFeedback={globalFeedback}
    />
  );
}