const startQuizBtn = document.getElementById("startQuizBtn");
const allQuestionsBtn = document.getElementById("allQuestionsBtn");
const generatedQuizBtn = document.getElementById("generatedQuizBtn");
const geminiApiKeyInput = document.getElementById("geminiApiKeyInput");
const geminiModelSelect = document.getElementById("geminiModelSelect");
const trickyChanceInput = document.getElementById("trickyChanceInput");
const questionCountInput = document.getElementById("questionCountInput");
const restartBtn = document.getElementById("restartBtn");
const questionText = document.getElementById("questionText");
const answersForm = document.getElementById("answersForm");
const submitBtn = document.getElementById("submitBtn");
const nextQuestionBtn = document.getElementById("nextQuestionBtn");
const pauseQuizBtn = document.getElementById("pauseQuizBtn");
const quizPauseOverlay = document.getElementById("quizPauseOverlay");
const resumeQuizBtn = document.getElementById("resumeQuizBtn");
const feedbackText = document.getElementById("feedbackText");
const modeText = document.getElementById("modeText");
const progressText = document.getElementById("progressText");
const scoreText = document.getElementById("scoreText");
const timerText = document.getElementById("timerText");
const examModeSelect = document.getElementById("examModeSelect");
const sessionStatsText = document.getElementById("sessionStatsText");
const globalStatsText = document.getElementById("globalStatsText");
const resetStatsBtn = document.getElementById("resetStatsBtn");

let state = resetState();
let timerIntervalId = null;
let questionBank = [];

startQuizBtn.addEventListener("click", () => startQuiz());
allQuestionsBtn.addEventListener("click", () => startAllQuestionsQuiz());
generatedQuizBtn.addEventListener("click", () => startGeneratedQuiz());
restartBtn.addEventListener("click", () => {
  stopQuizTimer();
  setPaused(false);
  state = resetState();
  renderIdle();
});
pauseQuizBtn.addEventListener("click", () => pauseQuiz());
resumeQuizBtn.addEventListener("click", () => resumeQuiz());
resetStatsBtn.addEventListener("click", resetStats);
submitBtn.addEventListener("click", submitAnswer);
nextQuestionBtn.addEventListener("click", () => {
  if (state.paused || !state.answerSubmitted || state.finished) return;
  feedbackText.textContent = "";
  nextQuestion();
});
questionCountInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    startQuiz();
  }
});
geminiApiKeyInput.addEventListener("change", persistGeminiSettings);
geminiModelSelect.addEventListener("change", persistGeminiSettings);
trickyChanceInput.addEventListener("change", persistGeminiSettings);

loadGeminiSettings();
initializeApp();

function resetState() {
  return {
    requestedCount: 0,
    quizLength: 0,
    mode: "standard",
    examMode: "practice",
    pool: [],
    currentQuestion: null,
    answerSubmitted: false,
    askedCount: 0,
    correct: 0,
    wrong: 0,
    totalPoints: 0,
    timerSecondsLeft: 0,
    finished: false,
    paused: false,
    sessionResults: []
  };
}

function isQuizActive() {
  return state.quizLength > 0 && !state.finished;
}

function setPaused(paused) {
  state.paused = paused;
  quizPauseOverlay.classList.toggle("is-hidden", !paused);
  quizPauseOverlay.setAttribute("aria-hidden", paused ? "false" : "true");
  pauseQuizBtn.classList.toggle("is-hidden", !isQuizActive() || paused);
  updateQuizControls();
  updateScoreboard();
}

function pauseQuiz() {
  if (!isQuizActive() || state.paused) return;
  stopQuizTimer();
  setPaused(true);
}

function resumeQuiz() {
  if (!isQuizActive() || !state.paused) return;
  setPaused(false);
  startQuizTimer();
}

function updateQuizControls() {
  const inputs = answersForm.querySelectorAll("input[name='answer']");
  const blockInteraction = state.paused || state.finished;

  inputs.forEach((input) => {
    if (blockInteraction || state.answerSubmitted) {
      input.disabled = true;
    } else {
      input.disabled = false;
    }
  });

  if (blockInteraction) {
    submitBtn.disabled = true;
    nextQuestionBtn.disabled = true;
    return;
  }

  submitBtn.disabled = state.answerSubmitted || !state.currentQuestion;
  nextQuestionBtn.disabled = !state.answerSubmitted;
}

