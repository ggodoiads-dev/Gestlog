'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { loginAction } from '@/lib/auth-actions';

function SubmitButton(): React.ReactElement {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 w-full items-center justify-center rounded-control bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
    >
      {pending ? 'Entrando…' : 'Entrar'}
    </button>
  );
}

export function LoginForm(): React.ReactElement {
  const [state, action] = useActionState(loginAction, {});
  return (
    <form
      action={action}
      className="space-y-4 rounded-card border border-surface-200 bg-surface-card p-6 shadow-sm dark:border-navy-700 dark:bg-navy-900"
    >
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-xs font-medium text-ink-700 dark:text-white/80">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue="admin.pct@demo.gestlog.local"
          className="h-10 w-full rounded-control border border-surface-200 bg-surface-0 px-3 text-sm text-ink-900 outline-none focus:border-accent dark:border-navy-700 dark:bg-navy-800 dark:text-white"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-xs font-medium text-ink-700 dark:text-white/80">
          Senha
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-10 w-full rounded-control border border-surface-200 bg-surface-0 px-3 text-sm text-ink-900 outline-none focus:border-accent dark:border-navy-700 dark:bg-navy-800 dark:text-white"
        />
      </div>
      {state.error ? (
        <div
          role="alert"
          className="rounded-control border border-danger-600/40 bg-danger-600/5 px-3 py-2 text-xs text-danger-600"
        >
          {state.error}
        </div>
      ) : null}
      <SubmitButton />
    </form>
  );
}
