# 🤖 Deriv Trading Bot - Volatilidade 10

Sistema automatizado para trading na Deriv com estratégia específica para Volatilidade 10 (1s).

## 🎯 Estratégia Implementada

- **Mercado**: Volatilidade 10 (1s)
- **Lógica**: Aguarda 6 dígitos pares consecutivos, então entra no próximo dígito ímpar
- **Martingale**: Multiplicador de 2.2x em caso de perda
- **Reset**: Após vitória, volta a aguardar 6 pares

## 📋 Pré-requisitos

- Node.js (versão 14 ou superior)
- Conta Demo na Deriv
- Token de API da Deriv

## 🚀 Instalação

1. **Clone/Baixe os arquivos do projeto**

2. **Instale as dependências:**
```bash
npm install
```

3. **Inicie o servidor:**
```bash
npm start
```

4. **Acesse a interface:**
```
http://localhost:3000
```

## 🔑 Obtendo o Token da API Deriv

1. Acesse https://app.deriv.com
2. Faça login na sua conta DEMO
3. Vá em **Configurações** → **API Token**
4. Crie um novo token com as seguintes permissões:
   - ✅ Read
   - ✅ Trade
   - ✅