export function createMessagesVoiceHelpers({
  state,
  $,
  saveStore,
  escapeHtml,
}) {
  function setGreeting() {
    const hour = new Date().getHours();
    let message = "Hola. Que deseas registrar hoy: entrada, produccion o venta?";
    if (hour >= 5 && hour < 12) message = "Buenos dias. Quieres registrar inventario, produccion o ventas?";
    else if (hour >= 12 && hour < 19) message = "Buenas tardes. Deseas registrar entradas, salidas o revisar alertas?";
    else message = "Buenas noches. Deseas registrar ventas, salida a produccion o revisar alertas?";
    $("greeting").textContent = message;
  }

  function setVoiceUI() {
    $("voiceTxt").textContent = state.voice?.enabled ? "ON" : "OFF";
  }

  function speak(text) {
    if (!state.voice?.enabled) return;
    try {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(String(text || ""));
      utterance.lang = "es-ES";
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {}
  }

  function renderMsgs() {
    const list = $("msgList");
    list.innerHTML = "";
    state.messages.slice(0, 3).forEach((message) => {
      const div = document.createElement("div");
      div.className = "msg";
      div.innerHTML = `<div class="who">${escapeHtml(message.who)}</div><div class="txt">${escapeHtml(message.txt)}</div>`;
      list.appendChild(div);
    });
  }

  function pushMsg(who, txt) {
    state.messages.unshift({ who, txt, t: Date.now() });
    if (state.messages.length > 18) state.messages.pop();
    saveStore();
    renderMsgs();
    if (String(who).includes("RAULI")) speak(txt);
  }

  function ensureWelcomeMessage() {
    if (state.messages.length === 0) {
      pushMsg("RAULI", "RAULI listo. Puedo ayudarte con ventas, inventario, produccion, alertas y sincronizacion con ATLAS.");
    }
  }

  function bindVoiceControls({ onDictationResult, onVoiceUnsupported }) {
    setVoiceUI();

    $("btnVoiceOn").onclick = () => {
      state.voice.enabled = !state.voice.enabled;
      saveStore();
      setVoiceUI();
      pushMsg("RAULI", state.voice.enabled ? "Voz activada." : "Voz desactivada.");
    };

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    let rec = null;
    if (SpeechRec) {
      rec = new SpeechRec();
      rec.lang = "es-ES";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (event) => {
        const text = event.results?.[0]?.[0]?.transcript || "";
        if (text) onDictationResult(text.trim(), Boolean(state.voice.autoSend));
      };
      rec.onerror = () => onVoiceUnsupported("No pude usar dictado por voz en este navegador.");
    }

    $("btnVoice").onclick = () => {
      if (!rec) {
        onVoiceUnsupported("Tu navegador no soporta dictado por voz.");
        return;
      }
      try {
        rec.start();
        pushMsg("RAULI", "Te escucho. Habla ahora.");
      } catch {}
    };
  }

  return {
    setGreeting,
    setVoiceUI,
    speak,
    renderMsgs,
    pushMsg,
    ensureWelcomeMessage,
    bindVoiceControls,
  };
}
