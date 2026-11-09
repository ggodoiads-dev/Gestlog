import { LoginForm } from './login-form';

export const metadata = { title: 'Entrar — GESTLOG' };

export default function LoginPage(): React.ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-page px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        <header className="space-y-2 text-center">
          <div className="inline-flex items-center gap-2 font-mono text-xs tracking-widest text-ink-500">
            GESTLOG
          </div>
          <h1 className="text-2xl font-semibold text-ink-900 dark:text-white">
            Entrar na central
          </h1>
          <p className="text-sm text-ink-700 dark:text-white/70">
            Sua transportadora sob controle.
          </p>
        </header>
        <LoginForm />
        <p className="text-center text-xs text-ink-500">
          Ambiente DEMO. Credenciais seedadas em <code>docs/DEPLOYMENT_AND_OPERATIONS.md</code>.
        </p>
      </div>
    </main>
  );
}
