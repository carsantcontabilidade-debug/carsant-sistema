# 🚀 CARSANT — Guia de Instalação (Windows)

Siga este guia passo a passo. Cada etapa tem os comandos exatos para copiar e colar.  
Tempo estimado: **1 a 2 horas**.

---

## ETAPA 1 — Instalar os programas necessários

### 1.1 Node.js
1. Acesse: https://nodejs.org
2. Clique no botão verde **"LTS"** (versão recomendada)
3. Baixe e instale o arquivo `.msi`
4. Na instalação, deixe todas as opções marcadas e clique em **Next** até o fim

**Verificar se instalou corretamente:**
Abra o **Prompt de Comando** (pesquise "cmd" no Windows) e digite:
```
node --version
```
Deve aparecer algo como: `v20.11.0`

---

### 1.2 Git
1. Acesse: https://git-scm.com/download/win
2. Baixe e instale o arquivo `.exe`
3. Deixe todas as opções padrão e clique em **Next** até o fim

**Verificar:**
```
git --version
```
Deve aparecer: `git version 2.x.x`

---

### 1.3 VS Code (editor de código)
1. Acesse: https://code.visualstudio.com
2. Baixe e instale o arquivo `.exe`

---

## ETAPA 2 — Configurar o Supabase (banco de dados)

### 2.1 Criar conta
1. Acesse: https://supabase.com
2. Clique em **Start your project**
3. Faça login com sua conta Google ou crie uma conta

### 2.2 Criar o projeto
1. Clique em **New Project**
2. Preencha:
   - **Name:** carsant-sistema
   - **Database Password:** crie uma senha forte (anote em lugar seguro!)
   - **Region:** South America (São Paulo) ou US East
3. Clique em **Create new project**
4. Aguarde cerca de 1 minuto enquanto o banco é criado

### 2.3 Criar as tabelas
1. No menu lateral, clique em **SQL Editor**
2. Clique em **New query**
3. Abra o arquivo `supabase/schema.sql` que está na pasta do projeto
4. Copie **todo** o conteúdo do arquivo
5. Cole no editor do Supabase
6. Clique no botão **Run** (ou pressione Ctrl+Enter)
7. Deve aparecer: "Success. No rows returned"

### 2.4 Pegar as chaves de acesso
1. No menu lateral, vá em **Settings → API**
2. Copie e anote:
   - **Project URL** (exemplo: `https://xyzxyz.supabase.co`)
   - **anon / public key** (chave longa começando com `eyJ...`)

---

## ETAPA 3 — Configurar e rodar o projeto

### 3.1 Abrir o projeto no VS Code
1. Extraia o arquivo `.zip` do projeto em uma pasta (ex: `C:\carsant`)
2. Abra o VS Code
3. Clique em **File → Open Folder**
4. Selecione a pasta `carsant`

### 3.2 Configurar as variáveis de ambiente
1. Na pasta do projeto, localize o arquivo `.env.example`
2. Faça uma cópia dele e renomeie para `.env`
3. Abra o arquivo `.env` e preencha com suas chaves do Supabase:
```
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua_chave_anon_aqui
```
4. Salve o arquivo

### 3.3 Instalar as dependências e rodar
1. No VS Code, abra o Terminal: **Terminal → New Terminal**
2. Digite os seguintes comandos um por vez:

```bash
npm install
```
*(aguarde — vai baixar as dependências, pode demorar 1-2 minutos)*

```bash
npm run dev
```

3. Deve aparecer algo como:
```
  VITE v5.x.x  ready in 500ms
  ➜  Local:   http://localhost:5173/
```

4. Abra o navegador e acesse: **http://localhost:5173**

---

## ETAPA 4 — Criar o primeiro usuário (gestor)

### 4.1 Criar usuário no Supabase
1. No Supabase, vá em **Authentication → Users**
2. Clique em **Add user → Create new user**
3. Preencha seu e-mail e senha
4. Clique em **Create user**

### 4.2 Definir como gestor
1. Ainda no Supabase, vá em **SQL Editor**
2. Cole e execute o comando abaixo (substitua pelo seu e-mail):
```sql
UPDATE profiles SET role = 'gestor', nome = 'Carlos'
WHERE email = 'seu@email.com';
```

### 4.3 Criar usuários dos colaboradores
Repita o passo 4.1 para cada colaborador da equipe:
- Ana (colaborador)
- Pedro (colaborador)
- Maria (colaborador)

Para cada um, após criar, execute:
```sql
UPDATE profiles SET role = 'colaborador', nome = 'Nome do colaborador'
WHERE email = 'email@colaborador.com';
```

---

## ETAPA 5 — Publicar na internet (Vercel)

### 5.1 Criar conta no GitHub
1. Acesse: https://github.com
2. Crie uma conta gratuita

### 5.2 Subir o código para o GitHub
No terminal do VS Code:
```bash
git init
git add .
git commit -m "CARSANT sistema v1.0"
```

1. No GitHub, clique em **New repository**
2. Nome: `carsant-sistema`
3. Deixe **Private** marcado e clique em **Create repository**
4. Copie os 2 comandos que aparecem na seção "push an existing repository" e execute no terminal

### 5.3 Publicar na Vercel
1. Acesse: https://vercel.com
2. Faça login com sua conta GitHub
3. Clique em **Add New → Project**
4. Selecione o repositório `carsant-sistema`
5. Clique em **Deploy**
6. Aguarde — em cerca de 1 minuto o sistema estará no ar!

### 5.4 Configurar as variáveis de ambiente na Vercel
1. No painel da Vercel, vá em **Settings → Environment Variables**
2. Adicione as mesmas variáveis do arquivo `.env`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Clique em **Save** e depois em **Redeploy**

**Pronto! O sistema estará acessível em um endereço como:**  
`https://carsant-sistema.vercel.app`

---

## ETAPA 6 — Instalar como app no celular (PWA)

### Android
1. Abra o endereço do sistema no Chrome
2. Toque no menu (⋮) → **Adicionar à tela inicial**
3. Confirme — o app aparecerá como um ícone normal na sua tela

### iPhone (Safari)
1. Abra o endereço no Safari
2. Toque no botão de compartilhar (□↑)
3. Selecione **Adicionar à Tela de Início**

---

## ❓ Problemas comuns

**"node não é reconhecido como comando"**  
→ Feche e reabra o terminal após instalar o Node.js

**Erro ao rodar `npm install`**  
→ Verifique se está dentro da pasta correta do projeto no terminal

**Tela branca ao abrir o sistema**  
→ Verifique se o arquivo `.env` foi criado corretamente com as chaves do Supabase

**Não consigo fazer login**  
→ Verifique se o usuário foi criado em Authentication → Users no Supabase

---

## 📞 Suporte

Se tiver dificuldades em qualquer etapa, volte à conversa com Claude e descreva onde travou.  
Cada passo pode ser feito com calma — o sistema esperará por você! 😊

---

**CARSANT CONTABILIDADE — Sistema de Gestão**  
Desenvolvido com Claude · Feira de Santana, BA
