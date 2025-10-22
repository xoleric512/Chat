// telegram_ai_bot_complete.js
require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const OpenAI = require('openai');
const fs = require('fs');

// --- Config / constants ---
const TELEGRAM_TOKEN = "8395679490:AAHqLQ30ADxS2s9_POYHO6Gnzj99w2-BSjg";
const OPENAI_KEY = "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";
const OPENAI_MODEL = "gpt-4o-mini";
const MAX_TOKENS = 800;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 6; // max messages per window per user
const RESPONSE_CHUNK_SIZE = 4000; // Telegram message chunk size

// Validation
if (!TELEGRAM_TOKEN || !OPENAI_KEY) {
    console.error('\nERROR: Missing Telegram or OpenAI keys');
    process.exit(1);
}

// --- Initialize clients ---
const bot = new Telegraf(TELEGRAM_TOKEN);
const openai = new OpenAI({ apiKey: OPENAI_KEY });

// --- Simple in-memory rate limiter ---
const rateMap = new Map();
function allowRequest(userId) {
    const now = Date.now();
    const rec = rateMap.get(userId) || { count: 0, windowStart: now };
    if (now - rec.windowStart > RATE_LIMIT_WINDOW_MS) {
        rec.count = 1;
        rec.windowStart = now;
        rateMap.set(userId, rec);
        return true;
    }
    if (rec.count < RATE_LIMIT_MAX) {
        rec.count += 1;
        rateMap.set(userId, rec);
        return true;
    }
    return false;
}

// --- Helpers ---
function chunkText(text, size) {
    const chunks = [];
    for (let i = 0; i < text.length; i += size) {
        chunks.push(text.slice(i, i + size));
    }
    return chunks;
}

async function callOpenAIChat(userMessage) {
    try {
        const resp = await openai.chat.completions.create({
            model: OPENAI_MODEL,
            messages: [
                { 
                    role: 'system', 
                    content: 'Siz ma\'lumot beruvchi va yordamchi AI botsiz. Javoblar aniq, qisqacha va foydalanuvchi tilida bo\'lsin. Uzbek tilida javob bering.' 
                },
                { role: 'user', content: userMessage }
            ],
            max_tokens: MAX_TOKENS,
            temperature: 0.7
        });

        if (!resp?.choices?.[0]?.message?.content) {
            throw new Error('Invalid response structure from OpenAI');
        }

        return resp.choices[0].message.content.trim();
    } catch (err) {
        console.error('OpenAI call failed:', err?.message || err);
        throw err;
    }
}

// --- Command & handlers ---
bot.start((ctx) => {
    return ctx.reply(
        'Assalomu alaykum! Men AI yordamchi botman. Istalgan matn yuboring va men OpenAI orqali javob beraman. /help uchun tugmani bosing.',
        Markup.inlineKeyboard([[Markup.button.callback('Qo\'llanma', 'HELP')]])
    );
});

bot.command('help', (ctx) => {
    return ctx.reply(
        'Bot ishlashi: istalgan matn yuboring, AI javob beradi.\n\n' +
        'Buyruqlar:\n' +
        '/start - Botni ishga tushirish\n' +
        '/help - Yordam\n' +
        '/status - Bot holati\n\n' +
        'Iltimos, to\'g\'ri va odobli so\'rov yuboring.'
    );
});

bot.action('HELP', (ctx) => {
    ctx.answerCbQuery();
    return ctx.reply(
        'Matn yuboring — men OpenAI orqali javob qaytaraman.\n\n' +
        'Eslatma: Bot test rejimida ishlamoqda. Kalitlarni keyinroq yangilashni unutmang!'
    );
});

