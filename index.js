// index.js

// ===============================
//  Simple Telegram Contact Bot (Yasin version)
//  - User: /start দিলে শুধু welcome টেক্সট + 2টা বাটন (Reset + About)
//  - User: যে কোনো মেসেজ পাঠালেই -> Owner এর কাছে যাবে
//  - User: সাথে সাথে পাবে "ধন্যবাদ Yasin ভাইয়ের রিপ্লায়ের জন্য অপেক্ষা করুন!"
//  - Owner: শুধু প্রোফাইল নাম + ইউজারের মেসেজ দেখবে (কোনো User ID টেক্সটে দেখাবে না)
//  - Owner: ওই মেসেজে reply দিলে -> সেই ইউজারের কাছে রিপ্লাই চলে যাবে
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

// ===============================
//  Express server (for Render ping / health check)
// ===============================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Contact Bot is running ✅');
});

app.listen(PORT, () => {
  console.log(`🌐 Express server listening on port ${PORT}`);
});

// ===============================
//  Helper: নাম বের করা
// ===============================
function getDisplayName(from) {
  const parts = [];
  if (from.first_name) parts.push(from.first_name);
  if (from.last_name) parts.push(from.last_name);
  const fullName = parts.join(' ').trim();

  if (fullName) return fullName;
  if (from.username) return from.username;
  return 'Unknown User';
}

// ===============================
//  Owner reply mapping
//  ownerMessageId -> userChatId
// ===============================
const replyTargets = {};

// ===============================
//  Owner এর কাছে নতুন মেসেজ পাঠানো
// ===============================
async function sendToOwner(from, userChatId, userMessageText, originalMsg) {
  const displayName = getDisplayName(from);

  // টেক্সট না থাকলে fallback
  const textPart = userMessageText && userMessageText.trim() !== ''
    ? userMessageText
    : '(কোনো টেক্সট মেসেজ নেই, সম্ভবত মিডিয়া পাঠানো হয়েছে)';

  const infoText =
    `📩 নতুন মেসেজ\n\n` +
    `নাম: ${displayName}\n\n` +
    `মেসেজ:\n${textPart}`;

  try {
    // চাইলে আগে মূল মেসেজ forward করতে পারো (কমেন্ট খুলে দিলে)
    // if (originalMsg && originalMsg.message_id) {
    //   await bot.forwardMessage(OWNER_ID, userChatId, originalMsg.message_id);
    // }

    const sent = await bot.sendMessage(OWNER_ID, infoText);
    // Owner যে মেসেজটা পেল সেটার ID -> কোন ইউজারের সাথে লিঙ্ক
    replyTargets[sent.message_id] = userChatId;
  } catch (err) {
    console.error('Error sending message to owner:', err);
  }
}

// ===============================
//  Reset chat (soft reset)
//  - আসলে Telegram পুরো চ্যাট মুছে ফেলার API দেয় না
//  - তাই এখানে শুধু বটের পক্ষ থেকে সেশন/লিঙ্ক পরিষ্কার + ইনস্ট্রাকশন
// ===============================
async function handleReset(chatId, isOwner) {
  // সব mapping ক্লিয়ার (Owner side থেকে করলে সকল ইউজার ম্যাপ উড়ে যাবে)
  if (isOwner) {
    for (const key of Object.keys(replyTargets)) {
      delete replyTargets[key];
    }
  }

  const textForUser =
    '🔄 চ্যাট রিসেট করা হয়েছে (বটের দিক থেকে)।\n' +
    'যদি পুরো হিস্টরি একদম ফাঁকা করতে চান, তবে Telegram এর উপরের ⋮ মেনু থেকে "Clear history" / "Delete chat" ব্যবহার করুন।\n\n' +
    'এখন চাইলে নতুন করে মেসেজ পাঠাতে পারেন।';

  await bot.sendMessage(chatId, textForUser);
}

