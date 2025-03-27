# WhatsApp Business Bot para Serviços de Informática

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/seunome/whatsapp-bot)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/seunome/whatsapp-bot/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)](https://nodejs.org/en/download/)

Este projeto é um bot automatizado para WhatsApp Business utilizando a biblioteca [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js). O bot foi planejado para oferecer serviços de informática, incluindo orçamentos, agendamentos e atendimento a dúvidas.

## Funcionalidades

- **Boas-vindas automáticas**: Mensagem personalizada ao iniciar conversa
- **Orçamentos**: Consulta de preços para diversos serviços
- **Agendamentos**: Marcação de visitas técnicas ou atendimentos
- **FAQ**: Respostas automáticas para perguntas frequentes
- **Emergências**: Protocolo de atendimento prioritário
- **Atendimento humano**: Encaminhamento para atendente quando necessário

## Requisitos

- Node.js 14 ou superior
- Conta no WhatsApp Business
- SQLite (banco de dados local)

## Instalação

1. Clone o repositório:
```bash
git clone https://github.com/seunome/whatsapp-bot.git
cd whatsapp-bot

2. Instale as dependências:
npm install

npm install uuid
node scripts/runSeedFAQ.js

npm install node-cache

# Seed Manual:
node scripts/runSeedFAQ.js
# Ou para forçar reescrita:
node scripts/runSeedFAQ.js --force

#Teste do FAQ:
node scripts/testFAQ.js

3. Configure o arquivo .env:
cp .env.example .env

4. Inicie o bot:
npm start

5. Escaneie o código QR que aparecerá no terminal usando o WhatsApp no seu celular

## Estrutura do Projeto

/whatsapp-bot/
  /src/
    /controllers/
      dialogController.js
      serviceController.js
      schedulingController.js
      paymentController.js
    /models/
      customerModel.js
      serviceModel.js
      appointmentModel.js
    /utils/
      database.js
      formatter.js
      logger.js
    /services/
      faqService.js
      reminderService.js
      notificationService.js
    /flows/
      welcomeFlow.js
      quoteFlow.js
      schedulingFlow.js
      faqFlow.js
      emergencyFlow.js
      humanAgentFlow.js
    /config/
      config.js
  app.js
  package.json
  .env
  README.md



## Configuração

As principais configurações são feitas através do arquivo `.env`:

- `PORT`: Porta do servidor web (padrão: 3000)
- `COMPANY_NAME`: Nome da sua empresa
- `BUSINESS_HOURS_START/END`: Horários de funcionamento


#Exemplos de Uso

Iniciando uma conversa:
Cliente: Olá
Bot: Olá! Bem-vindo à Sua Empresa de Informática. Como posso ajudar?
     1. Orçamento de serviços
     2. Agendar atendimento
     3. Dúvidas frequentes
     4. Emergência
     5. Falar com atendente

Solicitando um orçamento:
Cliente: Orçamento
Bot: Claro! Temos diversos serviços disponíveis. Qual você gostaria de consultar?
     1. Formatação de computador (R$ 150,00)
     2. Limpeza física (R$ 100,00)
     3. Remoção de vírus (R$ 120,00)
     ...
Cliente: 1
Bot: O serviço de formatação custa R$ 150,00. Deseja agendar este serviço?

Agendamento:
Cliente: Agendamento
Bot: Para agendar um serviço, preciso de algumas informações:
     Qual serviço você deseja?
Cliente: Formatação
Bot: Ótimo! Agora preciso saber quando você prefere:
     1. Amanhã
     2. Esta semana
     3. Próxima semana

# Roadmap
Próximas atualizações (Q2 2025)
Integração com sistema de pagamentos
Suporte a múltiplos idiomas
Interface administrativa web

Futuro (Q3 2025)
Implementação de IA para respostas mais contextuais
Integração com sistema de CRM
Suporte a múltiplos atendentes

# Troubleshooting

O código QR não aparece
Certifique-se de que todas as dependências foram instaladas corretamente:
npm install --force

Erro de autenticação
Se o bot perder a autenticação, delete a pasta .wwebjs_auth e reinicie:
rm -rf .wwebjs_auth
npm start

Mensagens não são enviadas
Verifique se seu número do WhatsApp Business está ativo e conectado à internet.

Demonstração
<img alt="Fluxo de Conversa" src="https://exemplo.com/imagens/fluxo-conversa.png">
Diagrama do fluxo de conversa do bot

<img alt="Tela de Agendamento" src="https://exemplo.com/imagens/agendamento.png">
Exemplo de interação de agendamento

## Fluxos de Conversa

### welcomeFlow
Envia mensagem de boas-vindas e apresenta as opções disponíveis

### quoteFlow
Permite ao cliente solicitar orçamentos para serviços

### schedulingFlow
Gerencia o agendamento de atendimentos

### faqFlow
Responde perguntas frequentes sobre serviços

### emergencyFlow
Atendimento prioritário para problemas urgentes

### humanAgentFlow
Encaminha a conversa para um atendente humano

## Contribuindo

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/nova-funcionalidade`)
3. Faça commit das mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
4. Faça push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## Licença

Este projeto está licenciado sob a licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes.




As novas seções adicionadas são:

1. **Badges** no topo do documento: versão, licença e requisito do Node.js
2. **Exemplos de Uso** com diálogos demonstrativos
3. **Roadmap** com planos futuros organizados por trimestres
4. **Troubleshooting** com soluções para problemas comuns
5. **Demonstração** com espaço para imagens e diagramas explicativos
6. Formatação melhorada com blocos de código para comandos

Você precisará substituir os links de exemplo para imagens pelos seus próprios quando tiver capturas de tela ou diagramas para adicionar.As novas seções adicionadas são:

1. **Badges** no topo do documento: versão, licença e requisito do Node.js
2. **Exemplos de Uso** com diálogos demonstrativos
3. **Roadmap** com planos futuros organizados por trimestres
4. **Troubleshooting** com soluções para problemas comuns
5. **Demonstração** com espaço para imagens e diagramas explicativos
6. Formatação melhorada com blocos de código para comandos

Você precisará substituir os links de exemplo para imagens pelos seus próprios quando tiver capturas de tela ou diagramas para adicionar.