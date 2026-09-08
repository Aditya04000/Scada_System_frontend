import React, { useState } from 'react';
import { NavTab, UserRole } from '../types';
import { authenticateUser, getKnownAccounts } from '../data/userCredentials';
import { Lock, Mail, ArrowRight, ShieldCheck, CheckCircle2, AlertCircle, Shield, UserCheck } from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: (userEmail: string, role: UserRole, userName: string) => void;
  setActiveTab: (tab: NavTab) => void;
  isLoggedIn: boolean;
  currentUserEmail?: string;
  onLogout?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginSuccess,
  setActiveTab,
  isLoggedIn,
  currentUserEmail,
  onLogout,
}) => {
  // Login Form State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Forgot password state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  // Guards against a second submit while the first is still in flight. The login
  // route is rate-limited per address, so an impatient double-click used to spend
  // two of the operator's attempts on one password.
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setLoginError('');

    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError('Please enter both email and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const authResult = await authenticateUser(loginEmail, loginPassword);

      if (!authResult.success || !authResult.user) {
        setLoginError(authResult.error || 'Authentication failed. Incorrect email or password.');
        return;
      }

      // The session cookie is set by now; there is no token to hand upwards.
      onLoginSuccess(authResult.user.email, authResult.user.role, authResult.user.name);
      setActiveTab('REAL TIME DATA');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendResetEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.includes('@')) {
      setLoginError('Enter a valid email address for password reset');
      return;
    }
    setResetSent(true);
  };

  // Addresses that have signed in on this browser before. This used to list
  // every account in the installation, which advertised each address and its
  // privilege level on a page anyone could reach without signing in.
  const userAccountsList = getKnownAccounts();

  return (
    <div className="relative min-h-[calc(100vh-60px)] w-full bg-[#16171f] flex items-center justify-center p-4 md:p-6 text-white font-sans select-none">
      <div className="w-full max-w-xl bg-[#21232d] border border-gray-700/80 p-6 md:p-8 rounded-sm shadow-2xl">
        
        {/* Header Title */}
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-black tracking-wider uppercase text-white font-sans flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-blue-400" />
              <span>BECS SYSTEM SECURITY ACCESS</span>
            </h2>
            <span className="text-[11px] text-gray-400 font-mono tracking-widest block uppercase mt-0.5">
              Secure Multi-User Operator Authentication Portal
            </span>
          </div>

        </div>

        {/* If Active Session Exists */}
        {isLoggedIn ? (
          <div className="space-y-4 bg-[#181a24] border border-emerald-500/60 p-5 rounded text-white">
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold">
              <CheckCircle2 className="w-5 h-5" />
              <span>AUTHENTICATED OPERATOR SESSION ACTIVE</span>
            </div>

            <div className="text-xs space-y-2 font-mono text-gray-300">
              <p>
                Operator Email:{' '}
                <span className="text-amber-300 font-bold">{currentUserEmail}</span>
              </p>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Full telemetry, automation valves, graph reports, and ESP32 configuration are unlocked.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActiveTab('REAL TIME DATA')}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase tracking-wider rounded cursor-pointer transition-colors shadow"
              >
                ENTER HVAC DASHBOARD
              </button>
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="px-4 py-2.5 bg-red-950/90 hover:bg-red-800 text-red-200 border border-red-800/80 text-xs font-bold uppercase tracking-wider rounded cursor-pointer transition-colors"
                >
                  LOGOUT
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* LOGIN FORM */}
            <form onSubmit={handleLoginSubmit} className="space-y-4">
                {loginError && (
                  <div className="p-3 bg-red-950/90 border border-red-500/80 text-red-200 text-xs font-semibold rounded flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{loginError}</span>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold tracking-wider text-gray-300 uppercase">
                      EMAIL ADDRESS / USER ID
                    </label>
                    <span className="text-[10px] text-gray-400 font-mono">
                      Select below or enter email
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="e.g. admin@hvac-ctrl.com"
                      className="w-full bg-[#181922] border border-gray-600 text-white placeholder-gray-500 text-sm px-3.5 py-2.5 pr-10 rounded focus:outline-none focus:border-blue-400 font-mono"
                    />
                    <Mail className="absolute right-3.5 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>

                  {/* Previous / Known User IDs Selection (NO PASSWORDS) */}
                  {userAccountsList.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-gray-800">
                      <span className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5 text-blue-400" />
                        <span>PREVIOUS / KNOWN USER IDs:</span>
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {userAccountsList.map((usr) => (
                          <button
                            key={usr.id}
                            type="button"
                            onClick={() => {
                              setLoginEmail(usr.email);
                              setLoginError('');
                            }}
                            className={`px-2.5 py-1 rounded text-xs font-mono flex items-center gap-1.5 border transition-all cursor-pointer ${
                              loginEmail.toLowerCase() === usr.email.toLowerCase()
                                ? 'bg-blue-900/80 border-blue-400 text-white font-bold ring-1 ring-blue-400'
                                : 'bg-[#141520] border-gray-700/80 text-gray-300 hover:border-blue-500 hover:text-white'
                            }`}
                            title={`Select ID: ${usr.email}`}
                          >
                            <span>{usr.email}</span>
                            <span
                              className={`text-[9px] px-1 py-0.2 rounded font-mono uppercase font-bold ${
                                usr.role === 'ADMIN'
                                  ? 'bg-amber-950/90 text-amber-300 border border-amber-600/60'
                                  : 'bg-blue-950/90 text-blue-300 border border-blue-600/60'
                              }`}
                            >
                              {usr.role}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold tracking-wider text-gray-300 uppercase mb-1">
                    PASSWORD
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter Password"
                      className="w-full bg-[#181922] border border-gray-600 text-white placeholder-gray-500 text-sm px-3.5 py-2.5 pr-10 rounded focus:outline-none focus:border-blue-400 font-mono"
                    />
                    <Lock className="absolute right-3.5 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>

                  <div className="flex justify-between items-center mt-2">
                    <span className="text-[11px] text-gray-400 font-mono flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      <span>Secure Operator Access</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowForgotModal(true);
                        setResetSent(false);
                      }}
                      className="text-xs font-bold text-gray-300 hover:text-white uppercase tracking-wider underline cursor-pointer"
                    >
                      FORGOT PASSWORD?
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black tracking-widest uppercase rounded shadow cursor-pointer transition-colors flex items-center justify-center gap-2 mt-4"
                >
                  <span>AUTHENTICATE & UNLOCK</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

            {/* Security notice regarding credentials storage */}
            <div className="mt-6 pt-4 border-t border-gray-700/80 text-center">
              <p className="text-[11px] text-gray-400 font-mono flex items-center justify-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-blue-400" />
                <span>Protected Credentials System Active</span>
              </p>
              <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                Passwords and accounts are strictly protected and managed directly by System Administrators after login.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Reset Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-[#21232d] border border-gray-600 p-6 rounded max-w-md w-full text-white shadow-2xl">
            <h3 className="text-base font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-400" />
              <span>Reset Email Password</span>
            </h3>

            {resetSent ? (
              <div className="p-4 bg-emerald-950/80 border border-emerald-500 text-emerald-200 rounded text-xs space-y-2 my-3">
                <p className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Password Reset Link Dispatched</span>
                </p>
                <p>
                  Recovery instructions sent to <span className="font-bold underline">{resetEmail}</span>.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSendResetEmail} className="space-y-4 my-3">
                <p className="text-xs text-gray-300">
                  Enter your registered account email to dispatch password recovery instructions.
                </p>
                <div>
                  <label className="block text-[11px] font-bold text-gray-300 uppercase mb-1">
                    Registered Email
                  </label>
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="e.g. admin@hvac-ctrl.com"
                    className="w-full bg-[#181922] border border-gray-600 text-white text-xs px-3 py-2 rounded focus:outline-none focus:border-blue-400 font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-blue-600 text-white font-bold text-xs uppercase rounded cursor-pointer hover:bg-blue-500 transition-colors"
                >
                  DISPATCH RESET LINK
                </button>
              </form>
            )}

            <button
              onClick={() => setShowForgotModal(false)}
              className="w-full py-2 bg-gray-700 text-gray-200 font-bold text-xs uppercase rounded cursor-pointer hover:bg-gray-600 transition-colors mt-1"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
