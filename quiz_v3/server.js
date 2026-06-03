const http = require("http");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

loadEnvFromFile(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const QUESTIONS_FILE = path.join(PUBLIC_DIR, "questions.js");
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const SUPPORTED_GEMINI_MODELS = new Set([
  "gemini-2.5-flash"
]);
const QUESTION_BANK = loadQuestionsFromFile(QUESTIONS_FILE);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/api/generate-quiz") {
    return handleGenerateQuiz(req, res);
  }

  if (req.method === "GET" && url.pathname === "/api/questions") {
    return sendJson(res, 200, { questions: sanitizeQuestionsForClient(QUESTION_BANK) });
  }

  if (req.method === "POST" && url.pathname === "/api/check-answer") {
    return handleCheckAnswer(req, res);
  }

  if (req.method === "GET") {
    return serveStatic(url.pathname, res);
  }

  res.writeHead(405);
  res.end("Method Not Allowed");
});

server.listen(PORT, () => {
  console.log(`Server started at http://localhost:${PORT}`);
});

function serveStatic(pathname, res) {
  if (pathname === "/questions.js") {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const normalized = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, normalized);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }
    res.writeHead(200, { "Content-Type": getContentType(filePath) });
    res.end(data);
  });
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function handleGenerateQuiz(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { error: "Некорректный JSON в запросе." });
  }

  const count = Number(payload?.count);
  const apiKey = String(payload?.apiKey || GEMINI_API_KEY || "").trim();
  const model = String(payload?.model || GEMINI_MODEL).trim();
  const trickyChance = Number(payload?.trickyChance ?? 25);
  const sourceQuestions = buildSourceQuestionsForGeneration(payload?.sourceQuestions);
  if (!Number.isInteger(count) || count <= 0) {
    return sendJson(res, 400, { error: "Поле count должно быть целым числом больше 0." });
  }
  if (!apiKey) {
    return sendJson(res, 400, { error: "API-ключ не передан. Введите Gemini API Key в интерфейсе." });
  }
  if (!SUPPORTED_GEMINI_MODELS.has(model)) {
    return sendJson(res, 400, {
      error: `Неподдерживаемая модель: ${model}. Доступно: gemini-2.5-flash.`
    });
  }
  if (!Number.isFinite(trickyChance) || trickyChance < 0 || trickyChance > 100) {
    return sendJson(res, 400, { error: "Параметр trickyChance должен быть в диапазоне 0..100." });
  }
  if (sourceQuestions.length === 0) {
    return sendJson(res, 400, { error: "sourceQuestions не должен быть пустым." });
  }

  try {
    const generated = await generateQuestionsWithGemini({
      count,
      apiKey,
      model,
      trickyChance,
      sourceQuestions
    });

    return sendJson(res, 200, { questions: generated });
  } catch (error) {
    console.error("Gemini generation failed:", error);
    if (isRegionRestrictedGeminiError(error)) {
      const fallbackQuestions = buildFallbackQuestions(sourceQuestions, count);
      if (fallbackQuestions.length > 0) {
        return sendJson(res, 200, {
          questions: fallbackQuestions,
          warning: "Gemini недоступен в вашем регионе. Использована локальная генерация вопросов."
        });
      }
      return sendJson(res, 500, {
        error: "Gemini недоступен в вашем регионе, и локальную генерацию собрать не удалось."
      });
    }

    return sendJson(res, 500, {
      error: error?.message || "Не удалось сгенерировать вопросы через Gemini."
    });
  }
}

async function handleCheckAnswer(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { error: "Некорректный JSON в запросе." });
  }

  const questionId = payload?.questionId;
  const selectedIndices = Array.isArray(payload?.selectedIndices)
    ? payload.selectedIndices.map((value) => Number(value)).filter(Number.isInteger).sort((a, b) => a - b)
    : [];

  const sourceQuestion = QUESTION_BANK.find((item) => String(item.id) === String(questionId));
  if (!sourceQuestion) {
    return sendJson(res, 404, { error: "Вопрос не найден." });
  }

  const correctIndices = getCorrectIndices(sourceQuestion);
  const awardedPoints = calculateAwardedPoints(selectedIndices, correctIndices);
  return sendJson(res, 200, {
    awardedPoints,
    isCorrect: awardedPoints === 1,
    correctIndices
  });
}

