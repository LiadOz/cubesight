/** Speak the two inspection callouts using the browser's local speech engine. */
export function createVoiceCallouts({ speech = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance } = {}) {
  let lastCallout = null;
  let statusCache = null;
  const localVoice = () => speech?.getVoices?.().find(voice => voice.localService) ?? null;
  const onVoicesChanged = () => { statusCache = null; };
  speech?.addEventListener?.('voiceschanged', onVoicesChanged);
  return {
    status() {
      if (statusCache) return statusCache;
      if (!speech || !Utterance) statusCache = 'speech is not available in this browser.';
      else statusCache = localVoice() ? 'offline voice ready.' : 'no offline voice installed; callouts stay silent.';
      return statusCache;
    },
    update({ callout, enabled = false, calloutsEnabled = false } = {}) {
      const active = enabled && calloutsEnabled && (callout === 8 || callout === 12);
      if (!active) {
        if (lastCallout != null) speech?.cancel?.();
        lastCallout = null;
        return false;
      }
      if (callout === lastCallout) {
        return false;
      }
      if (!speech || !Utterance) return false;
      const voice = localVoice();
      if (!voice) return false;
      lastCallout = callout;
      speech.cancel?.();
      const utterance = new Utterance(`${callout} seconds`);
      utterance.lang = voice.lang || 'en-US';
      utterance.voice = voice;
      speech.speak(utterance);
      return true;
    },
    cancel() { lastCallout = null; speech?.cancel?.(); },
    destroy() { lastCallout = null; speech?.cancel?.(); speech?.removeEventListener?.('voiceschanged', onVoicesChanged); },
  };
}
