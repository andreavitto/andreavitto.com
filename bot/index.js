import "dotenv/config";
import TelegramBot from "node-telegram-bot-api";
import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, unlinkSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLOG_DIR = join(__dirname, "..", "src", "content", "blog");
const REPO_ROOT = join(__dirname, "..");

// ── Config ──
const {
  TELEGRAM_BOT_TOKEN,
  ANTHROPIC_API_KEY,
  ALLOWED_USERS,
  VERCEL_TOKEN,
  VERCEL_PROJECT_ID = "prj_zZJQXNagOfmIQFtF5A8moTCW1YVH",
  VERCEL_DOMAIN = "andreavitto.com",
} = process.env;

if (!TELEGRAM_BOT_TOKEN || !ANTHROPIC_API_KEY) {
  console.error("Missing TELEGRAM_BOT_TOKEN or ANTHROPIC_API_KEY in .env");
  process.exit(1);
}

if (!VERCEL_TOKEN) {
  console.warn("⚠️  No VERCEL_TOKEN — preview URLs will be estimated, not exact.");
}

const allowedUsers = ALLOWED_USERS
  ? ALLOWED_USERS.split(",").map((id) => parseInt(id.trim(), 10))
  : [];

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ── Per-chat draft state ──
// Key: chatId, Value: { slug, title, content, branch, botMessageId }
const drafts = new Map();

// ── Helpers ──

function isAllowed(userId) {
  if (allowedUsers.length === 0) return true;
  return allowedUsers.includes(userId);
}

function toSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function git(cmd) {
  return execSync(cmd, { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
}

function currentBranch() {
  return git("git branch --show-current");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Inline keyboard ──
function draftKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "✅ Pubblica", callback_data: "publish" },
        { text: "🗑 Scarta", callback_data: "discard" },
      ],
    ],
  };
}

// ── Vercel API: wait for deployment and get preview URL ──
async function waitForPreviewUrl(branch, maxAttempts = 30) {
  if (!VERCEL_TOKEN) return null;

  const headers = { Authorization: `Bearer ${VERCEL_TOKEN}` };

  for (let i = 0; i < maxAttempts; i++) {
    await sleep(5000);

    try {
      const res = await fetch(
        `https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&limit=10`,
        { headers }
      );
      const data = await res.json();

      const deployment = data.deployments?.find((d) => {
        return d.meta?.githubCommitRef === branch;
      });

      if (!deployment) continue;

      if (deployment.state === "READY") {
        return `https://${deployment.url}`;
      }

      if (deployment.state === "ERROR" || deployment.state === "CANCELED") {
        return null;
      }
    } catch {
      // Network error, retry
    }
  }

  return null;
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

Write a complete blog article based on the following prompt.

## Writing guidelines:
- Written in a conversational but knowledgeable tone
- Between 800-2000 words
- Engaging and insightful, with practical takeaways

## SEO & structure rules:
- Title: under 60 characters, include the primary keyword
- Description: under 155 characters, compelling for search results
- Tags: 3-5 relevant lowercase tags
- Use a clear heading hierarchy: ## for major sections (h2), ### for subsections (h3). Never skip heading levels.
- The first paragraph should hook the reader and contain the main keyword naturally
- Use short paragraphs (2-4 sentences max)
- Include bullet points or numbered lists where appropriate
- Bold key terms and concepts
- End with a clear conclusion or takeaway section

IMPORTANT: Return ONLY the following format, nothing else:

---
title: "Article Title Here"
date: "${today()}"
description: "A compelling 1-2 sentence description under 155 chars."
tags: ["tag1", "tag2", "tag3"]
---

Article content here in MDX/Markdown format...

The prompt is: ${prompt}`,
      },
    ],
  });

  return response.content[0].text;
}

// ── Revise article via Claude ──
async function reviseArticle(currentContent, feedback) {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are a blog writer for Andrea Vitto's personal blog.

Here is the current article:

${currentContent}

The author wants the following changes:
${feedback}

Rewrite the entire article incorporating the feedback. Keep the same frontmatter format (---title/date/description---) but update as needed.

IMPORTANT: Return ONLY the complete updated article in the same format, nothing else.`,
      },
    ],
  });

  return response.content[0].text;
}

// ── Parse frontmatter ──
function parseArticle(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;

  const frontmatter = match[1];
  const titleMatch = frontmatter.match(/title:\s*"(.+?)"/);
  const descMatch = frontmatter.match(/description:\s*"(.+?)"/);

  return {
    title: titleMatch?.[1] ?? null,
    description: descMatch?.[1] ?? null,
    content,
  };
}

