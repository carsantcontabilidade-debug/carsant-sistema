# CARSANT — Instruções de Integração do Módulo Comunicação

## Arquivos entregues
- `Comunicacao.jsx` → copiar para `src/pages/Comunicacao.jsx`
- `comunicacao.js` → copiar para `src/lib/comunicacao.js`
- `comunicacoes.sql` → executar no Supabase SQL Editor

---

## 1. Executar o SQL no Supabase

1. Acesse https://supabase.com → seu projeto
2. Vá em **SQL Editor**
3. Cole o conteúdo de `comunicacoes.sql`
4. Clique em **Run**
5. Confirme que aparece a lista de colunas no final

---

## 2. Copiar os arquivos

```
carsant/
└── src/
    ├── pages/
    │   └── Comunicacao.jsx   ← copiar aqui
    └── lib/
        └── comunicacao.js    ← copiar aqui
```

---

## 3. Adicionar rota no App.jsx

Abra `src/App.jsx` e adicione:

```jsx
// No topo, junto com os outros imports de páginas:
import Comunicacao from './pages/Comunicacao'

// Dentro do <Routes>, junto com as outras rotas:
<Route path="/comunicacao" element={<Comunicacao />} />
```

Exemplo de como ficará a seção de rotas:
```jsx
<Routes>
  <Route path="/" element={<Dashboard />} />
  <Route path="/clientes" element={<Clientes />} />
  <Route path="/honorarios" element={<Honorarios />} />
  <Route path="/contas-pagar" element={<ContasPagar />} />
  <Route path="/tarefas" element={<Tarefas />} />
  <Route path="/atendimento" element={<Atendimento />} />
  <Route path="/comunicacao" element={<Comunicacao />} />   {/* ← NOVO */}
  <Route path="/agenda" element={<Agenda />} />
</Routes>
```

---

## 4. Adicionar item no menu lateral (Layout.jsx)

Abra `src/components/Layout/Layout.jsx` e localize o array de itens do menu.
Adicione o item de Comunicação **depois** de Atendimento:

```jsx
{
  path: '/comunicacao',
  label: 'Comunicação',
  icon: '💬',
  // Se o menu tem restrição por perfil, deixe acessível para todos (gestor e colaborador)
  // roles: ['gestor', 'colaborador']  // sem restrição de perfil
}
```

Se o menu usa condicionais de role, o módulo Comunicação deve ser visível para
**todos os perfis** (gestor e colaborador), pois qualquer membro da equipe pode
registrar atendimentos e enviar mensagens.

---

## 5. Testar

1. Faça `git add . && git commit -m "feat: módulo comunicação - hub de mensagens"` e `git push`
2. Aguarde o deploy na Vercel (~2 minutos)
3. Acesse o sistema e clique em **Comunicação** no menu
4. Selecione um cliente, escolha canal WhatsApp, selecione o template "Cobrança de honorários"
5. Clique em **✨ Gerar com IA** — a mensagem será gerada automaticamente
6. Clique em **📱 Abrir WhatsApp** — o WhatsApp Web abrirá com a mensagem pronta

---

## O que o módulo faz

### Sidebar esquerda
- Lista todos os clientes com busca
- Clique em um cliente para filtrar o histórico por ele
- "Todas as comunicações" mostra o histórico geral

### Área principal
- Histórico de comunicações com canal, template, mensagem, status e responsável
- Filtro por canal (WhatsApp, E-mail, Telefone, Presencial)
- Clique em qualquer comunicação para ver os detalhes completos

### Modal "Nova Comunicação"
- Selecione o cliente
- Escolha o canal (4 botões visuais)
- Para WhatsApp e E-mail: escolha um template e clique em "✨ Gerar com IA"
- Para Telefone e Presencial: escreva o resumo do contato manualmente
- Defina o próximo passo (opcional)
- Botões de ação variam conforme o canal:
  - WhatsApp → "📱 Abrir WhatsApp" (abre wa.me com mensagem pronta)
  - E-mail → "✉️ Abrir E-mail" (abre cliente de e-mail com destinatário e corpo)
  - Telefone/Presencial → "✅ Registrar contato"
  - Qualquer canal → "Salvar como rascunho"

### Templates disponíveis (gerados por IA)
1. 💰 Cobrança de honorários em atraso
2. 📄 Envio de guia DAS/DCTF/FGTS
3. ✅ Aprovação de documentos (folha, balanço, declaração)
4. ⚠️ Aviso de prazo fiscal próximo
5. 👋 Boas-vindas a novo cliente
6. 📋 Envio de folha de pagamento
7. 📂 Solicitação de documentos/notas

---

## Roadmap futuro (Fase 2)

Quando quiser evoluir para API real de WhatsApp:
- **Z-API** (~R$ 50/mês): mais simples, brasileiro, suporte em português
- **Evolution API** (gratuita, requer VPS): self-hosted, mais trabalho de setup
- A estrutura da tabela `comunicacoes` já está pronta para receber IDs de mensagens
  externas e status de entrega/leitura

Para o **Portal do Cliente** (Fase 3):
- Tabela `documentos` já pode ser criada seguindo o mesmo padrão
- A tabela `comunicacoes` servirá de base para o histórico visível ao cliente
