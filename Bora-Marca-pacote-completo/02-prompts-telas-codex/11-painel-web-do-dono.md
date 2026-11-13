# Prompt 11 — Painel web do dono do salão (opcional, fase 3)

Use este prompt em um **projeto separado** (ou numa pasta `web/` do monorepo), só depois do app estar funcionando.

---

Crie o painel web do **Bora Marca**, para o dono de um salão com vários profissionais.

## Stack
- **Next.js** (App Router) + TypeScript + Tailwind CSS
- Use a **mesma logo e a mesma paleta** que já existem no projeto: copie os tokens de `src/theme` do app para o `tailwind.config`. Não invente cores nem fontes novas.
- Componentes próprios simples (ou shadcn/ui **reestilizado** com os tokens). Nada com cara de template de dashboard genérico.
- Dados mock, por enquanto, em `lib/mock.ts`.

## Telas
1. **Visão do dia**: agenda em colunas, uma por profissional (estilo calendário de recursos), com arrastar para remarcar e cores por status.
2. **Resultados**: horários recuperados pela IA no mês ("**23 encaixes** = R$ 1.380 que teriam ficado vagos"), taxa de faltas, ocupação por profissional e horários mais vazios da semana (mapa de calor dia × hora). Esse número dos encaixes é o argumento de venda do produto: deixe-o em destaque.
3. **Equipe**: profissionais, serviços de cada um, horários e qual WhatsApp/balcão cada um usa.
4. **Clientes**: tabela com busca, filtros ("sumidos há +30 dias") e exportação CSV.
5. **Plano e cobrança**: plano atual, profissionais ativos e Kit Balcão.

## Regras
- Responsivo, mas pensado para notebook.
- Estados de carregando, vazio e erro em todas as telas.
- Textos em português do Brasil.

## Ao terminar
Rode `npm run dev`, mostre prints das 5 telas e pare.
