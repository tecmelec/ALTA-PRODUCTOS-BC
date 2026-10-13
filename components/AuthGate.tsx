import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { authClient, isAuthConfigured, signOut } from '../auth';

interface AuthContextValue {
  email: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({ email: null, signOut });

/** Usuario con sesión iniciada (para mostrarlo y para cerrar sesión). */
export const useAuth = () => useContext(AuthContext);

/**
 * Solo deja ver la aplicación a los usuarios con sesión iniciada en el
 * Portal Compras (Supabase). Mientras no hay sesión, muestra el login.
 */
const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!authClient) {
      setChecking(false);
      return;
    }
    authClient.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data } = authClient.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isAuthConfigured()) {
    return (
      <Screen>
        <p className="text-sm text-gray-600">
          El acceso no está configurado. Faltan <code>VITE_AUTH_SUPABASE_URL</code> y{' '}
          <code>VITE_AUTH_SUPABASE_ANON_KEY</code> en los secrets del repositorio.
        </p>
      </Screen>
    );
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-sm text-gray-400">
        Comprobando sesión…
      </div>
    );
  }

  if (!session) return <LoginForm />;

  return (
    <AuthContext.Provider value={{ email: session.user.email ?? null, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

const Screen: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 font-sans">
    <div className="w-full max-w-sm">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-green-600 leading-none">TECMELEC</h1>
        <span className="text-xs text-gray-400 font-bold">Alta de productos</span>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">{children}</div>
    </div>
  </div>
);

const LoginForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authClient || submitting) return;
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await authClient.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setError(
        /invalid login credentials/i.test(signInError.message)
          ? 'El email o la contraseña no son correctos.'
          : /email not confirmed/i.test(signInError.message)
            ? 'Tu email aún no está confirmado. Revisa tu correo o avisa al administrador.'
            : `No se pudo iniciar sesión: ${signInError.message}`,
      );
      setSubmitting(false);
    }
    // Si va bien, onAuthStateChange en AuthGate muestra la aplicación.
  };

  return (
    <Screen>
      <h2 className="text-lg font-bold text-gray-800 mb-1">Iniciar sesión</h2>
      <p className="text-sm text-gray-500 mb-5">Usa tu usuario del Portal de Compras.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="block text-sm font-semibold text-gray-600 mb-1">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="login-password" className="block text-sm font-semibold text-gray-600 mb-1">Contraseña</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-bold disabled:opacity-50"
        >
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <p className="mt-4 text-xs text-gray-400">
        Si no recuerdas la contraseña, restablécela desde el Portal de Compras.
      </p>
    </Screen>
  );
};

export default AuthGate;
