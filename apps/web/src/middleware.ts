import { NextResponse, type NextRequest } from 'next/server';

/**
 * Middleware de proteção de rota. Qualquer caminho fora de `/login`
 * e dos estáticos exige a sessão cookie.
 *
 * O middleware NÃO valida o token (não temos ambiente Node completo aqui),
 * apenas sua presença. A validação real acontece no server quando
 * `apiFetch` é chamado — a API retorna 401 se o token for inválido.
 */
export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/login' ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }
  const token = req.cookies.get('gestlog_session');
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('from', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
