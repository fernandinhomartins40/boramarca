import type { Metadata } from 'next';
import Link from 'next/link';
import { ContactForm } from '@/components/site/ContactForm';
import { container } from '@/components/site/ui';
import { SUPPORT_EMAIL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Contato e suporte',
  description: 'Fale com a Bora Marca: conheça o app ou peça ajuda com a sua conta.',
  alternates: { canonical: '/contato' },
};

export default function ContatoPage() {
  return (
    <main id="conteudo" className={`${container} py-xxxl`}>
      <div className="grid gap-xxl lg:grid-cols-2">
        <div>
          <h1 className="text-display text-text">Fale com a gente.</h1>
          <p className="mt-md text-body text-text">
            Quer conhecer a Bora Marca? Deixe seu nome e WhatsApp e a gente explica como ela
            funciona no seu dia a dia.
          </p>
          <h2 className="mt-xxl text-heading text-text">Suporte</h2>
          <p className="mt-sm text-body text-text">
            Já usa o app e precisa de ajuda? Escreva para{' '}
            <a className="text-primary-text underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>{' '}
            ou use este formulário. Respondemos em dias úteis.
          </p>
          <p className="mt-md text-body-small text-text-muted">
            Para apagar sua conta, use a página{' '}
            <Link className="text-primary-text underline" href="/excluir-conta">
              Excluir conta
            </Link>
            . Saiba como tratamos seus dados na{' '}
            <Link className="text-primary-text underline" href="/privacidade">
              Política de privacidade
            </Link>
            .
          </p>
        </div>
        <div className="rounded-lg bg-surface p-xl shadow-sm">
          <ContactForm />
        </div>
      </div>
    </main>
  );
}
