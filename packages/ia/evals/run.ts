// Evaluation runner (plan section 15) — filled by agent A3. Runs against the real LLM only when keys exist.
if (!process.env.LLM_PRIMARY_API_KEY) {
  console.log('[eval] LLM_PRIMARY_API_KEY ausente: avaliação pulada.');
} else {
  console.log('[eval] Nenhum caso de avaliação ainda (agente A3).');
}