// ===============================
//  Main message handler
// ===============================
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || '';
  const from = msg.from;

  if (!from) return;

  const isOwner = String(chatId) === String(OWNER_ID);

  // ---------- OWNER SIDE ----------
  if (isOwner) {
    // Owner /start => ছোট Help
    if (text === '/start' || text === '/help') {
      await bot.sendMessage(
        OWNER_ID,
        '👋 Owner panel\n\n' +
          '➤ কেউ এই বটকে মেসেজ করলে তুমি শুধু তার নাম + মেসেজ দেখবে।\n' +
          '➤ সেই মেসেজে reply দিলে, তোমার রিপ্লাই সরাসরি সেই ইউজারের কাছে যাবে।\n' +
          '➤ নিচের "🔄 Reset chat" বাটন দিয়ে শুধু বটের দিক থেকে লিঙ্ক/সেশন রিসেট হয়।',
      );
      return;
    }

    // Owner Reset button
    if (text === '🔄 Reset chat') {
      await handleReset(chatId, true);
      return;
    }

    // About button
    if (text === 'ℹ️ About this bot') {
      await bot.sendMessage(
        chatId,
        'ℹ️ এই বটটি শুধু Yasin ভাইয়ের জন্য একটি সহজ কন্টাক্ট সিস্টেম।\n\n' +
          '➤ ইউজারের মেসেজ সরাসরি তার কাছে যায়\n' +
          '➤ তিনি reply দিলে, তা আবার বটের মাধ্যমে ইউজার পেয়ে যায়।'
      );
      return;
    }

    // Owner যদি কোনো মেসেজে reply করে
    if (msg.reply_to_message) {
      const repliedId = msg.reply_to_message.message_id;
      const targetUserId = replyTargets[repliedId];

      if (!targetUserId) {
        await bot.sendMessage(
          OWNER_ID,
          '⚠️ এই মেসেজের সাথে কোনো ইউজার লিঙ্ক পাওয়া যায়নি।\n' +
            'সম্ভবত বট রিস্টার্ট হয়েছে বা পুরনো মেসেজে রিপ্লাই দিচ্ছেন।'
        );
        return;
      }

      if (!text) {
        await bot.sendMessage(
          OWNER_ID,
          '⚠️ এখন শুধু টেক্সট রিপ্লাই সাপোর্টেড।'
        );
        return;
      }

      try {
        await bot.sendMessage(
          targetUserId,
          `📨 Yasin ভাই থেকে রিপ্লাই:\n\n${text}`
        );
        await bot.sendMessage(
          OWNER_ID,
          '✅ ইউজারের কাছে রিপ্লাই পাঠানো হয়েছে।'
        );
      } catch (err) {
        console.error('Error sending owner reply to user:', err);
        await bot.sendMessage(
          OWNER_ID,
          '❌ ইউজারের কাছে রিপ্লাই পাঠানো যায়নি। সম্ভবত তিনি বট ব্লক করেছেন বা অন্য কোনো সমস্যা হয়েছে।'
        );
      }

      return;
    }

    // Owner এর সাধারণ মেসেজ (reply না হলে) -> কিছু না, শুধু হিন্ট
    await bot.sendMessage(
      OWNER_ID,
      'ℹ️ কোনো ইউজারের মেসেজে রিপ্লাই করলে, সেটা সেই ইউজারের কাছে চলে যাবে।'
    );
    return;
  }

  // ---------- USER SIDE ----------

  // /start => কেবল welcome মেসেজ + ২টা বাটন
  if (text === '/start' || text === '/help') {
    await bot.sendChatAction(chatId, 'typing');

    await bot.sendMessage(
      chatId,
      'Assalamualaikum!\n\nআমি Yasin ভাইয়ের কন্টাক্ট বট। \nযে কোন বিষয় জানতে আমাকে মেসেজ করুন!',
      {
        reply_markup: {
          keyboard: [
            [{ text: '🔄 Reset chat' }, { text: 'ℹ️ About this bot' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      }
    );
    return;
  }

  // Reset button (user side)
  if (text === '🔄 Reset chat') {
    await handleReset(chatId, false);
    return;
  }

  // About button (user side)
  if (text === 'ℹ️ About this bot') {
    await bot.sendChatAction(chatId, 'typing');
    await bot.sendMessage(
      chatId,
      'ℹ️ এই বটের মাধ্যমে আপনি যে কোনো বিষয়ে Yasin ভাইকে মেসেজ করতে পারবেন।\n\n' +
        'আপনি এখানে যা লিখবেন, তা সরাসরি তাঁর কাছে পৌঁছে যাবে, আর তিনি রিপ্লাই দিলে আপনি এখানেই পেয়ে যাবেন ইনশাআল্লাহ।'
    );
    return;
  }

  // বাকি সবকিছুই -> কন্টাক্ট মেসেজ হিসেবে ধরা হবে
  await bot.sendChatAction(chatId, 'typing');

  // Owner কে পাঠাও (শুধু নাম + মেসেজ)
  await sendToOwner(from, chatId, text, msg);

  // ইউজারকে reply
  try {
    await bot.sendMessage(
      chatId,
      'ধন্যবাদ! Yasin ভাইয়ের রিপ্লায়ের জন্য অপেক্ষা করুন!'
    );
  } catch (err) {
    console.error('Error sending thank you message to user:', err);
  }
});
