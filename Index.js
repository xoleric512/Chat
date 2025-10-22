// api/bot.js
const { Telegraf } = require('telegraf');
const OpenAI = require('openai');

const TELEGRAM_TOKEN = "8395679490:AAHqLQ30ADxS2s9_POYHO6Gnzj99w2-BSjg";
const OPENAI_KEY = "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";

const bot = new Telegraf(TELEGRAM_TOKEN);
const openai = new OpenAI({ apiKey: OPENAI_KEY });

// Webhook handler
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      await bot.handleUpdate(req.body);
      res.status(200).send('OK');
    } catch (error) {
      console.error('Error handling update:', error);
      res.status(200).send('OK');
    }
  } else {
    res.status(200).json({ status: 'Bot is running on Vercel' });
  }
};

// Command handlers
bot.start((ctx) => ctx.reply('Assalomu alaykum! Vercel-da ishlayapman.'));

bot.on('text', async (ctx) => {
  // Tez javob berish kerak (timeout dan qochish)
  await ctx.reply('Javob tayyorlanmoqda...');
  
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: ctx.message.text }],
      max_tokens: 500
    });
    
    await ctx.reply(completion.choices[0].message.content);
  } catch (error) {
    await ctx.reply('Xatolik yuz berdi: ' + error.message);
  }
});
