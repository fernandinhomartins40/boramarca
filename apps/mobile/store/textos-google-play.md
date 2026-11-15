# Google Play — ficha da loja (pt-BR)

Copiar para **Play Console → Crescimento → Presença na loja → Página principal da loja**.
Limites conferidos em 15/11/2026 na Central de Ajuda do Play Console (respostas 9859152 e 9866151):
nome até 30 caracteres, descrição curta até 80, descrição completa até 4.000. Sem emoji, sem
"melhor", "nº 1", "grátis", sem chamadas como "Baixe já" e sem palavras-chave repetidas.

Regra do produto (plano, seção 1, item 10): o nome, o ícone e o título **não** usam a marca do
WhatsApp. A descrição cita o WhatsApp só para explicar a conexão, dizendo que não é oficial.

## Nome do app (23/30)

```
Bora Marca: agenda e IA
```

## Descrição curta (79/80)

```
A IA organiza sua agenda pelas conversas com clientes e você dá a palavra final
```

## Descrição completa (2.149/4.000)

```
Bora Marca é um assistente de agenda para quem vive de hora marcada: fisioterapia, psicologia, odontologia, beleza, bem-estar e aulas.

Você atende. O Bora Marca cuida do resto: responde clientes, marca, remarca, avisa e preenche os horários que vagaram. Quando uma ação mexe com a agenda de outra pessoa, ele pergunta antes. Você dá a palavra final.

O QUE O APP FAZ
• Agenda do dia com o atendimento de agora, o próximo e as vagas livres.
• Decisões: quando a IA precisa de você, aparece um pedido claro ("Rafael quer horário hoje. Posso marcar às 16h50?") e você responde Sim ou Não, no app ou na própria notificação.
• Conversas: acompanhe o que a IA respondeu, veja a mensagem antes de sair e assuma a conversa quando quiser.
• Clientes e lista de espera: histórico, faltas e a oferta automática do horário que vagou para quem está esperando.
• Lembretes antes do atendimento.
• Ajustes da IA: escolha o que ela pode fazer sozinha, o tom das mensagens e pause quando quiser.

MODO BALCÃO
Mãos ocupadas? Deixe o celular no balcão e responda por voz. Diga "Ei, Bora Marca" ou toque em Falar, e responda "sim" ou "não" às decisões. No Android, o Modo Balcão continua ouvindo com a tela bloqueada, sempre com uma notificação fixa "Bora Marca está ouvindo" e um botão para pausar. O microfone só é usado depois que você dá a permissão e liga o Modo Balcão.

COMO FUNCIONA A CONEXÃO COM O WHATSAPP
O Bora Marca conecta o seu número como um aparelho conectado, do mesmo jeito que o WhatsApp Web. Essa conexão não é a API oficial do WhatsApp, e o Bora Marca não é afiliado ao WhatsApp nem à Meta. Para proteger o seu número, o sistema só responde a quem escreveu primeiro, limita a quantidade de mensagens e não faz envio em massa. Mesmo assim existe um risco pequeno de restrição do número, explicado nos termos de uso.

PRIVACIDADE
O telefone dos seus clientes nunca vai para a IA. Você pode excluir a sua conta e os dados dos seus clientes a qualquer momento em Ajustes → Conta → Excluir conta, ou pelo site boramarca.com.br/excluir-conta.

Política de privacidade: https://boramarca.com.br/privacidade
Termos de uso: https://boramarca.com.br/termos
```

## Outros campos da ficha

| Campo | Valor |
|---|---|
| Categoria | Empresa (Business) |
| Tags | Agenda, Produtividade, Ferramentas de negócios (escolher as que o console oferecer) |
| E-mail de contato | contato@boramarca.com.br (o mesmo `SUPPORT_EMAIL` de `apps/web/lib/site.ts`) |
| Site | https://boramarca.com.br |
| Política de privacidade | https://boramarca.com.br/privacidade |
| Ícone (512×512) | `Bora-Marca-Kit/04-lojas/google-play/icone-512.png` |
| Recurso gráfico (1024×500) | `Bora-Marca-Kit/04-lojas/google-play/destaque-1024x500.png` |
| Capturas do celular (até 8) | `apps/mobile/store/capturas/android/`: 10 capturas reais do build de release com a conta de revisão (1080×1920, 9:16, PNG RGB sem alpha). Sugestão de 8: `01-agenda`, `02-decisoes`, `04-conversa`, `03-conversas`, `06-modo-balcao`, `05-preparar-balcao`, `07-conexao-whatsapp`, `09-conta`. A barra de status mostra dois ícones do emulador; se incomodar, refaça num aparelho com o modo demonstração da barra de status. |

**Não usar** `Bora-Marca-Kit/04-lojas/google-play/galeria-conceitual-*.png` como capturas: são
peças conceituais, não telas do app (o próprio kit avisa), e têm 1080×2340, proporção 2,17:1, acima
do limite do Google Play (o lado maior não pode passar do dobro do menor).
