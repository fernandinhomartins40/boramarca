'use client';

import { useState, type FormEvent } from 'react';
import type { DecisionView } from '@boramarca/shared';
import { input } from '@/components/site/ui';
import { answerDecision } from './actions';
import { firstName } from './format';
import { useSession } from './PanelShell';
import { btnOutline, btnPrimary, errorText, Icon, Loading } from './ui';

/** Right column of "Hoje": what the AI recovered and the decisions waiting for an answer. */
export function DecisionsAside({
  decisions,
  loading,
  recoveredToday,
  professionalName,
  onAnswered,
}: {
  decisions?: DecisionView[];
  loading: boolean;
  recoveredToday: number | null;
  professionalName: (id: string) => string;
  onAnswered: () => void;
}) {
  const [done, setDone] = useState<string>();
  return (
    <aside aria-labelledby="assistente" className="space-y-lg xl:sticky xl:top-xl">
      <div className="rounded-lg border border-border bg-surface p-lg">
        <h2 id="assistente" className="flex items-center gap-sm text-heading text-text">
          <Icon name="sparkle" className="size-6 text-primary-text" /> Assistente Bora Marca
        </h2>
        <p className="mt-xs text-body-small text-text-muted">
          A IA organiza, confirma e conversa com seus clientes. Você dá a palavra final.
        </p>
      </div>
      {recoveredToday !== null && recoveredToday > 0 && (
        <div className="rounded-lg bg-accent-soft p-lg text-text">
          <p className="flex items-center gap-md text-heading">
            <span className="grid size-10 place-items-center rounded-pill bg-accent text-on-accent">
              <Icon name="calendar" />
            </span>
            A IA recuperou {recoveredToday} {recoveredToday === 1 ? 'horário' : 'horários'} hoje
          </p>
          <p className="mt-sm text-body-small">
            Encaixes marcados pela IA em horários que ficariam vagos.
          </p>
        </div>
      )}
      {done && (
        <p role="status" className="rounded-lg bg-success p-lg text-body-small text-on-success">
          {done}
        </p>
      )}
      {loading ? (
        <Loading />
      ) : !decisions?.length ? (
        <div className="rounded-lg border border-border bg-surface p-lg">
          <h2 className="flex items-center gap-sm text-heading text-text">
            <Icon name="chat" /> Nenhuma decisão pendente
          </h2>
          <p className="mt-xs text-body-small text-text-muted">
            Quando a IA precisar da palavra da equipe, o pedido aparece aqui.
          </p>
        </div>
      ) : (
        decisions.map((d) => (
          <DecisionCard
            key={d.id}
            decision={d}
            professional={professionalName(d.professionalId)}
            onAnswered={(msg) => {
              setDone(msg);
              onAnswered();
            }}
          />
        ))
      )}
    </aside>
  );
}

function DecisionCard({
  decision: d,
  professional,
  onAnswered,
}: {
  decision: DecisionView;
  professional: string;
  onAnswered: (message: string) => void;
}) {
  const { api, me } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [text, setText] = useState('');
  const mine = d.professionalId === me.professional.id;
  const textId = `livre-${d.id}`;

  async function answer(body: { optionId: string } | { text: string }) {
    setBusy(true);
    setError(undefined);
    try {
      const r = await answerDecision(api, d.id, body);
      onAnswered(r.spokenConfirmation);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }
  function submitText(e: FormEvent) {
    e.preventDefault();
    if (text.trim()) void answer({ text: text.trim() });
  }

  return (
    <article className="rounded-lg border border-border bg-surface p-lg">
      <h3 className="flex items-center gap-sm text-heading text-text">
        <Icon name="chat" /> Decisão pendente
      </h3>
      <p className="mt-xs text-caption text-text-muted">
        {mine ? 'Sua agenda' : `Agenda de ${firstName(professional)}`}
        {d.clientName ? ` · ${d.clientName}` : ''}
      </p>
      <p className="mt-md text-body text-text">{d.question}</p>
      {d.context.messages.length > 0 && (
        <details className="mt-sm text-body-small">
          <summary className="cursor-pointer font-semibold text-primary-text">Ver conversa</summary>
          <ul className="mt-sm space-y-xs">
            {d.context.messages.map((m, i) => (
              <li key={i} className="rounded-md bg-surface-alt p-sm text-text">
                <b className="font-semibold">
                  {m.author === 'client'
                    ? d.context.clientFirstName
                    : m.author === 'ai'
                      ? 'IA'
                      : mine
                        ? 'Você'
                        : firstName(professional)}
                  :
                </b>{' '}
                {m.text}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-lg space-y-sm">
        {d.options.map((o, i) => (
          <button
            key={o.id}
            type="button"
            disabled={busy}
            onClick={() => void answer({ optionId: o.id })}
            className={`${i === 0 ? btnPrimary : btnOutline} w-full`}
          >
            {o.label === 'Sim' && <Icon name="check" />}
            {o.label === 'Não' && <Icon name="close" />}
            {o.label}
          </button>
        ))}
      </div>
      <form onSubmit={submitText} className="mt-lg">
        <label htmlFor={textId} className="text-body-small font-semibold text-text">
          Ou responda com suas palavras
        </label>
        <textarea
          id={textId}
          rows={2}
          maxLength={500}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Pode, mas marca daqui 15 minutos"
          className={`${input} min-h-0 resize-y`}
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className={`${btnOutline} mt-sm w-full`}
        >
          {busy ? 'Enviando…' : 'Enviar resposta'}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-sm text-body-small text-danger">
          {error}
        </p>
      )}
    </article>
  );
}
