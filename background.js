/**
 * and.gas — Service Worker (Manifest V3)
 * -------------------------------------------------
 * Responsabilidades:
 *  1. Agendar verificações periódicas com chrome.alarms (a cada 2 minutos).
 *  2. Consultar a API Gas Tracker da Etherscan (ProposeGasPrice).
 *  3. Comparar o gas atual com o limite salvo em chrome.storage.local.
 *  4. Disparar notificação do sistema quando gas <= limite (com cooldown anti-spam).
 */

// =============================================================================
// CONFIGURAÇÃO — substitua pela sua chave em https://etherscan.io/myapikey
// =============================================================================

/** @type {string} Chave da API Etherscan (obrigatória para produção). */
const ETHERSCAN_API_KEY = "ALOQUE AQUI A SUA CHAVE DA API DA ETHERSCAN";

/**
 * API Etherscan V2 (V1 foi descontinuada em ago/2025 e retorna NOTOK).
 * @see https://docs.etherscan.io/api-reference/endpoint/gasoracle
 */
const ETHERSCAN_API_BASE = "https://api.etherscan.io/v2/api";

/** Chain ID da rede Ethereum Mainnet. */
const ETHEREUM_CHAIN_ID = 1;

/** Nome do alarme registrado no chrome.alarms. */
const ALARM_NAME = "and-gas-periodic-check";

/** Intervalo entre checagens automáticas (em minutos). */
const CHECK_INTERVAL_MINUTES = 2;

/**
 * Tempo mínimo entre duas notificações consecutivas (anti-spam).
 * 15 minutos é um equilíbrio razoável para alertas de gas sem incomodar o usuário.
 */
const NOTIFICATION_COOLDOWN_MS = 15 * 60 * 1000;

// =============================================================================
// CHAVES DE ARMAZENAMENTO (chrome.storage.local)
// =============================================================================

const STORAGE_KEYS = {
  /** Limite em Gwei definido pelo usuário no popup. */
  GAS_LIMIT: "gasLimit",
  /** Timestamp (ms) da última notificação enviada. */
  LAST_NOTIFICATION_AT: "lastNotificationAt",
  /** Último ProposeGasPrice obtido (string numérica em Gwei). */
  LAST_GAS_PRICE: "lastGasPrice",
  /** ISO string da última verificação bem-sucedida. */
  LAST_CHECK_AT: "lastCheckAt",
  /** Mensagem de erro da última falha (se houver). */
  LAST_ERROR: "lastError",
};

// =============================================================================
// INICIALIZAÇÃO DO SERVICE WORKER
// =============================================================================

chrome.runtime.onInstalled.addListener(() => {
  schedulePeriodicCheck();
});

chrome.runtime.onStartup.addListener(() => {
  schedulePeriodicCheck();
});

/**
 * Garante que existe um único alarme periódico ativo.
 * chrome.alarms.create com periodInMinutes repete automaticamente.
 */
async function schedulePeriodicCheck() {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (existing) {
    return;
  }

  await chrome.alarms.create(ALARM_NAME, {
    delayInMinutes: 0.1,
    periodInMinutes: CHECK_INTERVAL_MINUTES,
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    runGasCheck({ source: "alarm" });
  }
});

// =============================================================================
// COMUNICAÇÃO COM O POPUP (chrome.runtime.onMessage)
// =============================================================================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_STATUS") {
    getStatus()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SAVE_ALERT") {
    const limit = Number(message.gasLimit);
    saveGasLimit(limit)
      .then(() => getStatus())
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "CHECK_NOW") {
    runGasCheck({ source: "manual" })
      .then(() => getStatus())
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

// =============================================================================
// FLUXO PRINCIPAL DE VERIFICAÇÃO
// =============================================================================

/**
 * Executa o ciclo completo: fetch → persistência → avaliação de alerta.
 * @param {{ source: 'alarm' | 'manual' }} context
 */
async function runGasCheck(context) {
  try {
    const proposeGasPrice = await fetchProposeGasPrice();
    const storage = await chrome.storage.local.get([
      STORAGE_KEYS.GAS_LIMIT,
      STORAGE_KEYS.LAST_NOTIFICATION_AT,
    ]);

    const gasLimit = Number(storage[STORAGE_KEYS.GAS_LIMIT] ?? 0);
    const lastNotificationAt = Number(
      storage[STORAGE_KEYS.LAST_NOTIFICATION_AT] ?? 0
    );

    await chrome.storage.local.set({
      [STORAGE_KEYS.LAST_GAS_PRICE]: proposeGasPrice,
      [STORAGE_KEYS.LAST_CHECK_AT]: new Date().toISOString(),
      [STORAGE_KEYS.LAST_ERROR]: "",
    });

    const shouldNotify =
      gasLimit > 0 &&
      proposeGasPrice <= gasLimit &&
      canSendNotification(lastNotificationAt);

    if (shouldNotify) {
      await sendGasNotification(proposeGasPrice, gasLimit);
      await chrome.storage.local.set({
        [STORAGE_KEYS.LAST_NOTIFICATION_AT]: Date.now(),
      });
    }

    console.info(
      `[and.gas] check (${context.source}) — gas: ${proposeGasPrice} Gwei, limit: ${gasLimit}, notified: ${shouldNotify}`
    );
  } catch (error) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.LAST_ERROR]: error.message ?? String(error),
    });
    console.error("[and.gas] gas check failed:", error);
    throw error;
  }
}

