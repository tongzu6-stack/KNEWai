/**
 * Local Chat Utility for KNEWai
 * Handles instant local responses for simple phrases to save compute and provide immediate feedback.
 */

const MAX_LOCAL_REPLY_LENGTH = 160;

const REPLIES: Record<string, Record<string, string>> = {
  en: {
    greeting: 'Hey. I am here and ready when you are.',
    thanks: 'You are welcome.',
    goodbye: 'See you later.',
    status: 'I am running smoothly. What do you want to work on?',
    help: 'Yes. Tell me what you need help with.',
    acknowledgement: 'Got it.',
    positive: 'Nice.',
    apology: 'No worries.',
    idle: 'I am here. Want to make something useful?',
    identity: 'I am KNEWai, your personal AI assistant for chat, writing, coding help, logic, and deep reasoning.',
    capabilities: 'I can help with chat, writing, coding, reasoning, and planning. Try switching between Fast, Thinking, and MAX modes!'
  },
  km: {
    greeting: 'សួស្តី។ ខ្ញុំនៅទីនេះហើយ រួចរាល់ជួយអ្នក។',
    thanks: 'មិនអីទេ។',
    goodbye: 'ជួបគ្នាពេលក្រោយ។',
    status: 'ខ្ញុំដំណើរការល្អ។ តើអ្នកចង់ធ្វើអ្វីបន្ទាប់?',
    help: 'បាន។ ប្រាប់ខ្ញុំថាអ្នកត្រូវការជំនួយអ្វី។',
    identity: 'ខ្ញុំគឺ KNEWai ជាជំនួយការ AI ផ្ទាល់ខ្លួនសម្រាប់ជជែក សរសេរ ជំនួយកូដ និងការគិតស៊ីជម្រៅ។',
    capabilities: 'ខ្ញុំអាចជួយជជែក សរសេរ កូដ និងការគិតស៊ីជម្រៅ។'
  },
  zh: {
    greeting: '你好。我在这里，随时可以帮你。',
    thanks: '不客气。',
    goodbye: '回头见。',
    status: '我运行正常。你想先做什么？',
    help: '可以。告诉我你需要什么帮助。',
    identity: '我是 KNEWai，你的个人 AI 助手，可用于聊天、写作、代码帮助和深度思考。',
    capabilities: '我可以帮你聊天、写作、写代码以及分析问题。'
  }
};

const PHRASES: Record<string, string[]> = {
  greeting: ['hi', 'hello', 'hey', 'yo', 'sup', 'gm', 'good morning', 'good afternoon', 'good evening', 'សួស្តី', '你好', '嗨'],
  thanks: ['thanks', 'thank you', 'ty', 'tysm', 'thx', 'appreciate it', 'អរគុណ', '谢谢'],
  goodbye: ['bye', 'goodbye', 'see you', 'gn', 'good night', 'លាហើយ', '拜拜', '再见', '晚安'],
  status: ['how are you', 'how r u', 'hru', 'u good', 'សុខសប្បាយទេ', '你好吗'],
  help: ['help', 'help me', 'can you help', 'are you there', 'u there', 'ជួយផង', '帮我', '在吗'],
  identity: ['who are you', 'who r u', 'what are you', 'are you knewai', 'អ្នកជាអ្នកណា', '你是谁', '你是 knewai 吗'],
  capabilities: ['what can you do', 'what can u do', 'features', 'capabilities', 'អ្នកអាចធ្វើអ្វីបាន', '你能做什么', '功能'],
  acknowledgement: ['ok', 'okay', 'got it', 'understood', 'sure', 'បាន', '好', '行的'],
  positive: ['cool', 'nice', 'great', 'awesome', 'haha', 'lol', 'ល្អ', '哈哈', '不错'],
  apology: ['sorry', 'sry', 'my bad', 'សុំទោស', '抱歉', '对不起'],
  idle: ['im bored', 'wyd', 'what you doing', 'ខ្ញុំធុញ', '我无聊', '你在干嘛']
};

const TASK_INTENT_PATTERN = /\b(write|explain|summarize|translate|analyze|debug|fix|code|program|script|function|class|component|react|node|python|javascript|typescript|html|css|sql|api|error|generate|create|draw|calculate|compute|solve|math|search|browse|news|weather|price|stock|crypto|plan|build|make|recipe|essay|poem|story)\b/i;

function normalizePrompt(value: string): string {
  return value.trim().replace(/[\u2018\u2019`]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, ' ');
}

function normalizeComparable(value: string): string {
  return normalizePrompt(value)
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9\u1780-\u17ff\u3400-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collapseStretchedWords(value: string, maxRepeats: number): string {
  return value.replace(/([a-z])\1{2,}/g, (match, letter) => letter.repeat(maxRepeats));
}

function getComparableVariants(value: string): string[] {
  const comparable = normalizeComparable(value);
  if (!comparable) return [];

  const collapsedToTwo = collapseStretchedWords(comparable, 2);
  const collapsedToOne = collapseStretchedWords(comparable, 1);
  
  return Array.from(new Set([
    comparable,
    collapsedToTwo,
    collapsedToOne
  ].filter(Boolean)));
}

function hasKhmerText(value: string): boolean {
  return /[\u1780-\u17ff]/.test(value);
}

function hasChineseText(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

function normalizeLanguage(prompt: string): string {
  if (hasKhmerText(prompt)) return 'km';
  if (hasChineseText(prompt)) return 'zh';
  return 'en';
}

export function tryCreateLocalReply(prompt: string) {
  const raw = normalizePrompt(prompt);
  if (!raw || raw.length > MAX_LOCAL_REPLY_LENGTH) return null;
  if (/[\r\n]/.test(prompt)) return null;
  if (TASK_INTENT_PATTERN.test(raw)) return null;

  const variants = getComparableVariants(raw);
  const language = normalizeLanguage(raw);

  for (const [type, phrases] of Object.entries(PHRASES)) {
    if (variants.some(v => phrases.includes(v))) {
      const reply = REPLIES[language]?.[type] || REPLIES['en'][type];
      return reply;
    }
  }

  return null;
}
