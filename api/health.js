const fs = require('fs');

const STATUS_FILE = '/tmp/whatsapp-status-vercel.json';

module.exports = async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');
    
    try {
        let botStatus = {};
        if (fs.existsSync(STATUS_FILE)) {
            botStatus = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
        }
        
        const healthData = {
            status: 'healthy',
            service: 'whatsapp-ai-bot',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: {
                rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
                heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`,
                heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`
            },
            node: {
                version: process.version,
                platform: process.platform
            },
            whatsapp: botStatus
        };
        
        return res.status(200).json(healthData);
        
    } catch (error) {
        return res.status(200).json({
            status: 'degraded',
            error: error.message,
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    }
};