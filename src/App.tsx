import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import AdminDashboard from './components/AdminDashboard';
import UserDashboard from './components/UserDashboard';
import { Loader2, Film } from 'lucide-react';

interface LoggedInUser {
  userId: string;
  name: string;
  role: 'Admin' | 'Member';
}

export default function App() {
  const [user, setUser] = useState<LoggedInUser | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);

  // Check Local Session on mount
  useEffect(() => {
    const saved = localStorage.getItem('rda_user_session');
    if (saved) {
      try {
        setUser(JSON.parse(saved));
      } catch (err) {
        console.error('Session restore crashed', err);
      }
    }
    setBootstrapping(false);
  }, []);

  const handleLoginSuccess = (loggedInUser: LoggedInUser) => {
    setUser(loggedInUser);
    localStorage.setItem('rda_user_session', JSON.stringify(loggedInUser));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('rda_user_session');
  };

  if (bootstrapping) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="space-y-3.5 text-center">
          <Film className="h-8 w-8 text-gray-950 mx-auto animate-bounce" id="app-startup-icon" />
          <p className="text-xs font-mono font-bold text-gray-400 uppercase tracking-widest">
            Resolving secure database connections...
          </p>
          <Loader2 className="animate-spin h-5 w-5 text-gray-950 mx-auto" />
        </div>
      </div>
    );
  }

  // Routing Tree
  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (user.role === 'Admin') {
    return <AdminDashboard user={user} onLogout={handleLogout} />;
  }

  return <UserDashboard user={user} onLogout={handleLogout} />;
}
