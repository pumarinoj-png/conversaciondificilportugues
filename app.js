// ---------------------------------------------------------------------------
// Preparar uma conversa difícil — lógica de cliente (vanilla JS)
// Todo el estado se guarda en localStorage. Las llamadas a la IA pasan por
// /api/chat (una única función serverless) para no exponer la API key.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "prep-conversa-dificil-pt:v1";

const STAGES = [
  "Abertura",
  "Apresentar fatos/observações",
  "Interpretações/sentimentos",
  "Escuta da outra pessoa",
  "Necessidades que você tem",
  "Pedido concreto",
  "Checagem e encerramento final",
];

const initialState = {
  view: "caso",
  caseData: {
    counterpartArea: "",
    problemDescription: "",
    possibleCauses: "",
    counterpartInterests: "",
    desiredOutcome: "",
  },
  prep: { facts: "", interpretations: "", needs: "", request: "" },
  prepReview: null,
  messages: [],
  stage: STAGES[0],
  feedback: null,
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(initialState);
    const parsed = JSON.parse(raw);
    return Object.assign(structuredClone(initialState), parsed);
  } catch {
    return structuredClone(initialState);
  }
}

let state = loadState();

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // almacenamiento no disponible: seguimos funcionando en memoria
  }
}

// --- helpers de red ---------------------------------------------------------

async function callApi(action, payload) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Ocorreu um erro inesperado.");
  }
  return data;
}

// --- referencias a elementos -------------------------------------------------

const el = (id) => document.getElementById(id);

const views = {
  caso: el("view-caso"),
  conversacion: el("view-conversacion"),
  practicar: el("view-practicar"),
};

const stepPills = document.querySelectorAll(".step-pill");
const btnBack = el("btn-back");
const btnReset = el("btn-reset");

const casoFields = {
  counterpartArea: el("f-area"),
  problemDescription: el("f-problem"),
  possibleCauses: el("f-causes"),
  counterpartInterests: el("f-interests"),
  desiredOutcome: el("f-outcome"),
};
const casoError = el("caso-error");
const btnCasoContinue = el("btn-caso-continue");

const prepFields = {
  facts: el("f-facts"),
  interpretations: el("f-interpretations"),
  needs: el("f-needs"),
  request: el("f-request"),
};
const convError = el("conv-error");
const btnReview = el("btn-review");
const btnConvContinue = el("btn-conv-continue");

const stepperEl = el("stepper");
const chatBox = el("chat-box");
const chatEmpty = el("chat-empty");
const chatError = el("chat-error");
const chatInput = el("chat-input");
const btnSend = el("btn-send");
const btnFeedback = el("btn-feedback");

const feedbackModal = el("feedback-modal");
const feedbackBody = el("feedback-body");
const btnCloseFeedback = el("btn-close-feedback");

// --- render -------------------------------------------------------------

function showView(view) {
  state.view = view;
  Object.entries(views).forEach(([name, node]) => {
    node.classList.toggle("hidden", name !== view);
  });
  stepPills.forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.step === view);
  });
  btnBack.hidden = view !== "conversacion";
  saveState();
}

function fillFormsFromState() {
  Object.entries(casoFields).forEach(([key, node]) => {
    node.value = state.caseData[key] || "";
  });
  Object.entries(prepFields).forEach(([key, node]) => {
    node.value = state.prep[key] || "";
  });
}

function renderReview() {
  const keys = ["facts", "interpretations", "needs", "request"];
  keys.forEach((key) => {
    const badge = el("badge-" + key);
    const comment = el("comment-" + key);
    const review = state.prepReview && state.prepReview[key];
    if (!review) {
      badge.className = "badge";
      comment.className = "comment";
      comment.textContent = "";
      return;
    }
    badge.className = "badge " + (review.ok ? "ok" : "warn");
    badge.textContent = review.ok ? "✓ No caminho certo" : "⚠ Pode melhorar";
    comment.className = "comment show";
    comment.textContent = review.comment || "";
  });
  btnConvContinue.disabled = !state.prepReview;
}

function renderStepper() {
  stepperEl.innerHTML = "";
  const currentIndex = STAGES.indexOf(state.stage);
  STAGES.forEach((stage, i) => {
    const span = document.createElement("span");
    span.className =
      "stage-pill " +
      (i < currentIndex ? "done" : i === currentIndex ? "current" : "");
    span.textContent = stage;
    stepperEl.appendChild(span);
    if (i < STAGES.length - 1) {
      const arrow = document.createElement("span");
      arrow.className = "arrow";
      arrow.textContent = "→";
      stepperEl.appendChild(arrow);
    }
  });
}

function renderChat({ pending } = {}) {
  chatBox.innerHTML = "";
  if (state.messages.length === 0 && !pending) {
    chatBox.appendChild(chatEmpty);
    return;
  }
  state.messages.forEach((m) => {
    const bubble = document.createElement("div");
    bubble.className = "bubble " + (m.role === "user" ? "user" : "assistant");
    bubble.textContent = m.content;
    chatBox.appendChild(bubble);
  });
  if (pending) {
    const bubble = document.createElement("div");
    bubble.className = "bubble pending";
    bubble.textContent = "digitando…";
    chatBox.appendChild(bubble);
  }
  chatBox.scrollTop = chatBox.scrollHeight;
}