function updatePauseUI() {
  pauseQuizBtn.classList.toggle("is-hidden", !isQuizActive() || state.paused);
  if (!isQuizActive()) {
    quizPauseOverlay.classList.add("is-hidden");
    quizPauseOverlay.setAttribute("aria-hidden", "true");
  }
}

async function initializeApp() {
  renderIdle();
  await loadQuestionBank();
  loadGlobalStats();
}

async function loadQuestionBank() {
  try {
    const response = await fetch("/api/questions");
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(data.questions)) {
      throw new Error(data.error || "Не удалось загрузить вопросы.");
    }
    questionBank = data.questions;
  } catch (error) {
    questionBank = [];
    alert(error.message || "Ошибка загрузки вопросов.");
  }
}

function startQuiz() {
  if (!Array.isArray(questionBank) || questionBank.length === 0) {
    alert("Список вопросов пуст.");
    return;
  }

  stopQuizTimer();
  const requestedLength = Number(questionCountInput.value);
  if (!Number.isInteger(requestedLength) || requestedLength <= 0) {
    alert("Введите корректное количество вопросов (целое число больше нуля)");
    return;
  }

  const quizLength = Math.min(requestedLength, questionBank.length);
  const examMode = examModeSelect.value === "exam" ? "exam" : "practice";

  state = {
    requestedCount: requestedLength,
    quizLength,
    mode: "standard",
    examMode,
    pool: shuffle([...questionBank]).slice(0, quizLength),
    currentQuestion: null,
    answerSubmitted: false,
    askedCount: 0,
    correct: 0,
    wrong: 0,
    totalPoints: 0,
    timerSecondsLeft: quizLength * 60,
    finished: false,
    paused: false,
    sessionResults: []
  };

  feedbackText.textContent = "";
  modeText.textContent = `Режим: стандартный тест (${examMode === "exam" ? "экзамен" : "обычный"})`;
  setPaused(false);
  updatePauseUI();
  startQuizTimer();
  nextQuestion();
}

function startAllQuestionsQuiz() {
  if (!Array.isArray(questionBank) || questionBank.length === 0) {
    alert("Список вопросов пуст.");
    return;
  }
  questionCountInput.value = String(questionBank.length);
  startQuiz();
}

async function startGeneratedQuiz() {
  if (!Array.isArray(questionBank) || questionBank.length === 0) {
    alert("Список вопросов пуст.");
    return;
  }

  const requestedLength = Number(questionCountInput.value);
  if (!Number.isInteger(requestedLength) || requestedLength <= 0) {
    alert("Введите корректное количество вопросов (целое число больше нуля)");
    return;
  }

  generatedQuizBtn.disabled = true;
  startQuizBtn.disabled = true;
  allQuestionsBtn.disabled = true;
  feedbackText.textContent = "Генерирую вопросы через Gemini...";
  feedbackText.style.color = "#1d4ed8";
  modeText.textContent = "Режим: генерация Gemini (подготовка)";

  const examMode = examModeSelect.value === "exam" ? "exam" : "practice";

  let generatedPool = [];
  try {
    generatedPool = await generateQuizViaApi(requestedLength);
  } catch (error) {
    alert(error.message || "Не удалось получить вопросы от Gemini.");
  } finally {
    generatedQuizBtn.disabled = false;
    startQuizBtn.disabled = false;
    allQuestionsBtn.disabled = false;
  }

  if (!Array.isArray(generatedPool) || generatedPool.length === 0) {
    feedbackText.textContent = "";
    return;
  }

  state = {
    requestedCount: requestedLength,
    quizLength: generatedPool.length,
    mode: "generated",
    examMode,
    pool: generatedPool,
    currentQuestion: null,
    answerSubmitted: false,
    askedCount: 0,
    correct: 0,
    wrong: 0,
    totalPoints: 0,
    timerSecondsLeft: generatedPool.length * 60,
    finished: false,
    paused: false,
    sessionResults: []
  };

  feedbackText.textContent = "";
  modeText.textContent = `Режим: генерация Gemini (${examMode === "exam" ? "экзамен" : "обычный"})`;
  setPaused(false);
  updatePauseUI();
  startQuizTimer();
  nextQuestion();
}

