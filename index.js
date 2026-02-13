// index.js

// ===============================
//  Advanced Telegram Contact Bot
//  - Users can choose category, write message, give contact info
//  - You get a nicely formatted contact card
//  - You reply by replying to that card
// ===============================

require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = process.env.OWNER_ID;

if (!BOT_TOKEN || !OWNER_ID) {
  console.error('❌ ERROR: Please set BOT_TOKEN and OWNER_ID in your environment variables.');
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('✅ Bot started with polling...');

// Express server (for Render ping / health check)
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Contact Bot is running ✅');
});

app.listen(PORT, () => {
  console.log(`🌐 Express server listening on port ${PORT}`);
});

// ===============================
//  Session system (simple in-memory)
// ===============================
const sessions = {}; // { [chatId]: { step, category, tempMessage, contactInfo, startedAt } }

function resetSession(chatId) {
  delete sessions[chatId];
}

// Helper: format user identity
function formatUserInfo(from, chatId) {
  const nameParts = [];
  if (from.first_name) nameParts.push(from.first_name);
  if (from.last_name) nameParts.push(from.last_name);
  const fullName = nameParts.join(' ').trim() || 'Unknown Name';

  const usernamePart = from.username ? ` (@${from.username})` : '';
  return `Name: ${fullName}${usernamePart}\nUser ID: ${chatId}`;
}

// ===============================
//  Start contact flow (step 1: choose category)
// ===============================
async function startContactFlow(chatId) {
  sessions[chatId] = {
    step: 'chooseCategory',
    category: null,
    tempMessage: null,
    contactInfo: null,
    startedAt: Date.now()
  };

  await bot.sendMessage(
    chatId,
    '📨 আপনি কী ধরনের মেসেজ পাঠাতে চান?',
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '💬 সাধারণ কথা', callback_data: 'cat:general' },
            { text: '💼 কাজ / প্রজেক্ট', callback_data: 'cat:work' }
          ],
          [
            { text: '🐞 সমস্যা / বাগ রিপোর্ট', callback_data: 'cat:bug' },
            { text: '❓ অন্য কিছু', callback_data: 'cat:other' }
          ]
        ]
      }
    }
  );
}

