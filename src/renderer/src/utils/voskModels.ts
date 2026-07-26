export interface VoskModelEntry {
  id: string
  label: string
  filename: string
  url: string
  sizeMb: number
}

export const VOSK_MODELS: VoskModelEntry[] = [
  {
    id: 'en-us',
    label: 'English (US)',
    filename: 'vosk-model-small-en-us-0.15.zip',
    url: 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip',
    sizeMb: 40,
  },
  {
    id: 'es',
    label: 'Spanish',
    filename: 'vosk-model-small-es-0.42.zip',
    url: 'https://alphacephei.com/vosk/models/vosk-model-small-es-0.42.zip',
    sizeMb: 39,
  },
  {
    id: 'fr',
    label: 'French',
    filename: 'vosk-model-small-fr-0.22.zip',
    url: 'https://alphacephei.com/vosk/models/vosk-model-small-fr-0.22.zip',
    sizeMb: 41,
  },
  {
    id: 'de',
    label: 'German',
    filename: 'vosk-model-small-de-0.15.zip',
    url: 'https://alphacephei.com/vosk/models/vosk-model-small-de-0.15.zip',
    sizeMb: 45,
  },
  {
    id: 'hi',
    label: 'Hindi',
    filename: 'vosk-model-small-hi-0.22.zip',
    url: 'https://alphacephei.com/vosk/models/vosk-model-small-hi-0.22.zip',
    sizeMb: 42,
  },
]