function fmtScore(n) {
  return Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function scoreClass(score) {
  if (score >= 8) return "color: var(--accent);";
  if (score >= 5) return "color: var(--accent2);";
  return "color: #c0392b;";
}

function renderFeedback() {
  if (!state.feedback) return;
  const { stages, average, tips } = state.feedback;
  feedbackBody.innerHTML = "";

  const avgRow = document.createElement("div");
  avgRow.className = "avg-row";
  avgRow.innerHTML =
    '<span>Nota média</span><span class="score" style="' +
    scoreClass(average) +
    '">' +
    fmtScore(average) +
    "</span>";
  feedbackBody.appendChild(avgRow);

  stages.forEach((s) => {
    const card = document.createElement("div");
    card.className = "stage-card";
    card.innerHTML =
      '<div class="stage-card-head"><span></span><span style="' +
      scoreClass(s.score) +
      '"></span></div><p></p>';
    card.querySelector(".stage-card-head span:first-child").textContent = s.stage;
    card.querySelector(".stage-card-head span:last-child").textContent = fmtScore(s.score);
    card.querySelector("p").textContent = s.comment;
    feedbackBody.appendChild(card);
  });

  const tipsTitle = document.createElement("p");
  tipsTitle.className = "tips-title";
  tipsTitle.textContent = "Dicas para a sua próxima conversa";
  feedbackBody.appendChild(tipsTitle);

  tips.forEach((tip) => {
    const tipEl = document.createElement("div");
    tipEl.className = "tip";
    tipEl.textContent = "💡 " + tip;
    feedbackBody.appendChild(tipEl);
  });

  feedbackModal.classList.remove("hidden");
}

// --- eventos: formulario de caso ------------------------------------------

Object.entries(casoFields).forEach(([key, node]) => {
  node.addEventListener("input", () => {
    state.caseData[key] = node.value;
    saveState();
  });
});

btnCasoContinue.addEventListener("click", () => {
  const missing = Object.values(state.caseData).some((v) => !v.trim());
  if (missing) {
    casoError.style.display = "block";
    casoError.textContent = "Preencha todos os campos antes de continuar.";
    return;
  }
  casoError.style.display = "none";
  showView("conversacion");
});

// --- eventos: formulario de preparación de la conversación ------------------

Object.entries(prepFields).forEach(([key, node]) => {
  node.addEventListener("input", () => {
    state.prep[key] = node.value;
    state.prepReview = null;
    renderReview();
    saveState();
  });
});

btnBack.addEventListener("click", () => {
  showView("caso");
});

btnReview.addEventListener("click", async () => {
  const missing = Object.values(state.prep).some((v) => !v.trim());
  if (missing) {
    convError.style.display = "block";
    convError.textContent = "Preencha os quatro campos antes de pedir a revisão.";
    return;
  }
  convError.style.display = "none";
  btnReview.disabled = true;
  btnReview.textContent = "Revisando…";
  try {
    const review = await callApi("validate-prep", {
      caseData: state.caseData,
      prep: state.prep,
    });
    state.prepReview = review;
    renderReview();
    saveState();
  } catch (e) {
    convError.style.display = "block";
    convError.textContent = e.message;
  } finally {
    btnReview.disabled = false;
    btnReview.textContent = state.prepReview ? "Revisar novamente" : "Revisar minha preparação";
  }
});

btnConvContinue.addEventListener("click", () => {
  if (!state.prepReview) return;
  showView("practicar");
  renderStepper();
  renderChat();
});

// --- eventos: práctica de la conversación -----------------------------------

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || btnSend.disabled) return;
  chatError.style.display = "none";
  chatInput.value = "";
  state.messages.push({ role: "user", content: text });
  renderChat({ pending: true });
  saveState();

  btnSend.disabled = true;
  try {
    const result = await callApi("chat", {
      caseData: state.caseData,
      prep: state.prep,
      messages: state.messages,
    });
    state.messages.push({ role: "assistant", content: result.reply });
    state.stage = result.stage || state.stage;
    renderStepper();
    renderChat();
    saveState();
  } catch (e) {
    chatError.style.display = "block";
    chatError.textContent = e.message;
    renderChat();
  } finally {
    btnSend.disabled = false;
  }
}

btnSend.addEventListener("click", sendMessage);
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

btnFeedback.addEventListener("click", async () => {
  if (state.messages.length === 0) return;
  chatError.style.display = "none";
  btnFeedback.disabled = true;
  btnFeedback.textContent = "Gerando feedback…";
  try {
    const report = await callApi("feedback", {
      caseData: state.caseData,
      prep: state.prep,
      messages: state.messages,
    });
    state.feedback = report;
    saveState();
    renderFeedback();
  } catch (e) {
    chatError.style.display = "block";
    chatError.textContent = e.message;
  } finally {
    btnFeedback.disabled = false;
    btnFeedback.textContent = "📋 Receber feedback da conversa";
  }
});

btnCloseFeedback.addEventListener("click", () => {
  feedbackModal.classList.add("hidden");
});

// --- reiniciar ---------------------------------------------------------------

btnReset.addEventListener("click", () => {
  if (!confirm("Tem certeza de que deseja reiniciar? Todo o progresso será perdido.")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = structuredClone(initialState);
  fillFormsFromState();
  renderReview();
  renderStepper();
  renderChat();
  casoError.style.display = "none";
  convError.style.display = "none";
  chatError.style.display = "none";
  feedbackModal.classList.add("hidden");
  showView("caso");
});

// --- inicio -------------------------------------------------------------

fillFormsFromState();
renderReview();
renderStepper();
renderChat();
showView(state.view);
if (state.feedback) renderFeedback();
