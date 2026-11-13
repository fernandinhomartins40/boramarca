# Roteiro de teste das caixinhas XiaoZhi

Faça os testes na ordem. Se um teste **eliminatório** falhar, a caixinha está descartada e o Kit Balcão continua com celular Android + caixa Bluetooth.

Registre cada teste numa planilha simples (data, resultado, observação) e grave vídeo dos testes 2 e 7.

| # | Teste | Como fazer | Passa se | Eliminatório? |
|---|---|---|---|---|
| 1 | Funciona de fábrica | Ligar, conectar no Wi-Fi do salão, ativar pelo xiaozhi.me e conversar em português (30 min) | Entende e responde em português | Não |
| 2 | Microfone no barulho | Com secador e música ligados, falar a 1 e a 2 metros, 20 vezes | Acerta 17 ou mais | **Sim** |
| 3 | Volume | Com o secador ligado, ouvir a resposta a 2 metros | A fala é entendida. Se falhar, testar alto-falante maior ou caixa externa | Não |
| 4 | Palavra de ativação | Gravar "Ei, Bora Marca". Testar 20 ativações e 1 hora de conversa normal com frases como "bora marcar pra semana que vem?" | ≥ 17/20 certas e no máximo 1 ativação falsa por hora | Não |
| 5 | Servidor próprio | Subir o xiaozhi-esp32-server numa VPS, configurar DeepSeek/Qwen e apontar a caixinha para ele | Conversa funciona sem o xiaozhi.me | **Sim** |
| 6 | Funções da agenda | Criar as ferramentas `listar_agenda` e `marcar` no servidor e perguntar "quantos clientes ainda tenho hoje?" | Resposta certa em menos de 3 segundos | Não |
| 7 | Aviso proativo | O servidor manda a caixinha falar sozinha ("Fulano quer marcar...") e abrir o microfone para a resposta | Funciona sem ninguém chamar antes | **Sim** (o mais importante) |
| 8 | Estabilidade | Deixar ligada 3 dias seguidos, com queda de Wi-Fi e de energia no meio | Reconecta sozinha | Não |
| 9 | Custo do kit | Somar caixinha + impostos + frete + case com logo | Sai mais barato que Android de entrada + caixa Bluetooth | Não |
