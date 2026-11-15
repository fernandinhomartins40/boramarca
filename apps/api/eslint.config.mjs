// apps/api: the monorepo config plus the rule that keeps WhatsApp output on a single path.
import root from '../../eslint.config.mjs';

export default [
  ...root,
  {
    files: ['**/*.ts'],
    // The send module: gateway selection and the outbox (createSender) are the only callers.
    ignores: ['src/modules/whatsapp/send.ts', 'src/modules/whatsapp/gateway.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.property.name=/^(sendText|sendPresence)$/]',
          message:
            'WhatsApp só sai pela guarda de envio: use app.messaging.outbox.enqueue (plano, regra 3).',
        },
      ],
    },
  },
];
