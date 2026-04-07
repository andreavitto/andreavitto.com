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
  VERCEL_DOMAIN = "andreavitto.com",
} = process.env;

if (!TELEGRAM_BOT_TOKEN || !ANTHROPIC_API_KEY) {
  console.error("Missing TELEGRAM_BOT_TOKEN or ANTHROPIC_API_KEY in .env");
  process.exit(1);
}

const allowedUsers = ALLOWED_USERS
  ? ALLOWED_USERS.split(",").map((id) => parseInt(id.trim(), 10))
  : [];

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ── Per-chat draft state ──
// { chatId: { slug, title, content, branch, prompt, originalPrompt } }
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

  // Make sure we're on main first
  const current = currentBranch();
  if (current !== "main") {
    git("git checkout main");
  }
  git("git pull --ff-only || true");

  // Create and switch to draft branch
  try {
    git(`git branch -D ${branch}`);
  } catch {
    // Branch doesn't exist yet, that's fine
  }
  git(`git checkout -b ${branch}`);

  // Write file and commit
  writeFileSync(filePath, content, "utf-8");
  git(`git add "${filePath}"`);
  git(`git commit -m "draft: ${slug}"`);
  git(`git push -u origin ${branch} --force`);

  // Go back to main
  git("git checkout main");

  return branch;
}

function publishDraft(slug, branch) {
  // Merge draft branch into main
  git("git checkout main");
  git("git pull --ff-only || true");
  git(`git merge ${branch} --no-edit`);
  git("git push");

  // Cleanup draft branch
  try {
    git(`git push origin --delete ${branch}`);
    git(`git branch -D ${branch}`);
  } catch {
    // Ignore cleanup errors
  }
}

function updateDraftBranch(slug, branch, content) {
  const filePath = join(BLOG_DIR, `${slug}.mdx`);

  git(`git checkout ${branch}`);
  writeFileSync(filePath, content, "utf-8");
  git(`git add "${filePath}"`);
  git(`git commit -m "draft: revise ${slug}"`);
  git(`git push --force`);
  git("git checkout main");
}

function discardDraft(slug, branch) {
  git("git checkout main");

  // Delete remote and local branch
  try {
    git(`git push origin --delete ${branch}`);
  } catch {
    // Ignore
  }
  try {
    git(`git branch -D ${branch}`);
  } catch {
    // Ignore
  }

  // Remove local file if it exists
  const filePath = join(BLOG_DIR, `${slug}.mdx`);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

// ── Extract preview text for Telegram ──
function previewText(content, maxLen = 500) {
  // Remove frontmatter
  const body = content.replace(/^---[\s\S]*?---\n/, "").trim();
  // Remove markdown formatting
  const clean = body
    .replace(/#{1,3}\s/g, "")
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  return clean.length > maxLen ? clean.slice(0, maxLen) + "..." : clean;
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
      '• "5 lessons from building a SaaS in 2024"',
      '• "The future of AI agents"',
      "",
      "I'll generate the article, push a draft branch for Vercel preview, and ask for your approval before publishing.",
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

  try {
    discardDraft(draft.slug, draft.branch);
  } catch {
    // Ignore cleanup errors
  }
  drafts.delete(chatId);
  bot.sendMessage(chatId, "🗑 Draft discarded.");
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

  // ── If there's an active draft, handle review commands ──
  if (draft) {
    const lower = text.toLowerCase();

    // ── PUBLISH ──
    if (lower === "pubblica" || lower === "publish" || lower === "ok" || lower === "si" || lower === "sì") {
      const statusMsg = await bot.sendMessage(chatId, "🚀 Publishing...");
      try {
        publishDraft(draft.slug, draft.branch);
        drafts.delete(chatId);
        bot.editMessageText(
          [
            `✅ *Published!*`,
            "",
            `*${draft.title}*`,
            "",
            `🔗 https://${VERCEL_DOMAIN}/blog/${draft.slug}`,
            "",
            "Vercel will deploy in ~30 seconds.",
          ].join("\n"),
          { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
        );
      } catch (err) {
        bot.editMessageText(`❌ Publish failed: ${err.message}`, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
        });
      }
      return;
    }

    // ── DISCARD ──
    if (lower === "scarta" || lower === "discard" || lower === "no") {
      try {
        discardDraft(draft.slug, draft.branch);
      } catch {
        // Ignore
      }
      drafts.delete(chatId);
      bot.sendMessage(chatId, "🗑 Draft discarded. Send a new prompt whenever you want.");
      return;
    }

    // ── REVISION — treat any other text as feedback ──
    const statusMsg = await bot.sendMessage(chatId, "✏️ Revising article...");
    try {
      const revised = await reviseArticle(draft.content, text);
      const parsed = parseArticle(revised);

      if (!parsed || !parsed.title) {
        bot.editMessageText("❌ Failed to parse the revised article. Try again.", {
          chat_id: chatId,
          message_id: statusMsg.message_id,
        });
        return;
      }

      // Update the draft branch
      updateDraftBranch(draft.slug, draft.branch, parsed.content);

      // Update draft state
      draft.content = parsed.content;
      draft.title = parsed.title;

      const preview = previewText(parsed.content);
      bot.editMessageText(
        [
          `📝 *Revised: ${parsed.title}*`,
          "",
          `\`\`\``,
          preview,
          `\`\`\``,
          "",
          `🔍 Preview: will update on Vercel shortly`,
          "",
          "Reply with:",
          '• *"pubblica"* — to publish',
          "• *your feedback* — to revise again",
          '• *"scarta"* — to discard',
        ].join("\n"),
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
      );
    } catch (err) {
      bot.editMessageText(`❌ Revision failed: ${err.message}`, {
        chat_id: chatId,
        message_id: statusMsg.message_id,
      });
    }
    return;
  }

  // ── No active draft: generate a new article ──

  if (text.length < 10) {
    bot.sendMessage(chatId, "Please send a more detailed prompt (at least 10 characters).");
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

    // Push to draft branch
    bot.editMessageText(
      `📝 *${parsed.title}*\n\nCreating preview branch...`,
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    );

    const branch = createDraftBranch(slug, parsed.content);

    // Store draft
    drafts.set(chatId, {
      slug,
      title: parsed.title,
      content: parsed.content,
      branch,
      originalPrompt: text,
    });

    const preview = previewText(parsed.content);

    bot.editMessageText(
      [
        `📝 *${parsed.title}*`,
        "",
        `\`\`\``,
        preview,
        `\`\`\``,
        "",
        `🔍 Vercel preview will be available shortly on the \`${branch}\` branch.`,
        "",
        "Reply with:",
        '• *"pubblica"* — to publish to production',
        "• *your feedback* — to request changes",
        '• *"scarta"* — to discard the draft',
      ].join("\n"),
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" }
    );
  } catch (err) {
    bot.editMessageText(`❌ Error: ${err.message}`, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
    });
  }
});

console.log("🤖 Blog bot is running...");
