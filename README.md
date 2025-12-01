# WhatsApp CRM Backend

A clean, modular backend for a WhatsApp CRM system built with Node.js, TypeScript, Express, and Supabase.

## Tech Stack

- **Node.js** with **TypeScript**
- **Express** - Web framework
- **whatsapp-web.js** - WhatsApp Web integration
- **Supabase** - PostgreSQL database
- **Socket.io** - Real-time communication
- **dotenv** - Environment variable management

## Project Structure

```
awfar-crm-backend/
├── src/
│   ├── config/
│   │   └── env.ts                 # Environment configuration
│   ├── domain/
│   │   └── whatsapp/              # Domain models & interfaces
│   │       ├── types.ts
│   │       └── interfaces.ts
│   ├── application/
│   │   └── whatsapp/              # Use cases & business logic
│   │       └── WhatsAppService.ts
│   ├── infrastructure/
│   │   ├── supabase/              # Supabase client
│   │   │   └── client.ts
│   │   ├── whatsapp/              # WhatsApp client wrapper
│   │   │   └── WhatsAppClient.ts
│   │   └── realtime/              # Socket.io server
│   │       └── socketServer.ts
│   ├── interfaces/
│   │   ├── http/                  # Express routes & controllers
│   │   │   ├── app.ts
│   │   │   ├── routes/
│   │   │   │   └── whatsappRoutes.ts
│   │   │   └── controllers/
│   │   │       └── WhatsAppController.ts
│   │   └── ws/                    # Socket.io event handlers (TODO)
│   └── server.ts                  # Application entry point
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── .eslintrc.json
└── .prettierrc
```

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and configure your environment variables:
   ```bash
   cp .env.example .env
   ```

4. Update `.env` with your actual values:
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key
   - `JWT_SECRET`: A secure random string for JWT signing
   - `CLIENT_ORIGIN`: Your frontend URL (for CORS)

## Running the Application

### Development Mode
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

## API Endpoints

### WhatsApp Routes

- `GET /api/whatsapp/status` - Get WhatsApp connection status
- `GET /api/whatsapp/qr` - Get QR code for authentication
- `POST /api/whatsapp/send` - Send a WhatsApp message
  ```json
  {
    "to": "1234567890",
    "message": "Hello from CRM!"
  }
  ```

### Health Check

- `GET /health` - Server health check

## Socket.io Events

### Server → Client

- `whatsapp:qr` - QR code generated for scanning
- `whatsapp:ready` - WhatsApp session is ready
- `whatsapp:disconnected` - WhatsApp session disconnected
- `message:incoming` - New message received

## TODO / Future Enhancements

- [ ] Integrate Supabase for persistent storage
  - [ ] Store sessions, chats, messages
  - [ ] Store user data for multi-user support
- [ ] Add authentication & authorization
  - [ ] JWT-based auth
  - [ ] User registration/login
  - [ ] Protected routes
- [ ] Multi-session support
  - [ ] Multiple WhatsApp accounts per user
  - [ ] Session management UI
- [ ] AI Agent integration
  - [ ] Auto-reply functionality
  - [ ] Conversation context management
  - [ ] Custom reply templates
- [ ] Enhanced features
  - [ ] Contact management
  - [ ] Chat analytics
  - [ ] Media handling
  - [ ] Bulk messaging
  - [ ] Scheduled messages

## Development Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Run production build
- `npm run lint` - Lint code
- `npm run lint:fix` - Lint and fix code
- `npm run format` - Format code with Prettier

## License

MIT
