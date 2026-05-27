/**
 * and.gas — Lógica da interface do popup
 * -------------------------------------------------
 * Comunica-se com o Service Worker (background.js) via chrome.runtime.sendMessage.
 * Não realiza fetch direto à Etherscan: toda I/O de rede fica no background.
 */

// =============================================================================
// REFERÊNCIAS DOM
// =============================================================================

const elCurrentGas = document.getElementById("current-gas");
const elLastCheck = document.getElementById("last-check");
const elGasLimitInput = document.getElementById("gas-limit-input");
const elSaveButton = document.getElementById("save-alert-btn");
const elAlertStatus = document.getElementById("alert-status");
const elErrorStatus = document.getElementById("error-status");

// =============================================================================
// UTILITÁRIOS DE MENSAGEM
// =============================================================================

/**
 * Envia mensagem tipada ao Service Worker e aguarda resposta.
 * @template T
 * @param {{ type: string, [key: string]: unknown }} payload
 * @returns {Promise<T>}
 */
function sendToBackground(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

// =============================================================================
// RENDERIZAÇÃO DA UI
// =============================================================================

/**
 * Atualiza o display principal e textos de status com base no estado do background.
 * @param {object} status — retorno de GET_STATUS / SAVE_ALERT / CHECK_NOW
 */
function renderStatus(status) {
  if (!status?.ok) {
    showError(status?.error ?? "Falha ao obter status.");
    return;
  }

  hideError();

  if (status.lastGasPrice !== null && !Number.isNaN(status.lastGasPrice)) {
    elCurrentGas.textContent = formatGwei(status.lastGasPrice);
    elCurrentGas.classList.remove("is-loading");
  } else {
    elCurrentGas.textContent = "—";
    elCurrentGas.classList.add("is-loading");
  }

  if (status.lastCheckAt) {
    const when = new Date(status.lastCheckAt);
    elLastCheck.textContent = `Atualizado ${formatRelativeTime(when)} · checagem a cada ${status.checkIntervalMinutes} min`;
  } else {
    elLastCheck.textContent = "Nenhuma leitura ainda — abrindo monitor…";
  }

  elGasLimitInput.value =
    status.gasLimit > 0 ? String(status.gasLimit) : "";

  if (status.alertActive) {
    elAlertStatus.textContent = `Alerta ativo — notifica se gas ≤ ${formatGwei(status.gasLimit)} Gwei (cooldown ${status.notificationCooldownMinutes} min).`;
    elAlertStatus.classList.add("status--active");
  } else {
    elAlertStatus.textContent =
      "Alerta inativo — defina um limite em Gwei e clique em Salvar Alerta.";
    elAlertStatus.classList.remove("status--active");
  }

  if (status.lastError) {
    showError(status.lastError);
  }
}

/**
 * Formata número de Gwei para exibição (até 2 casas decimais quando necessário).
 * @param {number} value
 */
function formatGwei(value) {
  const n = Number(value);
  if (Number.isInteger(n)) {
    return String(n);
  }
  return n.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Texto relativo simples em português (ex.: "há 2 min").
 * @param {Date} date
 */
function formatRelativeTime(date) {
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSec < 10) return "agora";
  if (diffSec < 60) return `há ${diffSec}s`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  return `há ${diffH}h`;
}

function showError(message) {
  elErrorStatus.hidden = false;
  elErrorStatus.textContent = message;
}

function hideError() {
  elErrorStatus.hidden = true;
  elErrorStatus.textContent = "";
}

function setLoading(isLoading) {
  elSaveButton.disabled = isLoading;
  if (isLoading) {
    elCurrentGas.classList.add("is-loading");
  }
}

// =============================================================================
// AÇÕES DO USUÁRIO
// =============================================================================

async function refreshFromBackground() {
  setLoading(true);
  try {
    const status = await sendToBackground({ type: "CHECK_NOW" });
    renderStatus(status);
  } catch (error) {
    showError(error.message ?? String(error));
  } finally {
    setLoading(false);
  }
}

async function saveAlert() {
  const raw = elGasLimitInput.value.trim();
  const gasLimit = raw === "" ? 0 : Number(raw);

  if (raw !== "" && (Number.isNaN(gasLimit) || gasLimit < 0)) {
    showError("Informe um número válido em Gwei.");
    return;
  }

  setLoading(true);
  hideError();

  try {
    const status = await sendToBackground({
      type: "SAVE_ALERT",
      gasLimit,
    });
    renderStatus(status);
  } catch (error) {
    showError(error.message ?? String(error));
  } finally {
    setLoading(false);
  }
}

// =============================================================================
// INICIALIZAÇÃO
// =============================================================================

elSaveButton.addEventListener("click", saveAlert);

elGasLimitInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    saveAlert();
  }
});

// O script fica no final do <body>; inicializa assim que o DOM está pronto.
refreshFromBackground();
