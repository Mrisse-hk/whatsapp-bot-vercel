const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

// ================= CONFIGURATION =================
const TMP_DIR = '/tmp';
const SESSION_DIR = path.join(TMP_DIR, 'whatsapp-sessions-vercel');
const QR_FILE = path.join(TMP_DIR, 'whatsapp-qr-vercel.txt');
const STATUS_FILE = path.join(TMP_DIR, 'whatsapp-status-vercel.json');

// ================= ÉTAT GLOBAL =================
let whatsappClient = null;
let currentQR = null;
let botStatus = 'initializing';
let lastActivity = new Date();
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// ================= INITIALISATION DOSSIERS =================
function initDirectories() {
    try {
        if (!fs.existsSync(SESSION_DIR)) {
            fs.mkdirSync(SESSION_DIR, { recursive: true });
            console.log(`📁 Dossier session créé: ${SESSION_DIR}`);
        }
        
        // Initialiser fichiers
        if (!fs.existsSync(STATUS_FILE)) {
            fs.writeFileSync(STATUS_FILE, JSON.stringify({
                status: 'initializing',
                lastUpdate: new Date().toISOString()
            }, null, 2));
        }
    } catch (error) {
        console.error('❌ Erreur création dossiers:', error.message);
    }
}

// ================= SERVICE IA =================
class AIService {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
        if (!this.apiKey) {
            console.warn('⚠️ Aucune clé Gemini API trouvée. Utilisation mode démo.');
        } else {
            console.log('✅ Service AI initialisé');
            this.genAI = new GoogleGenerativeAI(this.apiKey);
        }
    }

    async generateResponse(message, sender) {
        try {
            if (!this.apiKey) {
                return this.getDemoResponse(message);
            }

            const model = this.genAI.getGenerativeModel({ model: "gemini-pro" });
            
            const prompt = `Tu es un assistant client professionnel pour une entreprise française.
            
CONTEXTE:
- Entreprise: Plateforme SaaS
- Services: Développement web, Applications mobiles, Hébergement
- Support: support@entreprise.com
- Heures: 9h-18h du lundi au vendredi

TÂCHE: Répondre au message client de manière utile, concise et professionnelle.
TONE: Amical mais professionnel, en français.

Message client: "${message}"

RÈGLES:
1. Réponds en français uniquement
2. Sois concis (max 3 lignes)
3. Si tu ne sais pas, propose de contacter support@entreprise.com
4. Ne crée pas d'informations fictives
5. Pour les urgences, donne le numéro: +33 1 23 45 67 89

Réponse:`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
            
        } catch (error) {
            console.error('❌ Erreur AI:', error.message);
            return "Merci pour votre message. Notre équipe vous répondra rapidement. Pour une réponse immédiate, contactez support@entreprise.com";
        }
    }

    getDemoResponse(message) {
        const responses = [
            "Bonjour ! Je suis votre assistant virtuel. Notre équipe reviendra vers vous dans les plus brefs délais.",
            "Merci pour votre message. Un conseiller vous contactera rapidement.",
            "Nous avons bien reçu votre demande. Nos horaires sont du lundi au vendredi, 9h-18h.",
            "Pour une assistance immédiate, veuillez envoyer un email à support@entreprise.com",
            "Je note votre demande. Notre équipe technique y répondra prochainement."
        ];
        return responses[Math.floor(Math.random() * responses.length)];
    }
}

