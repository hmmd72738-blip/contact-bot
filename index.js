// index.js

// ===============================
//  Simple Telegram Contact Bot (Yasin version)
//  - /start: শুধু welcome মেসেজ + 2টা বাটন (Reset + About)
//  - User: সরাসরি যেকোনো মেসেজ পাঠালে -> Owner এর কাছে যাবে
//  - User: পাবে "ধন্যবাদ! Yasin ভাইয়ের রিপ্লায়ের জন্য অপেক্ষা করুন!"
//  - Owner: শুধু প্রোফাইল নাম + ইউজারের মেসেজ দেখবে (User ID লেখা থাকবে না)
//  - Owner: ওই মেসেজে reply দিলে -> সেই ইউজারের কাছে রিপ্লাই চলে যাবে
//  - Reset: যতটা সম্ভব বটের পাঠানো মেসেজগুলো ডিলিট + আবার শুরু থেকে মেসেজ দেখানো
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
//  Express server (Render health check)
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
//  Helpers
// ===============================

// বট যেসব মেসেজ পাঠিয়েছে, এগুলোর ID রাখবো যেন Reset এ ডিলিট করা যায়
const sentMessages = {};       // { [chatId]: [messageId, ...] }

// Owner এর মেসেজ থেকে কোন ইউজারকে রিপ্লাই যাবে তা map করে রাখবো
const replyTargets = {};       // { [ownerMessageId]: userChatId }

// আমাদের সব sendMessage এই ফাংশনের মাধ্যমে করলে, auto tracking হবে
function trackSend(chatId, promise) {
  return promise
    .then((msg) => {
      if (!msg || !msg.message_id) return msg;
      if (!sentMessages[chatId]) sentMessages[chatId] = [];
      sentMessages[chatId].push(msg.message_id);
      return msg;
    })
    .catch((err) => {
      console.error('Error sending message:', err);
      return null;
    });
}

// ইউজারের ডিসপ্লে নাম বানানো
function getDisplayName(from) {
  const parts = [];
  if (from.first_name) parts.push(from.first_name);
  if (from.last_name) parts.push(from.last_name);
  const full = parts.join(' ').trim();

  if (full) return full;
  if (from.username) return from.username;
  return 'Unknown User';
}

// ইউজার সাইড ওয়েলকাম মেসেজ
async function sendUserWelcome(chatId) {
  await bot.sendChatAction(chatId, 'typing');
  await trackSend(
    chatId,
    bot.sendMessage(
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
    )
  );
}

// Reset হ্যান্ডলার (user + owner উভয়ের জন্য কাজ করবে)
async function handleReset(chatId, isOwner) {
  const list = sentMessages[chatId] || [];

  // বট যত মেসেজ পাঠিয়েছে, সেগুলো ডিলিট করার চেষ্টা
  for (const id of list) {
    try {
      await bot.deleteMessage(chatId, id);
    } catch (err) {
      // পুরনো মেসেজ / ডিলিট না পারলেও ইগনোর করবো
      // console.error('Error deleting message:', err);
    }
  }

  sentMessages[chatId] = [];

  if (isOwner) {
    await trackSend(
      chatId,
      bot.sendMessage(
        chatId,
        '🔄 Reset complete.\nনতুন মেসেজ এলে আবার থেকে শুরু হবে ইনশাআল্লাহ।'
      )
    );
  } else {
    // ইউজারের জন্য Reset এর পর আবার ওয়েলকাম
    await sendUserWelcome(chatId);
  }
}

