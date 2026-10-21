import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, KeyRound, AlertTriangle, ArrowRight, UserCheck, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Demo switcher is restricted to development or explicit demo configuration
  const isDemoAllowed = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (isRegister) {
        await api.auth.register(name, email, password);
        await login(email, password);
      } else {
        await login(email, password);
      }
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = async (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setIsLoading(true);
    setError(null);
    try {
      await login(demoEmail, demoPass);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Quick login failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 items-center justify-center shadow-xl shadow-emerald-950/50 mb-4">
          <Shield className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Trust<span className="text-emerald-400">Vault</span> Security
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-slate-400">
          Cryptographically Verified Document Management & Dynamic Access Control
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        {/* Quick Demo Logins for Hackathon Evaluators (Gated to Demo/Dev Environment) */}
        {isDemoAllowed && (
          <div className="mb-6 p-4 bg-slate-900/90 border border-emerald-900/60 rounded-2xl shadow-xl shadow-emerald-950/20">
            <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span className="flex items-center space-x-1.5">
                <UserCheck className="w-4 h-4" />
                <span>Evaluator Demo Switcher (Instant Sign-In)</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">
              Click any seeded role account below to switch contexts and verify real-time authorization:
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => handleQuickLogin('admin@trustvault.local', 'Admin@TrustVault2026!')}
                disabled={isLoading}
                className="p-2.5 bg-purple-950/50 hover:bg-purple-900/60 border border-purple-800 rounded-xl text-left transition-all group"
              >
                <div className="font-semibold text-purple-300 flex items-center justify-between">
                  <span>🛡️ Administrator</span>
                  <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="text-[10px] text-purple-400/80 truncate">admin@trustvault.local</div>
              </button>

              <button
                onClick={() => handleQuickLogin('alice@trustvault.local', 'Alice@TrustVault2026!')}
                disabled={isLoading}
                className="p-2.5 bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-800 rounded-xl text-left transition-all group"
              >
                <div className="font-semibold text-emerald-300 flex items-center justify-between">
                  <span>👑 Alice (Owner)</span>
                  <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="text-[10px] text-emerald-400/80 truncate">alice@trustvault.local</div>
              </button>

              <button
                onClick={() => handleQuickLogin('bob@trustvault.local', 'Bob@TrustVault2026!')}
                disabled={isLoading}
                className="p-2.5 bg-blue-950/50 hover:bg-blue-900/60 border border-blue-800 rounded-xl text-left transition-all group"
              >
                <div className="font-semibold text-blue-300 flex items-center justify-between">
                  <span>👁️ Bob (Viewer)</span>
                  <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="text-[10px] text-blue-400/80 truncate">bob@trustvault.local</div>
              </button>

              <button
                onClick={() => handleQuickLogin('charlie@trustvault.local', 'Charlie@TrustVault2026!')}
                disabled={isLoading}
                className="p-2.5 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800 rounded-xl text-left transition-all group"
              >
                <div className="font-semibold text-rose-300 flex items-center justify-between">
                  <span>🚫 Charlie (Unrelated)</span>
                  <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="text-[10px] text-rose-400/80 truncate">charlie@trustvault.local</div>
              </button>
            </div>
          </div>
        )}

        {/* Standard Auth Card */}
        <div className="bg-slate-900 border border-slate-800 py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
          <div className="flex border-b border-slate-800 pb-4 mb-6">
            <button
              type="button"
              onClick={() => setIsRegister(false)}
              className={`flex-1 text-center py-2 text-sm font-semibold border-b-2 -mb-[18px] transition-colors ${
                !isRegister ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setIsRegister(true)}
              className={`flex-1 text-center py-2 text-sm font-semibold border-b-2 -mb-[18px] transition-colors ${
                isRegister ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Register Account
            </button>
          </div>

          {error && (
            <div className="mb-6 p-3.5 bg-rose-950/60 border border-rose-800 rounded-xl flex items-center space-x-2 text-rose-300 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder="e.g. John Doe"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="name@company.com"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••••••"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
              />
              {isRegister && (
                <p className="mt-1 text-[11px] text-slate-400">
                  Minimum 8 characters with letters, numbers, and special symbols.
                </p>
              )}
            </div>

            {isRegister && (
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-[11px] text-slate-400">
                All newly registered accounts are assigned standard <span className="font-semibold text-emerald-400">Viewer</span> access. Role elevations (Owner, Administrator) must be assigned by a System Administrator.
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-950/50 disabled:opacity-50 transition-all flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>{isRegister ? 'Create Account' : 'Sign In to TrustVault'}</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