function nextQuestion() {
  if (state.askedCount >= state.quizLength) {
    finishQuiz();
    return;
  }

  state.currentQuestion = state.pool[state.askedCount];
  state.answerSubmitted = false;
  const isMultiple = isMultipleQuestion(state.currentQuestion);
  questionText.textContent = state.currentQuestion.question;
  answersForm.innerHTML = "";

  state.currentQuestion.options.forEach((option, index) => {
    const wrapper = document.createElement("label");
    wrapper.className = "answer-option";

    const input = document.createElement("input");
    input.type = isMultiple ? "checkbox" : "radio";
    input.name = "answer";
    input.value = String(index);

    wrapper.appendChild(input);
    wrapper.append(` ${option}`);
    answersForm.appendChild(wrapper);
  });

  feedbackText.textContent = isMultiple
    ? "Можно выбрать несколько вариантов"
    : "Выберите один вариант";
  if (state.examMode === "exam") {
    feedbackText.textContent = "Выберите ответ и нажмите \"Ответить\"";
  }
  feedbackText.style.color = "#374151";
  updateScoreboard();
  updateQuizControls();
}

async function submitAnswer(event) {
  event.preventDefault();
  if (state.paused || !state.currentQuestion || state.finished || state.answerSubmitted) return;

  const selected = [...answersForm.querySelectorAll("input[name='answer']:checked")];
  if (selected.length === 0) {
    feedbackText.textContent = "Выберите хотя бы один вариант ответа";
    feedbackText.style.color = "#b45309";
    return;
  }

  const selectedIndices = selected.map((item) => Number(item.value)).sort((a, b) => a - b);
  let correctIndices = [];
  let awardedPoints = 0;
  let isCorrect = false;
  if (state.mode === "generated") {
    correctIndices = getCorrectIndices(state.currentQuestion);
    awardedPoints = calculateAwardedPoints(selectedIndices, correctIndices);
    isCorrect = awardedPoints === 1;
  } else {
    try {
      const checked = await checkAnswerViaApi(state.currentQuestion.id, selectedIndices);
      correctIndices = checked.correctIndices;
      awardedPoints = checked.awardedPoints;
      isCorrect = checked.isCorrect;
    } catch (error) {
      feedbackText.textContent = error.message || "Не удалось проверить ответ.";
      feedbackText.style.color = "#b91c1c";
      return;
    }
  }
  state.answerSubmitted = true;
  if (state.examMode !== "exam") {
    markAnswerHighlights(selectedIndices, correctIndices);
  }
  toggleAnswerInputs(true);

  if (isCorrect) {
    state.correct += 1;
  } else {
    state.wrong += 1;
  }

  if (state.examMode === "exam") {
    feedbackText.textContent = "Ответ сохранен";
    feedbackText.style.color = "#374151";
  } else if (isCorrect) {
    feedbackText.textContent = "Верно";
    feedbackText.style.color = "#047857";
  } else if (awardedPoints > 0) {
    const roundedPoints = awardedPoints.toFixed(2);
    feedbackText.textContent =
      `Частично верно (+${roundedPoints} балла).\n` +
      `Правильный ответ: ${formatCorrectAnswerText(state.currentQuestion, correctIndices)}`;
    feedbackText.style.color = "#b45309";
  } else if (state.mode === "generated" && state.currentQuestion.explanation) {
    feedbackText.textContent =
      "Неверно.\n" +
      `${state.currentQuestion.explanation}\n` +
      `Правильный ответ: ${formatCorrectAnswerText(state.currentQuestion, correctIndices)}`;
    feedbackText.style.color = "#b91c1c";
  } else {
    feedbackText.textContent =
      `Ошибка.\nПравильный ответ: ${formatCorrectAnswerText(state.currentQuestion, correctIndices)}`;
    feedbackText.style.color = "#b91c1c";
  }

  state.askedCount += 1;
  state.totalPoints += awardedPoints;
  state.sessionResults.push({
    question: state.currentQuestion,
    selectedIndices,
    correctIndices,
    isCorrect,
    awardedPoints
  });
  updateScoreboard();
  updateQuizControls();
}

function isMultipleQuestion(question) {
  return question.multiple === true;
}

function getCorrectIndices(question) {
  if (Array.isArray(question.correctIndices)) {
    return [...question.correctIndices].map(Number).sort((a, b) => a - b);
  }

  if (Number.isInteger(question.correctIndex)) {
    return [question.correctIndex];
  }

  return [];
}