// Text handler - asosiy funksiya
bot.on('text', async (ctx) => {
    const userId = ctx.from?.id;
    const userMessage = ctx.message.text || '';

    // Basic checks
    if (!userMessage.trim()) return ctx.reply('Bo\'sh xabar yubormang.');
    if (!allowRequest(userId)) return ctx.reply('Siz juda tez-tez so\'rayapsiz. Iltimos 1 daqiqa kutib yana urinib ko\'ring.');

    console.log(`Request from user ${userId}: ${userMessage.slice(0, 120)}`);

    // Inform user
    const processing = await ctx.reply('🔄 AI bilan ishlanmoqda... (bu bir necha soniya olishi mumkin)');

    try {
        const aiResponse = await callOpenAIChat(userMessage);

        if (!aiResponse) {
            await ctx.reply('❌ AI javob bera olmadi. Iltimos, so\'rovni qisqartirib yoki boshqacha shaklda yuboring.');
            return;
        }

        // Send in chunks if needed
        const parts = chunkText(aiResponse, RESPONSE_CHUNK_SIZE);
        for (const p of parts) {
            await ctx.reply(p);
        }

        // Delete the 'processing' message to clean chat
        try { 
            await ctx.deleteMessage(processing.message_id); 
        } catch (e) { 
            // Ignore if message already deleted or can't be deleted
        }

    } catch (err) {
        console.error('Handler error:', err?.message || err);
        await ctx.reply('❌ Uzr, AI bilan muloqotda xatolik yuz berdi. Keyinroq urinib ko\'ring.');
        
        // Delete processing message on error too
        try { 
            await ctx.deleteMessage(processing.message_id); 
        } catch (e) { }
    }
});

// Status command
bot.command('status', async (ctx) => {
    const userCount = rateMap.size;
    return ctx.reply(
        `🤖 Bot holati: ONLAYN\n\n` +
        `📊 Foydalanuvchilar: ${userCount}\n` +
        `🧠 Model: ${OPENAI_MODEL}\n` +
        `⏰ Cheklov: ${RATE_LIMIT_MAX} so'rov/${RATE_LIMIT_WINDOW_MS/1000} sekund`
    );
});

// Info command
bot.command('info', (ctx) => {
    return ctx.reply(
        '🤖 Telegram AI Bot\n\n' +
        'Bu bot OpenAI API yordamida ishlaydi.\n' +
        'Test rejimida ishlamoqda - kalitlar keyinroq yangilanadi.\n\n' +
        'Developer: @xolerc' + (ctx.from?.username || 'Noma\'lum')
    );
});

// Graceful shutdown
process.once('SIGINT', () => {
    console.log('SIGINT received, stopping bot...');
    bot.stop('SIGINT');
    process.exit(0);
});

process.once('SIGTERM', () => {
    console.log('SIGTERM received, stopping bot...');
    bot.stop('SIGTERM');
    process.exit(0);
});

// Start the bot
console.log('🤖 Bot ishga tushmoqda...');
console.log('📞 Telegram Token: ' + TELEGRAM_TOKEN.substring(0, 10) + '...');
console.log('🧠 OpenAI Model: ' + OPENAI_MODEL);

bot.launch()
    .then(() => {
        console.log('✅ Bot muvaffaqiyatli ishga tushdi!');
        console.log('⏰ Rate limit: ' + RATE_LIMIT_MAX + ' requests per ' + (RATE_LIMIT_WINDOW_MS/1000) + 's');
        
        // Log startup
        try {
            const logText = `${new Date().toISOString()} - Bot started with token: ${TELEGRAM_TOKEN.substring(0, 10)}...\n`;
            fs.appendFileSync('bot.log', logText);
        } catch (e) {
            console.log('Log file yozishda xatolik');
        }
    })
    .catch(err => {
        console.error('❌ Bot ishga tushirishda xatolik:', err?.message || err);
        process.exit(1);
    });

// Qo'shimcha: Har 1 soatda memory tozalash
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (let [userId, rec] of rateMap.entries()) {
        if (now - rec.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
            rateMap.delete(userId);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        console.log(`🧹 Memory tozalandi: ${cleaned} foydalanuvchi`);
    }
}, 60 * 60 * 1000); // 1 soat

console.log('🚀 Bot kod yuklandi, ishga tushirilmoqda...');