import type { Metadata } from 'next';
import Link from 'next/link';
import { SignupFlow } from '@/components/site/SignupFlow';
import { container } from '@/components/site/ui';

export const metadata: Metadata = {
  title: 'Criar conta grátis',
  description: 'Crie sua conta na Bora Marca e use 14 dias grátis, sem cartão.',
  alternates: { canonical: '/cadastro' },
};

export default function CadastroPage() {
  return (
    <main id="conteudo" className={`${container} py-xxxl`}>
      <div className="grid gap-xxl lg:grid-cols-2">
        <div>
          <h1 className="text-display text-text">Comece grátis.</h1>
          <p className="mt-md text-body text-text">
            14 dias para testar tudo, sem cartão. A IA atende seu WhatsApp, marca na agenda e te
            pergunta quando precisa de você.
          </p>
          <ul className="mt-xl space-y-sm text-body text-text">
            <li>• Crie a conta com seu celular e e-mail</li>
            <li>• Confirme com o código que chega no e-mail</li>
            <li>• Baixe o app e entre com o mesmo celular</li>
          </ul>
          <p className="mt-xl text-body-small text-text-muted">
            Já tem conta?{' '}
            <Link href="/painel" className="text-primary-text underline">
              Entrar
            </Link>
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-xl md:p-xxl">
          <SignupFlow />
        </div>
      </div>
    </main>
  );
}