function loadQuestionsFromFile(filePath) {
  try {
    const source = fs.readFileSync(filePath, "utf8");
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { timeout: 1000, filename: "questions.js" });
    if (!Array.isArray(sandbox.window.QUESTIONS)) {
      return [];
    }
    return sandbox.window.QUESTIONS;
  } catch (error) {
    console.error("Failed to load questions:", error);
    return [];
  }
}

function buildSourceQuestionsForGeneration(clientSourceQuestions) {
  if (Array.isArray(clientSourceQuestions) && clientSourceQuestions.length > 0) {
    const normalized = clientSourceQuestions
      .map((item) => ({
        question: String(item?.question || ""),
        options: Array.isArray(item?.options) ? item.options.map((opt) => String(opt || "")).filter(Boolean) : [],
        correctIndices: Array.isArray(item?.correctIndices)
          ? item.correctIndices.map(Number).filter(Number.isInteger)
          : []
      }))
      .filter((item) => item.question && item.options.length >= 2);
    const hasAnyAnswerKey = normalized.some((item) => Array.isArray(item.correctIndices) && item.correctIndices.length > 0);
    if (normalized.length > 0 && hasAnyAnswerKey) {
      return normalized;
    }
  }

  return QUESTION_BANK.map((item) => ({
    question: String(item.question || ""),
    options: Array.isArray(item.options) ? item.options.map((opt) => String(opt || "")).filter(Boolean) : [],
    correctIndices: getCorrectIndices(item)
  })).filter((item) => item.question && item.options.length >= 2);
}

function sanitizeQuestionsForClient(questions) {
  return questions
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const correctIndices = getCorrectIndices(item);
      return {
        id: item.id,
        question: String(item.question || ""),
        options: Array.isArray(item.options) ? item.options.map((option) => String(option || "")) : [],
        multiple: item.multiple === true || correctIndices.length > 1
      };
    })
    .filter((item) => item.question && item.options.length >= 2);
}

function getCorrectIndices(question) {
  if (Array.isArray(question.correctIndices)) {
    return [...question.correctIndices].map(Number).filter(Number.isInteger).sort((a, b) => a - b);
  }

  if (Number.isInteger(question.correctIndex)) {
    return [question.correctIndex];
  }

  return [];
}

function calculateAwardedPoints(selectedIndices, correctIndices) {
  if (correctIndices.length === 0) return 0;

  const correctSet = new Set(correctIndices);
  const selectedSet = new Set(selectedIndices);
  for (const selectedIndex of selectedSet) {
    if (!correctSet.has(selectedIndex)) {
      return 0;
    }
  }

  let matchedCount = 0;
  for (const selectedIndex of selectedSet) {
    if (correctSet.has(selectedIndex)) {
      matchedCount += 1;
    }
  }
  return matchedCount / correctIndices.length;
}

async function generateQuestionsWithGemini({ count, apiKey, model, trickyChance, sourceQuestions }) {
  const prompt = buildGeminiPrompt({ count, trickyChance, sourceQuestions });
  const apiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.9
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const text = extractGeminiText(data);
  const parsed = JSON.parse(text);
  const questions = Array.isArray(parsed?.questions) ? parsed.questions : [];
  const normalized = normalizeGeneratedQuestions(questions).slice(0, count);

  if (normalized.length === 0) {
    throw new Error("Gemini returned no valid questions");
  }

  return normalized;
}

function buildGeminiPrompt({ count, trickyChance, sourceQuestions }) {
  const trickyTarget = Math.round((count * trickyChance) / 100);
  return [
    "Сгенерируй новый набор тестовых вопросов на русском языке.",
    "Нужно придумать НОВЫЕ формулировки, опираясь на стиль и темы исходной базы.",
    "Не копируй вопросы дословно.",
    "",
    `Количество вопросов: ${count}.`,
    `Целевое количество каверзных вопросов: около ${trickyTarget} из ${count} (${trickyChance}%).`,
    "Формат ответа строго JSON-объект:",
    "{",
    '  "questions": [',
    "    {",
    '      "question": "строка",',
    '      "options": ["вариант 1", "вариант 2", "вариант 3", "вариант 4"],',
    '      "correctIndex": 0,',
    '      "correctIndices": [0, 2],',
    '      "multiple": true,',
    '      "isTricky": true,',
    '      "explanation": "краткое объяснение почему правильный ответ верен"',
    "    }",
    "  ]",
    "}",
    "",
    "Требования:",
    "- часть вопросов должна иметь один правильный ответ (correctIndex), часть — несколько (correctIndices).",
    "- если есть correctIndices, указывай минимум 2 индекса и ставь multiple=true.",
    "- если указан correctIndices, не указывай correctIndex.",
    "- explanation обязательно и должно помогать понять ошибку.",
    "- options минимум 2, максимум 5.",
    "- около указанной доли вопросов делай каверзными: близкие по смыслу варианты, частые ловушки.",
    "- для каверзных вопросов ставь isTricky=true, иначе false.",
    "- без markdown, без комментариев, только JSON.",
    "",
    "Исходная база (сокращенный контекст):",
    JSON.stringify(sourceQuestions)
  ].join("\n");
}

