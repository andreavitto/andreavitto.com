import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLOG_DIR = join(__dirname, "..", "src", "content", "blog");
const REPO_ROOT = join(__dirname, "..");

// ── Config ──
const { TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY, ALLOWED_USERS } = process.env;

if (!TELEGRAM_BOT_TOKEN || !ANTHROPIC_API_KEY) {
  console.error("Missing TELEGRAM_BOT_TOKEN or ANTHROPIC_API_KEY in .env");
  process.exit(1);
}

const allowedUsers = ALLOWED_USERS
  ? ALLOWED_USERS.split(",").map((id) => parseInt(id.trim(), 10))
  : [];

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ── Auth check ──
function isAllowed(userId) {
  if (allowedUsers.length === 0) return true;
  return allowedUsers.includes(userId);
}

// ── Slug generator ──
function toSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// ── Today's date ──
function today() {
  return new Date().toISOString().split("T")[0];
}

// ── Generate article via Claude ──
async function generateArticle(prompt) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are a blog writer for Andrea Vitto's personal blog about AI, SaaS, and automation.

Write a complete blog article based on the following prompt. The article should be:
- Well-structured with clear sections and headings (## for h2, ### for h3)
- Written in a conversational but knowledgeable tone
- Between 800-2000 words
- Engaging and insightful, with practical takeaways

IMPORTANT: Return ONLY the following format, nothing else:

---
title: "Article Title Here"
date: "${today()}"
description: "A compelling 1-2 sentence description for the article listing."
---

Article content here in MDX/Markdown format...

The prompt is: ${prompt}`,
      },
    ],
  });

  return response.content[0].text;
}

// ── Parse the generated content ──
function parseArticle(content) {
  const frontmatterMatch = content.match(
    /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
  );
  if (!frontmatterMatch) return null;

  const frontmatter = frontmatterMatch[1];
  const titleMatch = frontmatter.match(/title:\s*"(.+?)"/);
  const title = titleMatch ? titleMatch[1] : null;

  return { title, content };
}

// ── Save and publish ──
function saveAndPublish(slug, content) {
  const filePath = join(BLOG_DIR, `${slug}.mdx`);
  writeFileSync(filePath, content, "utf-8");

  try {
    execSync(`git add "${filePath}"`, { cwd: REPO_ROOT });
    execSync(`git commit -m "blog: add ${slug}"`, { cwd: REPO_ROOT });
    execSync("git push", { cwd: REPO_ROOT });
    return { published: true };
  } catch (err) {
    return { published: false, error: err.message };
  }
}

// ── Bot commands ──

bot.onText(/\/start/, (msg) => {
  if (!isAllowed(msg.from.id)) return;
  bot.sendMessage(
    msg.chat.id,
    `👋 Send me a topic or prompt, and I'll generate a blog article for you.\n\nExamples:\n• "How RAG works and when to use it"\n• "5 lessons from building a SaaS in 2024"\n• "The future of AI agents"\n\nI'll generate the article, save it, commit, and push to the repo. Vercel will deploy automatically.\n\nYour user ID: \`${msg.from.id}\``,
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/id/, (msg) => {
  bot.sendMessage(msg.chat.id, `Your Telegram user ID: \`${msg.from.id}\``, {
    parse_mode: "Markdown",
  });
});

// ── Main message handler ──
bot.on("message", async (msg) => {
  // Skip commands
  if (msg.text?.startsWith("/")) return;
  if (!msg.text) return;
  if (!isAllowed(msg.from.id)) {
    bot.sendMessage(msg.chat.id, "⛔ You are not authorized to use this bot.");
    return;
  }

  const chatId = msg.chat.id;
  const prompt = msg.text.trim();

  if (prompt.length < 10) {
    bot.sendMessage(chatId, "Please send a more detailed prompt (at least 10 characters).");
    return;
  }

  // Step 1: Acknowledge
  const statusMsg = await bot.sendMessage(chatId, "✍️ Generating article...");

  try {
    // Step 2: Generate
    const rawContent = await generateArticle(prompt);
    const parsed = parseArticle(rawContent);

    if (!parsed || !parsed.title) {
      bot.editMessageText(
        "❌ Failed to parse the generated article. Try again with a different prompt.",
        { chat_id: chatId, message_id: statusMsg.message_id }
      );
      return;
    }

    const slug = toSlug(parsed.title);

    // Step 3: Send preview
    bot.editMessageText(
      `📝 Article generated: *${parsed.title}*\n\nSlug: \`${slug}\`\n\nPublishing...`,
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    );

    // Step 4: Save, commit, push
    const result = saveAndPublish(slug, parsed.content);

    if (result.published) {
      bot.editMessageText(
        `✅ Published!\n\n*${parsed.title}*\n\nSlug: \`${slug}\`\nURL: andreavitto.com/blog/${slug}\n\nVercel will deploy in ~30 seconds.`,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
      );
    } else {
      // Still saved locally even if push failed
      bot.editMessageText(
        `⚠️ Article saved locally but push failed.\n\nFile: \`src/content/blog/${slug}.mdx\`\n\nError: ${result.error}\n\nYou can push manually with \`git push\`.`,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
      );
    }
  } catch (err) {
    bot.editMessageText(`❌ Error: ${err.message}`, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
    });
  }
});

console.log("🤖 Blog bot is running...");