// ── Draft branch operations ──

function createDraftBranch(slug, content) {
  const branch = `draft/${slug}`;
  const filePath = join(BLOG_DIR, `${slug}.mdx`);

  const current = currentBranch();
  if (current !== "main") git("git checkout main");
  git("git pull --ff-only || true");

  try { git(`git branch -D ${branch}`); } catch {}
  git(`git checkout -b ${branch}`);

  writeFileSync(filePath, content, "utf-8");
  git(`git add "${filePath}"`);
  git(`git commit -m "draft: ${slug}"`);
  git(`git push -u origin ${branch} --force`);
  git("git checkout main");

  return branch;
}

function publishDraft(slug, branch) {
  git("git checkout main");
  git("git pull --ff-only || true");
  git(`git merge ${branch} --no-edit`);
  git("git push");

  try { git(`git push origin --delete ${branch}`); git(`git branch -D ${branch}`); } catch {}
}

function updateDraftBranch(slug, branch, content) {
  const filePath = join(BLOG_DIR, `${slug}.mdx`);

  git(`git checkout ${branch}`);
  writeFileSync(filePath, content, "utf-8");
  git(`git add "${filePath}"`);
  git(`git commit -m "draft: revise ${slug}"`);
  git(`git push --force`);
  git("git checkout main");

  return branch;
}

function discardDraft(slug, branch) {
  git("git checkout main");
  try { git(`git push origin --delete ${branch}`); } catch {}
  try { git(`git branch -D ${branch}`); } catch {}

  const filePath = join(BLOG_DIR, `${slug}.mdx`);
  if (existsSync(filePath)) unlinkSync(filePath);
}

// ── Preview text for Telegram ──
function previewText(content, maxLen = 400) {
  const body = content.replace(/^---[\s\S]*?---\n/, "").trim();
  const clean = body
    .replace(/#{1,3}\s/g, "")
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  return clean.length > maxLen ? clean.slice(0, maxLen) + "..." : clean;
}

// ── Send/update the draft review message ──
async function sendDraftReview(chatId, messageId, draft, previewUrl) {
  const preview = previewText(draft.content);
  const articleUrl = previewUrl ? `${previewUrl}/blog/${draft.slug}` : null;

  const lines = [
    `📝 *${draft.title}*`,
    "",
    preview,
    "",
  ];

  if (articleUrl) {
    lines.push(`🔗 *Preview:* ${articleUrl}`);
  } else {
    lines.push(`⏳ Preview not available yet — check Vercel dashboard.`);
  }

  lines.push("", "_Reply to this message to request changes._");

  if (messageId) {
    await bot.editMessageText(lines.join("\n"), {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
      reply_markup: draftKeyboard(),
    });
    return messageId;
  } else {
    const sent = await bot.sendMessage(chatId, lines.join("\n"), {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
      reply_markup: draftKeyboard(),
    });
    return sent.message_id;
  }
}

// ── Bot commands ──

bot.onText(/\/start/, (msg) => {
  if (!isAllowed(msg.from.id)) return;
  bot.sendMessage(
    msg.chat.id,
    [
      "👋 Send me a topic or prompt to generate a blog article.",
      "",
      "Examples:",
      '• "How RAG works and when to use it"',
      '• "5 lessons from building a SaaS in 2026"',
      '• "The future of AI agents"',
      "",
      "I'll generate the article, create a Vercel preview, and send you the link.",
      "Then use the buttons to publish or discard, or reply to give feedback.",
      "",
      `Your user ID: \`${msg.from.id}\``,
    ].join("\n"),
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/id/, (msg) => {
  bot.sendMessage(msg.chat.id, `Your Telegram user ID: \`${msg.from.id}\``, {
    parse_mode: "Markdown",
  });
});

bot.onText(/\/cancel/, (msg) => {
  const chatId = msg.chat.id;
  const draft = drafts.get(chatId);
  if (!draft) {
    bot.sendMessage(chatId, "No active draft to cancel.");
    return;
  }
  try { discardDraft(draft.slug, draft.branch); } catch {}
  drafts.delete(chatId);
  bot.sendMessage(chatId, "🗑 Draft discarded.");
});

// ── Inline button handler ──
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const draft = drafts.get(chatId);

  if (!draft) {
    bot.answerCallbackQuery(query.id, { text: "No active draft." });
    return;
  }

  if (!isAllowed(query.from.id)) {
    bot.answerCallbackQuery(query.id, { text: "Not authorized." });
    return;
  }

  // ── PUBLISH ──
  if (query.data === "publish") {
    bot.answerCallbackQuery(query.id, { text: "Publishing..." });

    try {
      // Remove inline keyboard from the draft message
      bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: query.message.message_id }
      );

      publishDraft(draft.slug, draft.branch);
      drafts.delete(chatId);

      bot.sendMessage(
        chatId,
        [
          `✅ *Published!*`,
          "",
          `*${draft.title}*`,
          `🔗 https://${VERCEL_DOMAIN}/blog/${draft.slug}`,
          "",
          "Live in ~30 seconds.",
        ].join("\n"),
        { parse_mode: "Markdown", disable_web_page_preview: true }
      );
    } catch (err) {
      bot.sendMessage(chatId, `❌ Publish failed: ${err.message}`);
    }
    return;
  }

  // ── DISCARD ──
  if (query.data === "discard") {
    bot.answerCallbackQuery(query.id, { text: "Discarding..." });

    try {
      bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: query.message.message_id }
      );

      discardDraft(draft.slug, draft.branch);
    } catch {}

    drafts.delete(chatId);
    bot.sendMessage(chatId, "🗑 Draft discarded. Send a new prompt whenever.");
    return;
  }
});