function markAnswerHighlights(selectedIndices, correctIndices) {
  const selectedSet = new Set(selectedIndices);
  const correctSet = new Set(correctIndices);
  const inputs = [...answersForm.querySelectorAll("input[name='answer']")];

  inputs.forEach((input) => {
    const optionIndex = Number(input.value);
    const wrapper = input.closest(".answer-option");
    if (!wrapper) return;

    wrapper.classList.remove("is-correct", "is-wrong", "is-missed");

    if (correctSet.has(optionIndex)) {
      wrapper.classList.add("is-correct");
      return;
    }

    if (selectedSet.has(optionIndex) && !correctSet.has(optionIndex)) {
      wrapper.classList.add("is-wrong");
    }
  });

  correctIndices.forEach((correctIndex) => {
    if (!selectedSet.has(correctIndex)) {
      const missedInput = answersForm.querySelector(`input[name='answer'][value='${correctIndex}']`);
      const missedWrapper = missedInput?.closest(".answer-option");
      if (missedWrapper) {
        missedWrapper.classList.add("is-missed");
      }
    }
  });
}

function toggleAnswerInputs(disabled) {
  const inputs = answersForm.querySelectorAll("input[name='answer']");
  inputs.forEach((input) => {
    input.disabled = disabled;
  });
}

async function finishQuiz() {
  stopQuizTimer();
  setPaused(false);
  state.finished = true;
  updatePauseUI();
  questionText.textContent = "Тест завершен";
  const percent = state.quizLength > 0
    ? Math.round((state.totalPoints / state.quizLength) * 100)
    : 0;
  const isPassed = percent >= 75;
  const passText = isPassed ? "Тест сдан" : "Тест не сдан";
  const roundedPoints = state.totalPoints.toFixed(2);
  const resultText =
    `Итог: верно ${state.correct}, ошибок ${state.wrong}, баллы ${roundedPoints}/${state.quizLength}. ` +
    `Результат: ${percent}%. ${passText}.`;
  renderFinalResult(resultText);
  feedbackText.textContent = "";
  renderSessionReview();

  await saveSessionStats({
    requestedCount: state.requestedCount,
    totalQuestions: state.quizLength,
    correct: state.correct,
    wrong: state.wrong,
    totalPoints: state.totalPoints
  });
}

function renderFinalResult(resultText) {
  const resultEl = document.createElement("p");
  resultEl.className = "final-result-text";
  resultEl.textContent = resultText;
  answersForm.innerHTML = "";
  answersForm.appendChild(resultEl);
}

function renderSessionReview() {
  const existingResult = answersForm.querySelector(".final-result-text");
  const preservedText = existingResult?.textContent || "";
  answersForm.innerHTML = "";
  if (preservedText) {
    const resultEl = document.createElement("p");
    resultEl.className = "final-result-text";
    resultEl.textContent = preservedText;
    answersForm.appendChild(resultEl);
  }
  if (!Array.isArray(state.sessionResults) || state.sessionResults.length === 0) {
    return;
  }

  const reviewTitle = document.createElement("h3");
  reviewTitle.textContent = "Разбор вопросов";
  answersForm.appendChild(reviewTitle);

  const reviewList = document.createElement("div");
  reviewList.className = "session-review-list";

  const filtersRow = document.createElement("div");
  filtersRow.className = "row";

  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = "btn secondary review-filter-btn is-active";
  allBtn.textContent = "Все вопросы";

  const wrongOnlyBtn = document.createElement("button");
  wrongOnlyBtn.type = "button";
  wrongOnlyBtn.className = "btn secondary review-filter-btn";
  wrongOnlyBtn.textContent = "Только ошибки";

  filtersRow.appendChild(allBtn);
  filtersRow.appendChild(wrongOnlyBtn);
  answersForm.appendChild(filtersRow);

  function renderReviewCards(mode) {
    reviewList.innerHTML = "";
    const rows = mode === "wrong"
      ? state.sessionResults.filter((item) => !item.isCorrect)
      : state.sessionResults;

    if (rows.length === 0) {
      const emptyEl = document.createElement("p");
      emptyEl.className = "session-review-empty";
      emptyEl.textContent = "Ошибок нет. Отличный результат!";
      reviewList.appendChild(emptyEl);
      return;
    }

    rows.forEach((item) => {
      const card = document.createElement("article");
      card.className = `session-review-card ${item.isCorrect ? "is-correct" : "is-wrong"}`;

      const sourceIndex = state.sessionResults.indexOf(item);
      const questionEl = document.createElement("p");
      questionEl.className = "session-review-question";
      questionEl.textContent = `${sourceIndex + 1}. ${item.question.question}`;
      card.appendChild(questionEl);

      const yourAnswerEl = document.createElement("p");
      yourAnswerEl.textContent = `Ваш ответ: ${formatSelectedAnswerText(item.question, item.selectedIndices)}`;
      card.appendChild(yourAnswerEl);

      const correctEl = document.createElement("p");
      correctEl.textContent = `Правильный ответ: ${formatCorrectAnswerText(item.question, item.correctIndices)}`;
      card.appendChild(correctEl);

      if (item.question.explanation) {
        const explanationEl = document.createElement("p");
        explanationEl.textContent = `Объяснение: ${item.question.explanation}`;
        card.appendChild(explanationEl);
      }

      const statusEl = document.createElement("p");
      statusEl.className = "session-review-status";
      if (item.awardedPoints > 0 && !item.isCorrect) {
        statusEl.textContent = `Статус: частично верно (${item.awardedPoints.toFixed(2)} балла)`;
      } else if (item.isCorrect) {
        statusEl.textContent = "Статус: верно (1.00 балл)";
      } else {
        statusEl.textContent = "Статус: неверно (0.00 баллов)";
      }
      card.appendChild(statusEl);

      reviewList.appendChild(card);
    });
  }

  allBtn.addEventListener("click", () => {
    allBtn.classList.add("is-active");
    wrongOnlyBtn.classList.remove("is-active");
    renderReviewCards("all");
  });

  wrongOnlyBtn.addEventListener("click", () => {
    wrongOnlyBtn.classList.add("is-active");
    allBtn.classList.remove("is-active");
    renderReviewCards("wrong");
  });

  renderReviewCards("all");

  answersForm.appendChild(reviewList);
}

