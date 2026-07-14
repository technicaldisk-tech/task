import React, { useState } from 'react';
import { Shield, Key, Eye, EyeOff, Loader2 } from 'lucide-react';

interface LoginProps {
  onLoginSuccess: (user: { userId: string; name: string; role: 'Admin' | 'Member' }) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim() || !password.trim()) {
      setError('Please provide both User ID and Password.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId.trim(), password: password.trim() }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        onLoginSuccess(data.user);
      } else {
        setError(data.message || 'Invalid User ID or Password.');
      }
    } catch (err) {
      console.error(err);
      setError('Connection failed. Please verify the server is running.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 bg-blue-600 text-white rounded-lg flex items-center justify-center mb-4 shadow-sm">
            <Shield className="h-6 w-6" id="login-shield-icon" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800 animate-fade-in">
            Task & Ledger Portal
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Please log in with your assigned user ID and password.
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-100" id="login-error-msg">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="userId" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                User ID
              </label>
              <div className="relative">
                <input
                  id="userId"
                  name="userId"
                  type="text"
                  required
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                  placeholder="Enter User ID"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                  placeholder="••••••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg text-sm font-bold text-white bg-blue-600 hover:bg-blue-700/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 transition-all cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin h-5 w-5 mr-2" />
                  Verifying account...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </div>
        </form>

        <div className="mt-6 border-t border-slate-100 pt-4 text-center">
          <p className="text-[11px] text-slate-400 font-mono">
            Default credentials exist for administrative login.
          </p>
        </div>
      </div>
    </div>
  );
}
