# WhatsApp Business Bot para Serviços de Informática

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/seunome/whatsapp-bot)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/seunome/whatsapp-bot/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)](https://nodejs.org/en/download/)
[![React](https://img.shields.io/badge/frontend-React-blue)](https://reactjs.org/)
[![SQLite](https://img.shields.io/badge/database-SQLite-lightgrey)](https://sqlite.org/index.html)

Este projeto é um bot automatizado para WhatsApp Business utilizando a biblioteca [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js). Ele inclui um **painel administrativo (dashboard)** desenvolvido em React e Node.js para gerenciar interações, agendamentos e métricas.

## Sobre
**Um cliente de API do WhatsApp que se conecta por meio do aplicativo do navegador WhatsApp Web**

A biblioteca funciona iniciando o aplicativo do navegador WhatsApp Web e gerenciando-o usando o Puppeteer para criar uma instância do WhatsApp Web, mitigando assim o risco de ser bloqueado. O cliente da API do WhatsApp se conecta por meio do aplicativo do navegador WhatsApp Web, acessando suas funções internas. Isso lhe concede acesso a quase todos os recursos disponíveis no WhatsApp Web, permitindo um manuseio dinâmico semelhante a qualquer outro aplicativo Node.js.

> [!IMPORTANT]
> **Não há garantia de que você não será bloqueado usando esse método. O WhatsApp não permite bots ou clientes não oficiais em sua plataforma, então isso não deve ser considerado totalmente seguro.**

---

## Funcionalidades

### Bot WhatsApp
- **Boas-vindas automáticas**: Mensagem personalizada ao iniciar conversa.
- **Orçamentos**: Consulta de preços para diversos serviços.
- **Agendamentos**: Marcação de visitas técnicas ou atendimentos.
- **FAQ**: Respostas automáticas para perguntas frequentes.
- **Emergências**: Protocolo de atendimento prioritário.
- **Atendimento humano**: Encaminhamento para atendente quando necessário.

### Dashboard (Painel Administrativo)
- **Visualização de métricas**: Acompanhe o número de interações, serviços agendados e mensagens enviadas.
- **Gerenciamento de agendamentos**: Visualize, edite ou exclua agendamentos.
- **Controle de FAQ**: Adicione, edite ou remova perguntas frequentes.
- **Logs de mensagens**: Histórico de interações com clientes.
- **Configurações**: Ajuste horários de funcionamento, mensagens automáticas e mais.

---

## Requisitos

- **Bot Principal**:
  - Node.js 14 ou superior
  - SQLite (banco de dados local)
- **Dashboard**:
  - Backend: Node.js e Express
  - Frontend: React.js
  - Navegador moderno (Chrome, Firefox, etc.)

---

## Instalação

### Bot Principal
1. Clone o repositório:
   ```bash
   git clone https://github.com/seunome/whatsapp-bot.git
   cd whatsapp-bot
   ```

2. Instale as dependências:
   ```bash
   npm install
   npm install uuid
   node scripts/runSeedFAQ.js
   npm install node-cache
   ```

3. Configure o arquivo `.env`:
   ```bash
   cp .env.example .env
   ```

4. Inicie o bot:
   ```bash
   npm start
   ```

5. Escaneie o código QR que aparecerá no terminal usando o WhatsApp no seu celular.

### Dashboard (Backend e Frontend)
1. Navegue até a pasta do dashboard:
   ```bash
   cd bot-dashboard
   ```

2. Instale as dependências do backend:
   ```bash
   cd backend
   npm install
   ```

3. Configure o arquivo `.env` do backend:
   ```bash
   cp .env.example .env
   ```

4. Inicie o backend:
   ```bash
   npm start
   ```

5. Instale as dependências do frontend:
   ```bash
   cd ../frontend
   npm install
   ```

6. Inicie o servidor de desenvolvimento do frontend:
   ```bash
   npm start
   ```

7. Acesse o painel no navegador:
   ```
   http://localhost:3000
   ```

---

## Estrutura do Projeto

### Diretório Principal
```
whatsapp-bot/
├── src/                     # Código-fonte do bot principal
├── bot-dashboard/           # Painel administrativo (backend e frontend)
├── .babelrc                 # Configuração do Babel
├── package.json             # Configuração do npm
├── README.md                # Documentação principal
└── .env.example             # Exemplo de configuração de ambiente
```

### Bot Principal
```
src/
├── controllers/             # Controladores para lógica de negócios
│   ├── dialogController.js
│   ├── serviceController.js
│   ├── schedulingController.js
│   └── paymentController.js
├── models/                  # Modelos de dados
│   ├── customerModel.js
│   ├── serviceModel.js
│   └── appointmentModel.js
├── utils/                   # Utilitários
│   ├── database.js
│   ├── formatter.js
│   └── logger.js
├── services/                # Serviços de lógica de negócios
│   ├── faqService.js
│   ├── reminderService.js
│   └── notificationService.js
├── flows/                   # Fluxos de conversa
│   ├── welcomeFlow.js
│   ├── quoteFlow.js
│   ├── schedulingFlow.js
│   ├── faqFlow.js
│   ├── emergencyFlow.js
│   └── humanAgentFlow.js
├── config/                  # Configurações
│   └── config.js
├── app.js                   # Ponto de entrada do bot
└── .env                     # Configurações de ambiente
```

### Dashboard (Backend e Frontend)
```
bot-dashboard/
├── backend/                 # Backend do painel administrativo
│   ├── src/
│   │   ├── controllers/     # Controladores para lógica de negócios
│   │   │   ├── authController.js
│   │   │   ├── botController.js
│   │   │   └── dashboardController.js
│   │   ├── middleware/      # Middleware para tratamento de requisições
│   │   │   ├── auth.js
│   │   │   └── errorHandler.js
│   │   ├── models/          # Modelos de dados
│   │   │   ├── botModel.js
│   │   │   └── userModel.js
│   │   ├── routes/          # Rotas da API
│   │   │   ├── authRoutes.js
│   │   │   ├── botRoutes.js
│   │   │   └── dashboardRoutes.js
│   │   ├── services/        # Lógica de negócios
│   │   │   └── botService.js
│   │   ├── utils/           # Utilitários
│   │   │   └── logger.js
│   │   ├── config.js        # Configurações do aplicativo
│   │   ├── database.js      # Gerencia a conexão com o banco de dados
│   │   └── server.js        # Ponto de entrada do servidor
│   ├── package.json         # Configuração do npm
│   └── .env.example         # Exemplo de configuração de ambiente
├── frontend/                # Frontend do painel administrativo
│   ├── public/              # Arquivos públicos (HTML, ícones, etc.)
│   ├── src/
│   │   ├── components/      # Componentes reutilizáveis do React
│   │   ├── pages/           # Páginas principais do painel
│   │   ├── services/        # Serviços para chamadas à API
│   │   ├── styles/          # Arquivos de estilo (CSS/SASS)
│   │   ├── App.js           # Componente principal do React
│   │   └── index.js         # Ponto de entrada do React
│   ├── package.json         # Configuração do npm
│   ├── .env                 # Configurações de ambiente
│   └── README.md            # Documentação do frontend
└── build/                   # Arquivos estáticos gerados após build
```

---

## Configuração

As principais configurações são feitas através do arquivo `.env`:

- `PORT`: Porta do servidor web (padrão: 3000)
- `COMPANY_NAME`: Nome da sua empresa
- `BUSINESS_HOURS_START/END`: Horários de funcionamento

---

## Exemplos de Uso

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

---

## Roadmap

### Próximas Atualizações
- Integração com sistema de pagamentos.
- Suporte a múltiplos idiomas.
- Interface administrativa web.

### Futuro
- Implementação de IA para respostas mais contextuais.
- Integração com sistema de CRM.
- Suporte a múltiplos atendentes.

---

## Contribuindo

1. Faça um fork do projeto.
2. Crie uma branch para sua feature:
   ```bash
   git checkout -b feature/nova-funcionalidade
   ```
3. Faça commit das mudanças:
   ```bash
   git commit -m 'Adiciona nova funcionalidade'
   ```
4. Faça push para a branch:
   ```bash
   git push origin feature/nova-funcionalidade
   ```
5. Abra um Pull Request.

---

## Contribuindo

Sinta-se à vontade para abrir solicitações de pull; contribuições são bem-vindas! No entanto, para mudanças significativas, é melhor abrir um problema com antecedência. Certifique-se de revisar nossas [diretrizes de contribuição][contribuindo] antes de criar um pull request. Antes de criar seu próprio problema ou solicitação de pull, sempre verifique se já existe um!

## Isenção de responsabilidade

Este projeto não é afiliado, associado, autorizado, endossado por, ou de qualquer forma oficialmente conectado ao WhatsApp ou qualquer uma de suas subsidiárias ou afiliadas. O site oficial do WhatsApp pode ser encontrado em [whatsapp.com][whatsapp]. "WhatsApp", bem como nomes, marcas, emblemas e imagens relacionados são marcas registradas de seus respectivos proprietários. Também não há garantia de que você não será bloqueado usando este método. O WhatsApp não permite bots ou clientes não oficiais em sua plataforma, então isso não deve ser considerado totalmente seguro.

## Licença

Copyright 2019 Lucas V Magista  

Este projeto é licenciado sob a Licença MIT. Veja o [LICENSE](LICENSE) arquivo para mais detalhes.

Licenciado sob a Licença Apache, Versão 2.0 (a "Licença");
você não pode usar este projeto exceto em conformidade com a Licença.
Você pode obter uma cópia da Licença em http://www.apache.org/licenses/LICENSE-2.0.

A menos que exigido pela lei aplicável ou acordado por escrito, o software
distribuído sob a Licença é distribuído "NO ESTADO EM QUE SE ENCONTRA",
SEM GARANTIAS OU CONDIÇÕES DE QUALQUER TIPO, expressas ou implícitas.
Veja a Licença para o idioma específico que rege as permissões e
limitações sob a Licença.