function updateScoreboard() {
  scoreText.classList.toggle("is-hidden", state.examMode === "exam" && !state.finished);
  progressText.textContent = `Прогресс: ${state.askedCount}/${state.quizLength}`;
  scoreText.textContent = `Верно: ${state.correct} | Ошибки: ${state.wrong} | Баллы: ${state.totalPoints.toFixed(2)}`;
  const timerLabel = formatTimer(state.timerSecondsLeft);
  timerText.textContent = state.paused
    ? `Таймер: ${timerLabel} (пауза)`
    : `Таймер: ${timerLabel}`;
}

function renderIdle() {
  questionText.textContent = "Введите количество вопросов и нажмите \"Начать\"";
  answersForm.innerHTML = "";
  setPaused(false);
  updatePauseUI();
  modeText.textContent = "Режим: стандартный тест";
  scoreText.classList.remove("is-hidden");
  progressText.textContent = "Прогресс: 0/0";
  scoreText.textContent = "Верно: 0 | Ошибки: 0 | Баллы: 0.00";
  timerText.textContent = "Таймер: 00:00";
  feedbackText.textContent = "";
  loadGlobalStats();
}

async function generateQuizViaApi(count) {
  const apiKey = geminiApiKeyInput.value.trim();
  if (!apiKey) {
    throw new Error("Введите Gemini API Key в поле выше.");
  }
  const model = geminiModelSelect.value;
  const trickyChance = Number(trickyChanceInput.value);
  if (!Number.isFinite(trickyChance) || trickyChance < 0 || trickyChance > 100) {
    throw new Error("Укажите вероятность каверзных вопросов от 0 до 100.");
  }

  const contextSample = shuffle([...questionBank])
    .slice(0, Math.min(questionBank.length, 50))
    .map((item) => ({
      question: item.question,
      options: item.options,
      correctIndices: getCorrectIndices(item)
    }));

  const response = await fetch("/api/generate-quiz", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      count,
      apiKey,
      model,
      trickyChance,
      sourceQuestions: contextSample
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Ошибка генерации на сервере.");
  }
  if (data.warning) {
    feedbackText.textContent = data.warning;
    feedbackText.style.color = "#b45309";
  }

  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    throw new Error("Gemini вернул пустой набор вопросов.");
  }

  return data.questions;
}

async function checkAnswerViaApi(questionId, selectedIndices) {
  const response = await fetch("/api/check-answer", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ questionId, selectedIndices })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Ошибка проверки ответа.");
  }
  return {
    correctIndices: Array.isArray(data.correctIndices) ? data.correctIndices : [],
    awardedPoints: Number(data.awardedPoints) || 0,
    isCorrect: Boolean(data.isCorrect)
  };
}