function extractGeminiText(data) {
  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error("Gemini response has no parts");
  }
  const text = parts.map((part) => part.text || "").join("").trim();
  if (!text) {
    throw new Error("Gemini returned empty text");
  }
  return text;
}

function normalizeGeneratedQuestions(questions) {
  const result = [];
  for (let i = 0; i < questions.length; i += 1) {
    const item = questions[i];
    if (!item || typeof item !== "object") continue;

    const question = String(item.question || "").trim();
    const options = Array.isArray(item.options)
      ? item.options.map((opt) => String(opt || "").trim()).filter(Boolean)
      : [];
    const correctIndex = Number(item.correctIndex);
    const rawCorrectIndices = Array.isArray(item.correctIndices)
      ? item.correctIndices.map((value) => Number(value)).filter(Number.isInteger)
      : null;
    const uniqueCorrectIndices = rawCorrectIndices
      ? [...new Set(rawCorrectIndices)].sort((a, b) => a - b)
      : null;
    const explanation = String(item.explanation || "").trim();

    if (!question || options.length < 2 || options.length > 5) continue;
    const hasValidCorrectIndex =
      Number.isInteger(correctIndex) && correctIndex >= 0 && correctIndex < options.length;
    const hasValidCorrectIndices =
      Array.isArray(uniqueCorrectIndices) &&
      uniqueCorrectIndices.length >= 2 &&
      uniqueCorrectIndices.every((idx) => idx >= 0 && idx < options.length);
    if (!hasValidCorrectIndex && !hasValidCorrectIndices) continue;
    if (!explanation) continue;

    const normalized = {
      id: `ai-${Date.now()}-${i}-${Math.random().toString(16).slice(2, 6)}`,
      question,
      options,
      explanation
    };

    if (hasValidCorrectIndices) {
      normalized.correctIndices = uniqueCorrectIndices;
      normalized.multiple = true;
    } else {
      normalized.correctIndex = correctIndex;
    }

    result.push(normalized);
  }
  return result;
}

function isRegionRestrictedGeminiError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("user location is not supported") || message.includes("failed_precondition");
}

function buildFallbackQuestions(sourceQuestions, count) {
  const candidates = sourceQuestions.filter((item) => {
    return item &&
      typeof item === "object" &&
      typeof item.question === "string" &&
      Array.isArray(item.options) &&
      item.options.length >= 2 &&
      Array.isArray(item.correctIndices) &&
      item.correctIndices.length === 1;
  });

  const shuffled = shuffle([...candidates]);
  const target = Math.min(Math.max(count, 1), shuffled.length);
  const output = [];

  for (let i = 0; i < shuffled.length && output.length < target; i += 1) {
    const source = shuffled[i];
    const idx = Number(source.correctIndices[0]);
    const options = source.options.map((opt) => String(opt || "").trim()).filter(Boolean);
    if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) continue;

    const correct = options[idx];
    const wrong = options.filter((_, optionIndex) => optionIndex !== idx).slice(0, 3);
    const generatedOptions = shuffle([correct, ...wrong]);
    const correctIndex = generatedOptions.indexOf(correct);
    if (correctIndex < 0) continue;

    output.push({
      id: `fallback-${Date.now()}-${i}-${Math.random().toString(16).slice(2, 6)}`,
      question: `Локальная генерация: выберите верный вариант по теме.\n${source.question}`,
      options: generatedOptions,
      correctIndex,
      explanation: `Правильный вариант отражает исходное верное утверждение: "${correct}".`
    });
  }

  return output;
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function loadEnvFromFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    return;
  }

  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key) continue;

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

