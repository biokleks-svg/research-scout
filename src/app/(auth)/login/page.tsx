'use client';

import { useActionState } from 'react';
import { loginAction, type AuthActionState } from '@/app/actions/auth';

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(loginAction, null);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 border rounded-lg shadow-sm">
        <h1 className="text-2xl font-bold text-center">Sign in</h1>
        {state?.error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
            {state.error}
          </p>
        )}
        <form action={formAction} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
            <input
              id="email" name="email" type="email" required autoComplete="email"
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">Password</label>
            <input
              id="password" name="password" type="password" required autoComplete="current-password"
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          No account? <a href="/register" className="text-blue-600 hover:underline">Register</a>
        </p>
      </div>
    </main>
  );
}
