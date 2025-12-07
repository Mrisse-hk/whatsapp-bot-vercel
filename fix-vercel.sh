#!/data/data/com.termux/files/usr/bin/bash

echo "🔧 Correction des fichiers pour Vercel..."

# 1. Corriger package.json
cat > package.json << 'PJSON'
{
  "name": "whatsapp-bot-vercel",
  "version": "1.0.0",
  "main": "api/whatsapp.js",
  "scripts": {
    "dev": "node api/whatsapp.js",
    "start": "node api/whatsapp.js"
  },
  "dependencies": {
    "@google/generative-ai": "^0.8.0",
    "express": "^4.18.2",
    "puppeteer": "^21.11.0",
    "qrcode-terminal": "^0.12.0",
    "whatsapp-web.js": "^1.23.0"
  },
  "engines": {
    "node": ">=18"
  }
}
PJSON

echo "✅ package.json corrigé"

# 2. Créer vercel.json si manquant
if [ ! -f "vercel.json" ]; then
cat > vercel.json << 'VJSON'
{
  "functions": {
    "api/whatsapp.js": {
      "maxDuration": 60,
      "memory": 3008
    }
  },
  "rewrites": [
    { "source": "/", "dest": "/public/index.html" },
    { "source": "/api/whatsapp", "dest": "/api/whatsapp.js" },
    { "source": "/api/health", "dest": "/api/health.js" }
  ]
}
VJSON
echo "✅ vercel.json créé"
fi

# 3. Mettre à jour GitHub
git add .
git commit -m "Fix Vercel deployment"
git push

echo "🚀 Fichiers corrigés et poussés sur GitHub !"
echo "📱 Allez sur Vercel → votre projet → Redeploy"