// ── Main message handler ──
bot.on("message", async (msg) => {
  if (msg.text?.startsWith("/")) return;
  if (!msg.text) return;
  if (!isAllowed(msg.from.id)) {
    bot.sendMessage(msg.chat.id, "⛔ Not authorized.");
    return;
  }

  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const draft = drafts.get(chatId);

  // ── Reply to bot message = revision feedback ──
  if (draft && msg.reply_to_message && msg.reply_to_message.message_id === draft.botMessageId) {
    const statusMsg = await bot.sendMessage(chatId, "✏️ Revising article...");

    try {
      const revised = await reviseArticle(draft.content, text);
      const parsed = parseArticle(revised);

      if (!parsed || !parsed.title) {
        bot.editMessageText("❌ Failed to parse revised article. Try again.", {
          chat_id: chatId,
          message_id: statusMsg.message_id,
        });
        return;
      }

      bot.editMessageText(
        `✏️ *Revised: ${parsed.title}*\n\nPushing & waiting for preview...`,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
      );

      updateDraftBranch(draft.slug, draft.branch, parsed.content);
      draft.content = parsed.content;
      draft.title = parsed.title;

      const previewUrl = await waitForPreviewUrl(draft.branch);

      // Delete the old status message
      try { bot.deleteMessage(chatId, statusMsg.message_id); } catch {}

      // Remove keyboard from old draft message
      try {
        bot.editMessageReplyMarkup(
          { inline_keyboard: [] },
          { chat_id: chatId, message_id: draft.botMessageId }
        );
      } catch {}

      // Send new draft review message
      const newMsgId = await sendDraftReview(chatId, null, draft, previewUrl);
      draft.botMessageId = newMsgId;
    } catch (err) {
      bot.editMessageText(`❌ Revision failed: ${err.message}`, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
      });
    }
    return;
  }

  // ── If draft exists but not a reply, ignore (don't treat random messages as commands) ──
  if (draft) {
    return;
  }

  // ── New article ──
  if (text.length < 10) {
    bot.sendMessage(chatId, "Send a more detailed prompt (at least 10 characters).");
    return;
  }

  const statusMsg = await bot.sendMessage(chatId, "✍️ Generating article...");

  try {
    const rawContent = await generateArticle(text);
    const parsed = parseArticle(rawContent);

    if (!parsed || !parsed.title) {
      bot.editMessageText("❌ Failed to parse the article. Try a different prompt.", {
        chat_id: chatId,
        message_id: statusMsg.message_id,
      });
      return;
    }

    const slug = toSlug(parsed.title);

    bot.editMessageText(
      `📝 *${parsed.title}*\n\nPushing draft & waiting for Vercel preview...`,
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    );

    const branch = createDraftBranch(slug, parsed.content);

    drafts.set(chatId, {
      slug,
      title: parsed.title,
      content: parsed.content,
      branch,
      botMessageId: statusMsg.message_id,
    });

    const previewUrl = await waitForPreviewUrl(branch);
    const newMsgId = await sendDraftReview(chatId, statusMsg.message_id, drafts.get(chatId), previewUrl);
    drafts.get(chatId).botMessageId = newMsgId;
  } catch (err) {
    bot.editMessageText(`❌ Error: ${err.message}`, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
    });
  }
});

console.log("🤖 Blog bot is running...");