// Owner এর কাছে ইউজারের মেসেজ পাঠানো
async function sendToOwner(from, userChatId, userText, originalMsg) {
  const displayName = getDisplayName(from);

  const textPart =
    userText && userText.trim() !== ''
      ? userText
      : '(কোনো টেক্সট মেসেজ নেই, সম্ভবত মিডিয়া পাঠানো হয়েছে)';

  const infoText =
    `📩 নতুন মেসেজ\n\n` +
    `নাম: ${displayName}\n\n` +
    `মেসেজ:\n${textPart}`;

  // চাইলে এখানে forwardMessage ও করতে পারো (নিচের দুই লাইন আনকমেন্ট করলে)
  // if (originalMsg && originalMsg.message_id) {
  //   await bot.forwardMessage(OWNER_ID, userChatId, originalMsg.message_id);
  // }

  const sent = await trackSend(OWNER_ID, bot.sendMessage(OWNER_ID, infoText));

  if (sent && sent.message_id) {
    replyTargets[sent.message_id] = userChatId;
  }
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

  // ========== OWNER SIDE ==========
  if (isOwner) {
    // Owner /start বা /help
    if (text === '/start' || text === '/help') {
      await trackSend(
        chatId,
        bot.sendMessage(
          chatId,
          '👋 Owner panel\n\n' +
            '➤ কেউ এই বটকে মেসেজ করলে তুমি শুধু তার নাম + মেসেজ দেখবে।\n' +
            '➤ সেই মেসেজে reply দিলে, তোমার রিপ্লাই সরাসরি সেই ইউজারের কাছে যাবে।\n' +
            '➤ "🔄 Reset chat" বাটন দিলে বটের পাঠানো মেসেজগুলো যতটা সম্ভব ডিলিট হবে।',
          {
            reply_markup: {
              keyboard: [
                [{ text: '🔄 Reset chat' }, { text: 'ℹ️ About this bot' }]
              ],
              resize_keyboard: true,
              one_time_keyboard: false
            }
          }
        )
      );
      return;
    }

    // Owner Reset button
    if (text === '🔄 Reset chat') {
      await handleReset(chatId, true);
      return;
    }

    // Owner About বাটন
    if (text === 'ℹ️ About this bot') {
      await trackSend(
        chatId,
        bot.sendMessage(
          chatId,
          'ℹ️ এই বটটি Yasin ভাইয়ের জন্য একটি সহজ কন্টাক্ট সিস্টেম।\n\n' +
            'ইউজারের পাঠানো মেসেজ এখানে আসবে, আর তুমি যেই মেসেজে reply করবে, তা আবার সেই ইউজারের কাছে পৌঁছে যাবে।'
        )
      );
      return;
    }

    // যদি কোনো মেসেজে reply করে থাকে, তাহলে সেই ইউজারকে উত্তর পাঠাও
    if (msg.reply_to_message) {
      const repliedId = msg.reply_to_message.message_id;
      const targetUserId = replyTargets[repliedId];

      if (!targetUserId) {
        await trackSend(
          chatId,
          bot.sendMessage(
            chatId,
            '⚠️ এই মেসেজের সাথে কোনো ইউজার লিঙ্ক পাওয়া যায়নি।\n' +
              'সম্ভবত বট রিস্টার্ট হয়েছে বা খুব পুরনো মেসেজে reply দিচ্ছেন।'
          )
        );
        return;
      }

      if (!text) {
        await trackSend(
          chatId,
          bot.sendMessage(
            chatId,
            '⚠️ এখন শুধু টেক্সট রিপ্লাই সাপোর্টেড।'
          )
        );
        return;
      }

      try {
        await bot.sendMessage(
          targetUserId,
          `📨 Yasin ভাই থেকে রিপ্লাই:\n\n${text}`
        );
        await trackSend(
          chatId,
          bot.sendMessage(chatId, '✅ ইউজারের কাছে রিপ্লাই পাঠানো হয়েছে।')
        );
      } catch (err) {
        console.error('Error sending owner reply to user:', err);
        await trackSend(
          chatId,
          bot.sendMessage(
            chatId,
            '❌ ইউজারের কাছে রিপ্লাই পাঠানো যায়নি। সম্ভবত তিনি বট ব্লক করেছেন বা অন্য কোনো সমস্যা হয়েছে।'
          )
        );
      }

      return;
    }

    // Owner যদি শুধু normal মেসেজ পাঠায়
    await trackSend(
      chatId,
      bot.sendMessage(
        chatId,
        'ℹ️ কোনো ইউজারের মেসেজে reply করলে, সেটা সেই ইউজারের কাছে চলে যাবে।'
      )
    );
    return;
  }

  // ========== USER SIDE ==========

  // /start অথবা /help => শুধু welcome + কিবোর্ড
  if (text === '/start' || text === '/help') {
    await sendUserWelcome(chatId);
    return;
  }

  // Reset button (user)
  if (text === '🔄 Reset chat') {
    await handleReset(chatId, false);
    return;
  }

  // About button (user)
  if (text === 'ℹ️ About this bot') {
    await bot.sendChatAction(chatId, 'typing');
    await trackSend(
      chatId,
      bot.sendMessage(
        chatId,
        'ℹ️ এই বটের মাধ্যমে আপনি যে কোনো বিষয়ে Yasin ভাইকে মেসেজ করতে পারবেন।\n\n' +
          'আপনি এখানে যা লিখবেন, তা সরাসরি তাঁর কাছে পৌঁছে যাবে, আর তিনি রিপ্লাই দিলে আপনি এখানেই পেয়ে যাবেন ইনশাআল্লাহ।'
      )
    );
    return;
  }

  // বাকি সব কিছু => কন্টাক্ট মেসেজ হিসেবে ধরা হবে
  await bot.sendChatAction(chatId, 'typing');

  await sendToOwner(from, chatId, text, msg);

  await trackSend(
    chatId,
    bot.sendMessage(
      chatId,
      'ধন্যবাদ! Yasin ভাইয়ের রিপ্লায়ের জন্য অপেক্ষা করুন!'
    )
  );
});
