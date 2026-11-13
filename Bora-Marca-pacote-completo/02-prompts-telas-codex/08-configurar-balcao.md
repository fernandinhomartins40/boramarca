# Prompt 8 — Configurar o Balcão (Android) + voz em segundo plano

---

Leia o `README.md`, `src/theme` e `src/features/balcao/` antes de começar. **Esta tarefa é só para Android.** No iOS, esconda essa configuração e mostre "Em breve no iPhone. Por enquanto, use as notificações para decidir."

## Parte 1 — Assistente de configuração (`app/balcao/configurar.tsx`)
Passos com checklist visual (✓ verde quando ok) e botão "Testar" em cada um:
1. **Microfone**: pede a permissão e mostra um medidor de nível ao vivo ("Fale algo…").
2. **Notificações**: permissão `POST_NOTIFICATIONS` (Android 13+).
3. **Bateria**: detecta se o app está na otimização de bateria e leva à tela de exceção. Inclua instruções extras **por marca**, detectada via `expo-device` (Xiaomi/Redmi, Samsung, Motorola, outros), com passos ilustrados por ícones.
4. **Caixa de som Bluetooth**: mostra o dispositivo de áudio atual, botão "Tocar som de teste" e dica: "Deixe o celular perto de você e a caixa onde quiser. Quem escuta é o celular."
5. **Caixa dormindo**: interruptor "Manter a caixa acordada" (toca um som inaudível a cada 4 min) com explicação curta.
6. **Teste final**: "Diga **Ei, Bora Marca**" → confirma o reconhecimento → o app fala "Tudo certo! Estou pronta para trabalhar."

## Parte 2 — Integração nativa real
- **Palavra de ativação:** Picovoice Porcupine (`@picovoice/porcupine-react-native` + `@picovoice/react-native-voice-processor`), com o modelo de português e uma palavra customizada "Ei Bora Marca" (arquivo `.ppn`). Deixe a `AccessKey` em variável de ambiente e documente como gerar a palavra no console do Picovoice.
  - **Cuidado com ativação falsa:** "bora marcar" é uma frase comum no salão. Por isso, a palavra é "Ei, Bora Marca" (com o "Ei"). Ajuste a sensibilidade e crie um teste com frases do dia a dia ("bora marcar pra semana que vem?"), que **não** podem ativar o app. Se as ativações falsas forem frequentes, deixe configurável uma palavra alternativa.
- **Fala → texto:** reconhecimento nativo do Android (`@react-native-voice/voice` ou `expo-speech-recognition`), em `pt-BR`.
- **Texto → fala:** `expo-speech`, `pt-BR`, com o som de aviso antes de cada fala proativa.
- **Serviço em primeiro plano (foreground service)** do tipo `microphone` (`FOREGROUND_SERVICE_MICROPHONE` no manifest), com notificação fixa "Bora Marca está ouvindo" e ação "Pausar". Implemente via config plugin do Expo + módulo nativo Kotlin pequeno (ou `react-native-background-actions`, se atender ao tipo `microphone`; justifique a escolha).
  - Regra do Android 14+: o serviço precisa ser **iniciado com o app em primeiro plano**. Crie o botão "Abrir o salão" na Agenda, que inicia o serviço e abre o Modo Balcão.
  - Com a tela bloqueada: palavra de ativação, avisos proativos e respostas por voz continuam funcionando.
- **Reconexão:** se a caixa Bluetooth desconectar, fale pelo alto-falante do celular e mostre um aviso; quando ela voltar, retome a saída por ela.
- Botão "Fechar o salão" que para o serviço e mostra um resumo falado do dia.

## Parte 3 — Testes
Documente no README um roteiro de teste manual num Android físico:
- Tela bloqueada por 30 min → a decisão chega e é anunciada
- Desligar e religar a caixa
- Bateria em modo economia
- Reiniciar o celular (o serviço não volta sozinho; o app mostra o lembrete "Abra o salão")

## Ao terminar
Gere o dev build Android (`eas build --profile development --platform android` ou build local), descreva o que testou num aparelho real e o que ficou pendente, e pare.
