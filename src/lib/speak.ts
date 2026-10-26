// Speaks an announcement (electron/announce.ts decides when and what) through
// the system's own voices — on Windows the installed ones, offline. Queued:
// two at once follow each other instead of talking over each other.

export function speak(s: SpokenBridge): void {
  const synth = window.speechSynthesis
  if (!synth) return
  const u = new SpeechSynthesisUtterance(s.text)
  u.lang = s.lang === 'de' ? 'de-DE' : 'en-US'
  u.volume = s.volume
  u.voice = pickVoice(synth.getVoices(), s.lang, s.voice)
  synth.speak(u)
}

/** The voice by name, else the first one for the language, else the system's. */
export function pickVoice(voices: SpeechSynthesisVoice[], lang: string, name: string): SpeechSynthesisVoice | null {
  return (
    (name && voices.find((v) => v.name === name)) || voices.find((v) => v.lang.toLowerCase().startsWith(lang)) || null
  )
}

/** The installed voices for a language, once the system has listed them (it
 *  does so late, and says so with "voiceschanged"). */
export function voicesFor(lang: string, onChange: (voices: SpeechSynthesisVoice[]) => void): () => void {
  const synth = window.speechSynthesis
  if (!synth) return () => {}
  const update = (): void => onChange(synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang)))
  update()
  synth.addEventListener('voiceschanged', update)
  return () => synth.removeEventListener('voiceschanged', update)
}