// ================= WHATSAPP CLIENT =================
async function initializeWhatsApp() {
    if (whatsappClient) {
        console.log('⚠️ WhatsApp déjà initialisé');
        return;
    }

    console.log('🚀 Initialisation WhatsApp...');
    botStatus = 'initializing';
    updateStatusFile();
    
    try {
        // Préparer les dossiers
        initDirectories();
        
        whatsappClient = new Client({
            authStrategy: new LocalAuth({
                clientId: 'vercel-production-bot',
                dataPath: SESSION_DIR
            }),
            puppeteer: {
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu',
                    '--single-process'
                ],
                executablePath: process.env.CHROME_PATH || 
                    '/usr/bin/google-chrome-stable' ||
                    '/usr/bin/chromium-browser'
            },
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
            }
        });

        // ================= ÉVÉNEMENTS WHATSAPP =================
        
        // QR Code
        whatsappClient.on('qr', (qr) => {
            console.log('📱 QR Code reçu');
            currentQR = qr;
            botStatus = 'awaiting_qr_scan';
            
            // Sauvegarder QR
            try {
                fs.writeFileSync(QR_FILE, qr);
                console.log('💾 QR sauvegardé dans', QR_FILE);
            } catch (error) {
                console.error('❌ Erreur sauvegarde QR:', error);
            }
            
            // Afficher dans terminal
            console.log('\n' + '='.repeat(50));
            console.log('SCANNEZ CE QR CODE AVEC WHATSAPP:');
            console.log('1. Ouvrez WhatsApp sur votre téléphone');
            console.log('2. Menu → Appareils connectés → Lier un appareil');
            console.log('3. Scannez le code ci-dessous\n');
            qrcode.generate(qr, { small: true });
            console.log('\n' + '='.repeat(50));
            
            updateStatusFile();
        });

        // Prêt
        whatsappClient.on('ready', () => {
            console.log('✅✅✅ WHATSAPP CONNECTÉ AVEC SUCCÈS !');
            botStatus = 'connected';
            currentQR = null;
            reconnectAttempts = 0;
            lastActivity = new Date();
            
            // Nettoyer fichier QR
            if (fs.existsSync(QR_FILE)) {
                fs.writeFileSync(QR_FILE, 'CONNECTED');
            }
            
            updateStatusFile();
            
            console.log('\n✨ Le bot est maintenant actif !');
            console.log('✨ Il répondra automatiquement aux messages');
        });

        // Authentifié
        whatsappClient.on('authenticated', () => {
            console.log('🔐 Authentifié avec WhatsApp');
            botStatus = 'authenticated';
            updateStatusFile();
        });

        // Déconnexion
        whatsappClient.on('disconnected', (reason) => {
            console.log('❌ Déconnecté de WhatsApp:', reason);
            botStatus = 'disconnected';
            whatsappClient = null;
            
            reconnectAttempts++;
            
            if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
                console.log(`🔄 Tentative de reconnexion ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} dans 10 secondes...`);
                setTimeout(() => {
                    if (botStatus === 'disconnected') {
                        initializeWhatsApp();
                    }
                }, 10000);
            } else {
                console.log('❌❌❌ Nombre maximum de tentatives atteint. Redémarrage nécessaire.');
            }
            
            updateStatusFile();
        });

        // Erreur d'auth
        whatsappClient.on('auth_failure', (msg) => {
            console.error('❌ Échec authentification:', msg);
            botStatus = 'auth_failure';
            updateStatusFile();
        });

        // ================= GESTION DES MESSAGES =================
        whatsappClient.on('message', async (msg) => {
            // Ignorer les messages envoyés par le bot
            if (msg.fromMe) return;
            
            console.log(`\n📩 NOUVEAU MESSAGE 📩`);
            console.log(`De: ${msg.from}`);
            console.log(`Texte: ${msg.body.substring(0, 100)}`);
            console.log(`Heure: ${new Date().toLocaleTimeString()}`);
            
            lastActivity = new Date();
            
            // Vérifier si c'est un groupe
            const isGroup = msg.from.endsWith('@g.us');
            
            // Règles de réponse
            let shouldRespond = true;
            
            if (isGroup) {
                // Dans un groupe, ne répondre que si mentionné
                shouldRespond = msg.body.toLowerCase().includes('@bot') || 
                               msg.body.toLowerCase().includes('assistant');
                if (shouldRespond) {
                    console.log('👥 Répondant dans le groupe (mention détectée)');
                }
            }
            
            if (shouldRespond && msg.body.trim().length > 0) {
                try {
                    console.log('🤖 Génération réponse IA...');
                    const ai = new AIService();
                    const response = await ai.generateResponse(msg.body, msg.from);
                    
                    console.log(`💬 Réponse IA: ${response.substring(0, 100)}...`);
                    
                    await msg.reply(response);
                    console.log('✅ Réponse envoyée avec succès');
                    
                } catch (error) {
                    console.error('❌ Erreur réponse:', error.message);
                    await msg.reply("Désolé, une erreur est survenue. Notre équipe sera notifiée.");
                }
            }
            
            updateStatusFile();
        });

        // Message envoyé
        whatsappClient.on('message_create', (msg) => {
            if (msg.fromMe) {
                lastActivity = new Date();
            }
        });

        // Démarrer WhatsApp
        console.log('🔄 Lancement du client WhatsApp...');
        await whatsappClient.initialize();
        
    } catch (error) {
        console.error('❌❌❌ ERREUR INITIALISATION WHATSAPP:', error.message);
        botStatus = 'error';
        whatsappClient = null;
        updateStatusFile();
        
        // Réessayer après 30 secondes
        setTimeout(() => {
            if (botStatus === 'error') {
                console.log('🔄 Réessai après erreur...');
                initializeWhatsApp();
            }
        }, 30000);
    }
}

