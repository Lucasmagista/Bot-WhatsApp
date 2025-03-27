# Bot Dashboard Backend

Este é o backend do projeto Bot Dashboard, que fornece uma interface para gerenciar e monitorar um bot. O backend é construído utilizando Node.js e Express, e se comunica com um banco de dados para armazenar informações sobre usuários e o estado do bot.

## Estrutura do Projeto

A estrutura do projeto é organizada da seguinte forma:

```
backend/
├── src/
│   ├── controllers/          # Controladores para gerenciar a lógica de negócios
│   │   ├── authController.js  # Gerencia autenticação de usuários
│   │   ├── botController.js   # Gerencia interações com o bot
│   │   └── dashboardController.js # Fornece dados para a dashboard
│   ├── middleware/           # Middleware para tratamento de requisições
│   │   ├── auth.js           # Verifica autenticação do usuário
│   │   └── errorHandler.js    # Trata erros de forma centralizada
│   ├── models/               # Modelos de dados
│   │   ├── botModel.js       # Define o modelo do bot
│   │   └── userModel.js      # Define o modelo do usuário
│   ├── routes/               # Rotas da API
│   │   ├── authRoutes.js     # Rotas de autenticação
│   │   ├── botRoutes.js      # Rotas para gerenciar o bot
│   │   └── dashboardRoutes.js # Rotas para acessar dados da dashboard
│   ├── services/             # Lógica de negócios
│   │   └── botService.js     # Comunicação com APIs externas
│   ├── utils/                # Utilitários
│   │   └── logger.js         # Funções para registro de logs
│   ├── config.js             # Configurações do aplicativo
│   ├── database.js           # Gerencia a conexão com o banco de dados
│   └── server.js             # Ponto de entrada do servidor
├── package.json               # Configuração do npm
└── README.md                  # Documentação do backend
```

## Instalação

Para instalar as dependências do projeto, execute o seguinte comando na raiz do diretório `backend`:

```
npm install
```

## Execução

Para iniciar o servidor, utilize o comando:

```
npm start
```

O servidor estará disponível em `http://localhost:3000` por padrão.

## Endpoints

### Autenticação

- `POST /api/auth/login`: Realiza o login do usuário.
- `POST /api/auth/register`: Registra um novo usuário.

### Bot

- `POST /api/bot/start`: Inicia o bot.
- `POST /api/bot/stop`: Para o bot.
- `GET /api/bot/status`: Obtém o status atual do bot.

### Dashboard

- `GET /api/dashboard/stats`: Obtém estatísticas de uso do bot.
- `GET /api/dashboard/status`: Obtém o status do bot.

## Contribuição

Contribuições são bem-vindas! Sinta-se à vontade para abrir um pull request ou relatar problemas.

## Licença

Este projeto está licenciado sob a MIT License. Veja o arquivo LICENSE para mais detalhes.