function loadGeminiSettings() {
  try {
    const raw = localStorage.getItem("geminiSettings");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.apiKey === "string") {
        geminiApiKeyInput.value = parsed.apiKey;
      }
      if (typeof parsed.model === "string" && parsed.model) {
        geminiModelSelect.value = parsed.model === "gemini-2.5-flash"
          ? parsed.model
          : "gemini-2.5-flash";
      }
      if (Number.isFinite(Number(parsed.trickyChance))) {
        trickyChanceInput.value = String(
          Math.min(100, Math.max(0, Number(parsed.trickyChance)))
        );
      }
    }
  } catch (error) {
    // Ignore malformed local settings and continue with defaults.
  }
}

function persistGeminiSettings() {
  const payload = {
    apiKey: geminiApiKeyInput.value.trim(),
    model: geminiModelSelect.value,
    trickyChance: Number(trickyChanceInput.value)
  };
  localStorage.setItem("geminiSettings", JSON.stringify(payload));
}

function formatCorrectAnswerText(question, correctIndices) {
  const labels = correctIndices
    .map((idx) => question.options[idx])
    .filter(Boolean);
  return labels.join("; ");
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

function startQuizTimer() {
  stopQuizTimer();
  updateScoreboard();
  timerIntervalId = setInterval(() => {
    if (state.finished || state.paused) {
      if (state.finished) {
        stopQuizTimer();
      }
      return;
    }

    state.timerSecondsLeft = Math.max(0, state.timerSecondsLeft - 1);
    timerText.textContent = `Таймер: ${formatTimer(state.timerSecondsLeft)}`;

    if (state.timerSecondsLeft === 0) {
      feedbackText.textContent = "Время вышло. Тест завершен.";
      feedbackText.style.color = "#b91c1c";
      finishQuiz();
    }
  }, 1000);
}

function stopQuizTimer() {
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

function formatTimer(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatSelectedAnswerText(question, selectedIndices) {
  const labels = selectedIndices
    .map((idx) => question.options[idx])
    .filter(Boolean);
  if (labels.length === 0) return "не выбран";
  return labels.join("; ");
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

async function saveSessionStats(payload) {
  const summary = loadSummaryFromCookie();
  const totalPoints = Number(payload.totalPoints) || 0;
  const percentByPoints = payload.totalQuestions > 0
    ? Math.round((totalPoints / payload.totalQuestions) * 100)
    : 0;

  summary.totalSessions += 1;
  summary.totalQuestions += payload.totalQuestions;
  summary.totalCorrectAnswers += payload.correct;
  summary.totalWrongAnswers += payload.wrong;
  summary.totalPoints += totalPoints;
  summary.lastSession = {
    totalQuestions: payload.totalQuestions,
    correct: payload.correct,
    wrong: payload.wrong,
    totalPoints,
    percentByPoints
  };
  summary.sessionsHistory.unshift({
    date: new Date().toISOString(),
    totalQuestions: payload.totalQuestions,
    correct: payload.correct,
    wrong: payload.wrong,
    totalPoints,
    percentByPoints
  });
  summary.sessionsHistory = summary.sessionsHistory.slice(0, 30);
  persistSummaryToCookie(summary);
  renderGlobalStats(summary);
}

async function loadGlobalStats() {
  const summary = loadSummaryFromCookie();
  renderGlobalStats(summary);
}

function renderGlobalStats(summary) {
  if (summary.sessionsHistory.length > 0) {
    const historyLines = summary.sessionsHistory.map((session) => {
      const dateLabel = new Date(session.date).toLocaleString("ru-RU");
      const passText = session.percentByPoints >= 75 ? "тест сдан" : "тест не сдан";
      const pointsText = Number(session.totalPoints || 0).toFixed(2);
      return `${dateLabel}: вопросов ${session.totalQuestions}; верно ${session.correct}; неверно ${session.wrong}; баллы ${pointsText}/${session.totalQuestions}; процент по баллам ${session.percentByPoints}%; ${passText}`;
    });
    sessionStatsText.innerHTML = `Сессии по датам:<br>${historyLines.join("<br>")}`;
  } else {
    sessionStatsText.textContent = "Сессия: нет данных";
  }

  const totalPercent = summary.totalQuestions > 0
    ? Math.round((summary.totalPoints / summary.totalQuestions) * 100)
    : 0;
  globalStatsText.textContent =
    `Общая: сессий ${summary.totalSessions}; ` +
    `вопросов ${summary.totalQuestions}; ` +
    `верно ${summary.totalCorrectAnswers}; ` +
    `неверно ${summary.totalWrongAnswers}; ` +
    `баллы ${summary.totalPoints.toFixed(2)}/${summary.totalQuestions}; ` +
    `процент по баллам ${totalPercent}%`;
}

function defaultSummary() {
  return {
    totalSessions: 0,
    totalQuestions: 0,
    totalCorrectAnswers: 0,
    totalWrongAnswers: 0,
    totalPoints: 0,
    lastSession: null,
    sessionsHistory: []
  };
}

function loadSummaryFromCookie() {
  const raw = getCookieValue("quizStats");
  if (!raw) return defaultSummary();

  try {
    const parsed = JSON.parse(raw);
    if (
      Number.isInteger(parsed.totalSessions) &&
      Number.isInteger(parsed.totalQuestions) &&
      Number.isFinite(Number(parsed.totalPoints ?? parsed.totalCorrect ?? 0))
    ) {
      if (!Number.isInteger(parsed.totalCorrectAnswers)) {
        parsed.totalCorrectAnswers = Number.isInteger(parsed.totalCorrect) ? parsed.totalCorrect : 0;
      }
      if (!Number.isInteger(parsed.totalWrongAnswers)) {
        parsed.totalWrongAnswers = Number.isInteger(parsed.totalWrong) ? parsed.totalWrong : 0;
      }
      parsed.totalPoints = Number(parsed.totalPoints ?? parsed.totalCorrectAnswers ?? 0);

      const lastSession = parsed.lastSession;
      const hasValidLastSession =
        lastSession === null ||
        (
          typeof lastSession === "object" &&
          lastSession !== null &&
          Number.isInteger(lastSession.totalQuestions) &&
          Number.isInteger(lastSession.correct) &&
          Number.isInteger(lastSession.wrong) &&
          Number.isFinite(Number(lastSession.totalPoints ?? lastSession.correct ?? 0)) &&
          Number.isInteger(lastSession.percentByPoints ?? lastSession.percentCorrect)
        );
      const sessionsHistory = Array.isArray(parsed.sessionsHistory) ? parsed.sessionsHistory : [];
      const hasValidSessionsHistory = sessionsHistory.every(
        (session) =>
          session &&
          typeof session === "object" &&
          typeof session.date === "string" &&
          Number.isInteger(session.totalQuestions) &&
          Number.isInteger(session.correct) &&
          Number.isInteger(session.wrong) &&
          Number.isFinite(Number(session.totalPoints ?? session.correct ?? 0)) &&
          Number.isInteger(session.percentByPoints ?? session.percentCorrect)
      );
      if (!hasValidLastSession) {
        return defaultSummary();
      }
      if (!hasValidSessionsHistory) {
        return defaultSummary();
      }
      parsed.sessionsHistory = sessionsHistory.map((session) => ({
        ...session,
        totalPoints: Number(session.totalPoints ?? session.correct ?? 0),
        percentByPoints: Number.isInteger(session.percentByPoints)
          ? session.percentByPoints
          : (Number.isInteger(session.percentCorrect) ? session.percentCorrect : 0)
      }));
      if (parsed.lastSession && typeof parsed.lastSession === "object") {
        parsed.lastSession.totalPoints = Number(parsed.lastSession.totalPoints ?? parsed.lastSession.correct ?? 0);
        parsed.lastSession.percentByPoints = Number.isInteger(parsed.lastSession.percentByPoints)
          ? parsed.lastSession.percentByPoints
          : (Number.isInteger(parsed.lastSession.percentCorrect) ? parsed.lastSession.percentCorrect : 0);
      }
      return parsed;
    }
  } catch (error) {
    return defaultSummary();
  }

  return defaultSummary();
}

function persistSummaryToCookie(summary) {
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  const value = encodeURIComponent(JSON.stringify(summary));
  document.cookie = `quizStats=${value}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
}

function resetStats() {
  document.cookie = "quizStats=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax";
  renderGlobalStats(defaultSummary());
}

function getCookieValue(name) {
  const prefix = `${name}=`;
  const parts = document.cookie.split(";").map((part) => part.trim());
  for (const part of parts) {
    if (part.startsWith(prefix)) {
      return decodeURIComponent(part.slice(prefix.length));
    }
  }
  return null;
}