// ===============================
//  Send final contact package to OWNER
// ===============================
async function sendContactToOwner({ from, chatId, category, userMessage, contactInfo, originalMessage }) {
  const userInfo = formatUserInfo(from, chatId);
  const finalCategory = category || 'Simple message';
  const finalContact = contactInfo && contactInfo.trim() !== '' ? contactInfo : 'Not provided';

  // Forward original Telegram message (for context)
  if (originalMessage && originalMessage.message_id) {
    try {
      await bot.forwardMessage(OWNER_ID, chatId, originalMessage.message_id);
    } catch (err) {
      console.error('Error forwarding message to owner:', err);
    }
  }

  const textBlock =
    `📩 New contact message\n\n` +
    `${userInfo}\n` +
    `Category: ${finalCategory}\n\n` +
    `Message:\n${userMessage || '(No text)'}\n\n` +
    `Contact info (user provided):\n${finalContact}\n\n` +
    `💬 Reply to *this* message to answer the user.`;

  try {
    await bot.sendMessage(OWNER_ID, textBlock, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Error sending info block to owner:', err);
  }

  // Acknowledge to user
  try {
    await bot.sendMessage(
      chatId,
      '✅ ধন্যবাদ! আপনার মেসেজ পাঠানো হয়েছে। ইনশাআল্লাহ রিপ্লাই এখানেই পাবেন।'
    );
  } catch (err) {
    console.error('Error sending acknowledgment to user:', err);
  }
}

// ===============================
//  Callback query handler (category select)
// ===============================
bot.on('callback_query', async (query) => {
  const data = query.data;
  const msg = query.message;
  if (!msg) return;

  const chatId = msg.chat.id;
  const from = query.from;
  const isOwner = String(chatId) === String(OWNER_ID);

  // Ignore for owner
  if (isOwner) {
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (!data || !data.startsWith('cat:')) {
    await bot.answerCallbackQuery(query.id);
    return;
  }

  const categoryKey = data.split(':')[1] || 'general';
  let categoryLabel = 'General';

  if (categoryKey === 'general') categoryLabel = 'General';
  if (categoryKey === 'work') categoryLabel = 'Work / Project';
  if (categoryKey === 'bug') categoryLabel = 'Bug / Problem';
  if (categoryKey === 'other') categoryLabel = 'Other';

  sessions[chatId] = {
    step: 'awaitingMessage',
    category: categoryLabel,
    tempMessage: null,
    contactInfo: null,
    startedAt: Date.now()
  };

  await bot.answerCallbackQuery(query.id);
  await bot.sendChatAction(chatId, 'typing');

  await bot.sendMessage(
    chatId,
    `✍️ ঠিক আছে, "${categoryLabel}" সিলেক্ট করেছেন। এখন আপনার মেসেজ লিখে পাঠান.\n\n/cancel লিখে যে কোনো সময় বাতিল করতে পারেন।`
  );
});

// ===============================
//  Main message handler
// ===============================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || '';
  const from = msg.from;

  if (!from) return;

  const isOwner = String(chatId) === String(OWNER_ID);

  // ---------- OWNER (You) ----------
  if (isOwner) {
    // Owner replies to bot's info message => send reply to original user
    if (msg.reply_to_message && msg.reply_to_message.text) {
      const originalText = msg.reply_to_message.text;
      const match = originalText.match(/User ID:\s*(\d+)/);

      if (match) {
        const targetUserId = match[1];

        try {
          if (text) {
            await bot.sendMessage(
              targetUserId,
              `📨 Reply from admin:\n\n${text}`
            );
            await bot.sendMessage(
              OWNER_ID,
              `✅ Sent your reply to user (${targetUserId}).`
            );
          } else {
            await bot.sendMessage(
              OWNER_ID,
              '⚠️ Only text replies are supported for now.'
            );
          }
        } catch (err) {
          console.error('Error sending message to user:', err);
          await bot.sendMessage(
            OWNER_ID,
            '❌ Failed to send reply to user. Maybe they blocked the bot or an error occurred.'
          );
        }
      } else {
        await bot.sendMessage(
          OWNER_ID,
          '⚠️ Could not find User ID in the replied message. Please reply to the message that contains "User ID: ...".'
        );
      }
    } else {
      // Non-reply messages from owner => show quick help
      if (text === '/start' || text === '/help') {
        await bot.sendMessage(
          OWNER_ID,
          '👋 You are the OWNER.\n\nযখন কোনো ইউজার এই বটে মেসেজ পাঠাবে, তুমি তাদের ইনফোসহ নোটিফিকেশন পাবে।\nওই মেসেজে "User ID: ..." লাইন থাকবে।\n\n👉 ওই মেসেজে *reply* করলে বট স্বয়ংক্রিয়ভাবে ওই ইউজারের কাছে তোমার রিপ্লাই পাঠিয়ে দেবে।',
          { parse_mode: 'Markdown' }
        );
      } else {
        await bot.sendMessage(
          OWNER_ID,
          'ℹ️ তুমি OWNER মোডে আছো। কোনো ইউজারের মেসেজে রিপ্লাই করলে, সেটা সেই ইউজারের কাছে চলে যাবে।'
        );
      }
    }

    return;
  }

  // ---------- NORMAL USER ----------

  // /cancel => reset session
  if (text === '/cancel') {
    resetSession(chatId);
    await bot.sendMessage(
      chatId,
      '❌ কন্টাক্ট প্রক্রিয়া বাতিল করা হয়েছে। আবার শুরু করতে /start বা "📨 Contact admin" চাপুন।'
    );
    return;
  }

  // Welcome / menu
  if (text === '/start' || text === '/help') {
    await bot.sendChatAction(chatId, 'typing');

    await bot.sendMessage(
      chatId,
      '👋 Assalamualaikum!\n\nআমি Yasin ভাইয়ের কন্টাক্ট বট। এখানে মেসেজ করলে তা তার কাছে পৌঁছে যাবে, আর তিনি রিপ্লাই দিলে এখানেই পেয়ে যাবেন ইনশাআল্লাহ।\n\n👇 নিচের বাটন থেকে শুরু করুন:',
      {
        reply_markup: {
          keyboard: [
            [{ text: '📨 Contact admin' }, { text: 'ℹ️ About this bot' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      }
    );
    return;
  }

  // Quick buttons
  if (text === '📨 Contact admin') {
    await startContactFlow(chatId);
    return;
  }

  if (text === 'ℹ️ About this bot') {
    await bot.sendChatAction(chatId, 'typing');
    await bot.sendMessage(
      chatId,
      'ℹ️ এই বটটি শুধু একটি সহজ কন্টাক্ট সিস্টেম।\n\n✅ আপনার মেসেজ সরাসরি অ্যাডমিনের কাছে যায়\n✅ তিনি রিপ্লাই করলে আপনি এখানেই রিপ্লাই পাবেন\n✅ কোনো টেকনিক্যাল সেটআপ বুঝতে হবে না, শুধু লিখে পাঠান 🙂'
    );
    return;
  }

  // Session logic (multi-step contact form)
  const session = sessions[chatId];

  // Step: user writing message
  if (session && session.step === 'awaitingMessage') {
    if (!text) {
      await bot.sendMessage(
        chatId,
        '⚠️ অনুগ্রহ করে টেক্সট আকারে আপনার মেসেজ লিখুন।'
      );
      return;
    }

    session.tempMessage = text;
    session.step = 'awaitingContact';

    await bot.sendChatAction(chatId, 'typing');

    await bot.sendMessage(
      chatId,
      '📧 চাইলে আপনার ইমেইল / টেলিগ্রাম ইউজারনেম / অন্য কোনো কন্টাক্ট ডিটেইল লিখে পাঠাতে পারেন, যেন প্রয়োজনে সহজে আপনার সাথে যোগাযোগ করা যায়।\n\nযদি না দিতে চান, তাহলে শুধু "skip" লিখে পাঠিয়ে দিন।'
    );
    return;
  }

  // Step: user giving contact info (or skip)
  if (session && session.step === 'awaitingContact') {
    let contactInfo = text || '';
    if (contactInfo.toLowerCase() === 'skip') {
      contactInfo = '';
    }

    session.contactInfo = contactInfo;

    await bot.sendChatAction(chatId, 'typing');

    // Send everything to OWNER
    await sendContactToOwner({
      from,
      chatId,
      category: session.category,
      userMessage: session.tempMessage,
      contactInfo: session.contactInfo,
      originalMessage: msg
    });

    resetSession(chatId);
    return;
  }

  // If no active session => simple one-shot message (fallback mode)
  await bot.sendChatAction(chatId, 'typing');

  await sendContactToOwner({
    from,
    chatId,
    category: 'Simple message',
    userMessage: text,
    contactInfo: '',
    originalMessage: msg
  });
});