/**
 * Consulta a Etherscan e retorna o ProposeGasPrice em Gwei (número).
 * Documentação: https://docs.etherscan.io/api-endpoints/gas-tracker
 * @returns {Promise<number>}
 */
async function fetchProposeGasPrice() {
  if (!ETHERSCAN_API_KEY || ETHERSCAN_API_KEY === "SUA_API_KEY_AQUI") {
    throw new Error(
      "Configure ETHERSCAN_API_KEY em background.js antes de usar a extensão."
    );
  }

  const params = new URLSearchParams({
    chainid: String(ETHEREUM_CHAIN_ID),
    module: "gastracker",
    action: "gasoracle",
    apikey: ETHERSCAN_API_KEY,
  });
  const url = `${ETHERSCAN_API_BASE}?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Etherscan HTTP ${response.status}`);
  }

  const payload = await response.json();

  if (payload.status !== "1" || !payload.result?.ProposeGasPrice) {
    const detail =
      typeof payload.result === "string"
        ? payload.result
        : payload.message ?? "Resposta inválida";
    throw new Error(`Etherscan: ${detail}`);
  }

  const gwei = Number(payload.result.ProposeGasPrice);
  if (Number.isNaN(gwei)) {
    throw new Error("ProposeGasPrice retornou valor não numérico.");
  }

  return gwei;
}

// =============================================================================
// NOTIFICAÇÕES
// =============================================================================

/**
 * Verifica se o cooldown permite uma nova notificação.
 * @param {number} lastNotificationAt — timestamp em ms
 */
function canSendNotification(lastNotificationAt) {
  if (!lastNotificationAt) {
    return true;
  }
  return Date.now() - lastNotificationAt >= NOTIFICATION_COOLDOWN_MS;
}

/**
 * Cria notificação nativa do sistema operacional.
 * @param {number} currentGas — Gwei atual
 * @param {number} limit — Gwei limite do usuário
 */
async function sendGasNotification(currentGas, limit) {
  const notificationId = `and-gas-${Date.now()}`;

  await chrome.notifications.create(notificationId, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "and.gas — Gas abaixo do limite",
    message: `Propose Gas: ${currentGas} Gwei (seu limite: ${limit} Gwei). Bom momento para enviar transações.`,
    priority: 1,
  });
}

// =============================================================================
// ARMAZENAMENTO E ESTADO
// =============================================================================

/**
 * Persiste o limite de gas definido pelo usuário.
 * @param {number} gasLimit — valor em Gwei; 0 desativa o alerta
 */
async function saveGasLimit(gasLimit) {
  if (Number.isNaN(gasLimit) || gasLimit < 0) {
    throw new Error("Informe um limite válido em Gwei (número >= 0).");
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.GAS_LIMIT]: gasLimit,
  });
}

/**
 * Monta o objeto de status consumido pelo popup.
 */
async function getStatus() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.GAS_LIMIT,
    STORAGE_KEYS.LAST_GAS_PRICE,
    STORAGE_KEYS.LAST_CHECK_AT,
    STORAGE_KEYS.LAST_ERROR,
    STORAGE_KEYS.LAST_NOTIFICATION_AT,
  ]);

  const gasLimit = Number(data[STORAGE_KEYS.GAS_LIMIT] ?? 0);
  const lastGasPrice = data[STORAGE_KEYS.LAST_GAS_PRICE];
  const alertActive = gasLimit > 0;

  return {
    ok: true,
    gasLimit,
    alertActive,
    lastGasPrice:
      lastGasPrice !== undefined && lastGasPrice !== ""
        ? Number(lastGasPrice)
        : null,
    lastCheckAt: data[STORAGE_KEYS.LAST_CHECK_AT] ?? null,
    lastError: data[STORAGE_KEYS.LAST_ERROR] ?? "",
    checkIntervalMinutes: CHECK_INTERVAL_MINUTES,
    notificationCooldownMinutes: NOTIFICATION_COOLDOWN_MS / 60000,
  };
}
