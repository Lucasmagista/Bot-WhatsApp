# Bot Dashboard Frontend

Este é o frontend do projeto Bot Dashboard, uma aplicação que permite gerenciar e monitorar um bot de forma eficiente. Abaixo estão as informações sobre a estrutura do projeto, como configurar e executar a aplicação, além de detalhes sobre os componentes principais.

## Estrutura do Projeto

```
frontend
├── public
│   └── index.html          # HTML principal da aplicação
├── src
│   ├── components          # Componentes reutilizáveis da aplicação
│   │   ├── Auth            # Componentes de autenticação
│   │   │   ├── Login.jsx   # Componente de login
│   │   │   └── Register.jsx # Componente de registro
│   │   ├── Dashboard       # Componentes da dashboard
│   │   │   ├── BotStatus.jsx # Exibe o status do bot
│   │   │   ├── CommandsList.jsx # Lista de comandos do bot
│   │   │   ├── Statistics.jsx # Exibe estatísticas de uso do bot
│   │   │   └── Settings.jsx # Permite ajustes nas configurações do bot
│   │   └── Layout          # Componentes de layout
│   │       ├── Header.jsx  # Cabeçalho da aplicação
│   │       ├── Sidebar.jsx  # Barra lateral da aplicação
│   │       └── Footer.jsx   # Rodapé da aplicação
│   ├── pages               # Páginas da aplicação
│   │   ├── Dashboard.jsx    # Página principal da dashboard
│   │   ├── Login.jsx        # Página de login
│   │   └── Settings.jsx     # Página de configurações
│   ├── services            # Serviços para interagir com a API
│   │   ├── api.js          # Funções para interagir com a API do backend
│   │   └── auth.js         # Funções para gerenciar autenticação
│   ├── App.jsx             # Componente principal da aplicação
│   ├── index.jsx           # Ponto de entrada da aplicação
│   └── routes.jsx          # Define as rotas da aplicação
```

## Configuração do Ambiente

1. **Clone o repositório:**
   ```
   git clone <URL_DO_REPOSITORIO>
   cd bot-dashboard/frontend
   ```

2. **Instale as dependências:**
   ```
   npm install
   ```

3. **Inicie a aplicação:**
   ```
   npm start
   ```

A aplicação estará disponível em `http://localhost:3000`.

## Funcionalidades

- **Autenticação:** Os usuários podem se registrar e fazer login para acessar a dashboard.
- **Dashboard:** Visualize o status do bot, comandos disponíveis e estatísticas de uso.
- **Configurações:** Ajuste as configurações do bot conforme necessário.

## Contribuição

Contribuições são bem-vindas! Sinta-se à vontade para abrir um pull request ou relatar problemas.

## Licença

Este projeto está licenciado sob a MIT License. Veja o arquivo LICENSE para mais detalhes.