// ================= FONCTIONS UTILITAIRES =================
function updateStatusFile() {
    try {
        const statusData = {
            status: botStatus,
            lastUpdate: new Date().toISOString(),
            lastActivity: lastActivity.toISOString(),
            connected: botStatus === 'connected',
            qrAvailable: !!currentQR,
            reconnectAttempts,
            uptime: process.uptime()
        };
        
        fs.writeFileSync(STATUS_FILE, JSON.stringify(statusData, null, 2));
    } catch (error) {
        console.error('Erreur mise à jour statut:', error);
    }
}

// ================= HANDLER API VERCEL =================
module.exports = async function handler(req, res) {
    // Headers CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // Initialiser WhatsApp au premier appel
    if (!whatsappClient && botStatus === 'initializing') {
        initializeWhatsApp().catch(console.error);
    }
    
    const { method, query } = req;
    const action = query.action || 'status';
    
    try {
        switch (action) {
            case 'qr':
                let qrContent = '';
                if (fs.existsSync(QR_FILE)) {
                    qrContent = fs.readFileSync(QR_FILE, 'utf8');
                }
                
                return res.status(200).json({
                    success: true,
                    qr: qrContent,
                    status: botStatus,
                    hasQr: qrContent && qrContent !== 'CONNECTED',
                    message: botStatus === 'connected' 
                        ? 'WhatsApp est connecté' 
                        : botStatus === 'awaiting_qr_scan'
                        ? 'Scannez le QR Code avec WhatsApp'
                        : 'Initialisation en cours...'
                });
                
            case 'status':
                let statusData = {};
                if (fs.existsSync(STATUS_FILE)) {
                    statusData = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
                }
                
                return res.status(200).json({
                    success: true,
                    ...statusData,
                    serverTime: new Date().toISOString(),
                    platform: 'Vercel',
                    endpoints: {
                        qr: '/api/whatsapp?action=qr',
                        status: '/api/whatsapp?action=status',
                        restart: '/api/whatsapp?action=restart',
                        health: '/api/health'
                    }
                });
                
            case 'restart':
                if (whatsappClient) {
                    await whatsappClient.destroy();
                    whatsappClient = null;
                }
                botStatus = 'initializing';
                reconnectAttempts = 0;
                
                // Nettoyer fichiers temporaires
                if (fs.existsSync(QR_FILE)) {
                    fs.unlinkSync(QR_FILE);
                }
                
                initializeWhatsApp();
                
                return res.status(200).json({
                    success: true,
                    message: 'Redémarrage en cours...',
                    restartInitiated: true
                });
                
            default:
                return res.status(200).json({
                    success: true,
                    service: 'WhatsApp AI Bot - Vercel',
                    version: '1.0.0',
                    status: botStatus,
                    endpoints: [
                        'GET /api/whatsapp?action=qr',
                        'GET /api/whatsapp?action=status',
                        'POST /api/whatsapp?action=send',
                        'GET /api/whatsapp?action=restart'
                    ],
                    documentation: 'Accédez à / pour l\'interface web'
                });
        }
    } catch (error) {
        console.error('❌ Erreur API:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            status: botStatus
        });
    }
};

// ================= KEEP-ALIVE =================
// Empêcher Vercel de tuer la fonction
setInterval(() => {
    if (whatsappClient && botStatus === 'connected') {
        // Juste mettre à jour le timestamp
        lastActivity = new Date();
        updateStatusFile();
    }
}, 30000); // Toutes les 30 secondes

// ================= DÉMARRAGE AUTO =================
// Démarrer WhatsApp au chargement
console.log('⚡ WhatsApp Bot démarre sur Vercel...');
console.log('📁 Dossier sessions:', SESSION_DIR);
initializeWhatsApp().catch(console.error);