import React, { useState, useEffect, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Character, CharacterRelationship } from '../types'
import { useBookStore } from '../store/bookStore'

interface Props {
  initial?: Character
  bookId: string
  onClose: () => void
}

type Tab = 'physical' | 'personality' | 'traits' | 'role' | 'gallery'

const TABS: { id: Tab; label: string; subtitle: string }[] = [
  { id: 'physical', label: 'Physical', subtitle: 'The Exterior' },
  { id: 'personality', label: 'Personality', subtitle: 'The Internal Engine' },
  { id: 'traits', label: 'Traits & Voice', subtitle: 'The Persona' },
  { id: 'role', label: 'Story Role', subtitle: 'Role & Connections' },
  { id: 'gallery', label: 'Gallery', subtitle: 'Reference Images' }
]

// ─── Shared field components ──────────────────────────────────────────────────

function FieldBlock({
  label,
  helper,
  value,
  onChange,
  rows = 3,
  placeholder
}: {
  label: string
  helper: string
  value: string
  onChange: (v: string) => void
  rows?: number
  placeholder?: string
}): React.JSX.Element {
  return (
    <div>
      <label className="block text-sm font-semibold text-[var(--fg)] mb-0.5">{label}</label>
      <p className="text-xs text-[var(--fg-faint)] mb-2 leading-relaxed">{helper}</p>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] text-sm text-[var(--fg)] placeholder-[var(--fg-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--accent)] resize-none leading-relaxed"
      />
    </div>
  )
}

function ColorField({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (v: string) => void
}): React.JSX.Element {
  return (
    <div>
      <label className="block text-xs font-semibold text-[var(--fg)] mb-1.5">{label}</label>
      <div className="flex items-center gap-2.5">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-9 h-9 rounded-[10px] border border-[var(--border)] cursor-pointer p-0.5 bg-[var(--bg-card)] flex-shrink-0"
        />
        <span className="text-xs text-[var(--fg-muted)] font-mono">{value.toUpperCase()}</span>
      </div>
    </div>
  )
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = 'text'
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}): React.JSX.Element {
  return (
    <div>
      <label className="block text-xs font-semibold text-[var(--fg)] mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] text-sm text-[var(--fg)] placeholder-[var(--fg-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--accent)]"
      />
    </div>
  )
}

function SelectInput({
  label,
  helper,
  value,
  onChange,
  options
}: {
  label: string
  helper?: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}): React.JSX.Element {
  return (
    <div>
      <label className="block text-sm font-semibold text-[var(--fg)] mb-0.5">{label}</label>
      {helper && <p className="text-xs text-[var(--fg-faint)] mb-2 leading-relaxed">{helper}</p>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] text-sm text-[var(--fg)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--accent)]"
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// ─── CharacterForm ────────────────────────────────────────────────────────────

export default function CharacterForm({ initial, bookId, onClose }: Props): React.JSX.Element {
  const { saveCharacter, characters, currentBook } = useBookStore()

  const autoSave = currentBook?.style?.autoSave ?? true

  const [activeTab, setActiveTab] = useState<Tab>('physical')
  const [saving, setSaving] = useState(false)
  const [autoSaved, setAutoSaved] = useState(false)
  const charId = useRef(initial?.id ?? uuidv4())
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Tab 1 — Physical
  const [name, setName] = useState(initial?.name ?? '')
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(initial?.photoDataUrl)
  const [photoPath, setPhotoPath] = useState<string | undefined>(initial?.photoPath)
  const [age, setAge] = useState(initial?.age ?? '')
  const [gender, setGender] = useState(initial?.gender ?? '')
  const [hairColor, setHairColor] = useState(initial?.hairColor ?? '#3b2314')
  const [eyeColor, setEyeColor] = useState(initial?.eyeColor ?? '#4a3728')
  const [skinColor, setSkinColor] = useState(initial?.skinColor ?? '#f5cba7')
  const [build, setBuild] = useState(initial?.build ?? '')

  // Tab 2 — Personality
  const [ghost, setGhost] = useState(initial?.ghost ?? '')
  const [lie, setLie] = useState(initial?.lie ?? '')
  const [truth, setTruth] = useState(initial?.truth ?? '')
  const [motivation, setMotivation] = useState(initial?.motivation ?? '')
  const [stakes, setStakes] = useState(initial?.stakes ?? '')

  // Tab 3 — Traits & Voice
  const [voiceProfile, setVoiceProfile] = useState(initial?.voiceProfile ?? '')
  const [mannerisms, setMannerisms] = useState(initial?.mannerisms ?? '')
  const [behaviour, setBehaviour] = useState(initial?.behaviour ?? '')

  // Tab 4 — Story Role & Connections
  const [role, setRole] = useState(initial?.role ?? '')
  const [arcType, setArcType] = useState(initial?.arcType ?? '')
  const [relationships, setRelationships] = useState<CharacterRelationship[]>(
    initial?.relationships ?? []
  )

  // Tab 5 — Gallery
  const [galleryPaths, setGalleryPaths] = useState<string[]>(initial?.galleryPaths ?? [])
  const [galleryDataUrls, setGalleryDataUrls] = useState<string[]>(
    initial?.galleryDataUrls ?? []
  )
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0)

  // Other characters in this book (for relationships dropdown)
  const otherCharacters = characters.filter((c) => c.id !== initial?.id)

  // ── Photo / Gallery handlers ──────────────────────────────────────────────

  const addGalleryImage = async (): Promise<void> => {
    const dataUrl = await window.electron.image.openDialog()
    if (!dataUrl) return
    const ext = dataUrl.split(';')[0].split('/')[1] ?? 'jpg'
    const filename = await window.electron.image.save(bookId, 'character-gallery', dataUrl, ext)
    setGalleryPaths((prev) => [...prev, filename])
    setGalleryDataUrls((prev) => [...prev, dataUrl])
  }

  // Upload from Physical tab — also jumps carousel to the new image
  const addGalleryImageAndJump = async (): Promise<void> => {
    const jumpTo = galleryDataUrls.length // pre-add length = post-add last index
    const dataUrl = await window.electron.image.openDialog()
    if (!dataUrl) return
    const ext = dataUrl.split(';')[0].split('/')[1] ?? 'jpg'
    const filename = await window.electron.image.save(bookId, 'character-gallery', dataUrl, ext)
    setGalleryPaths((prev) => [...prev, filename])
    setGalleryDataUrls((prev) => [...prev, dataUrl])
    setCurrentPhotoIndex(jumpTo)
  }

  const removeGalleryImage = (index: number): void => {
    setGalleryPaths((prev) => prev.filter((_, i) => i !== index))
    setGalleryDataUrls((prev) => prev.filter((_, i) => i !== index))
  }

  // Save selected carousel image as the character profile photo
  const setAsDefault = async (): Promise<void> => {
    if (galleryDataUrls.length === 0) return
    const dataUrl = galleryDataUrls[currentPhotoIndex]
    const ext = dataUrl.split(';')[0].split('/')[1] ?? 'jpg'
    const filename = await window.electron.image.save(bookId, 'character', dataUrl, ext)
    setPhotoDataUrl(dataUrl)
    setPhotoPath(filename)
  }

  // Remove current carousel image; also clears profile photo if it was the default
  const removeCurrentImage = (): void => {
    const removedDataUrl = galleryDataUrls[currentPhotoIndex]
    if (removedDataUrl === photoDataUrl) {
      setPhotoDataUrl(undefined)
      setPhotoPath(undefined)
    }
    removeGalleryImage(currentPhotoIndex)
    setCurrentPhotoIndex((prev) => Math.max(0, prev - 1))
  }

  // ── Relationship handlers ─────────────────────────────────────────────────

  const addRelationship = (): void => {
    setRelationships((prev) => [...prev, { charId: '', description: '' }])
  }

  const updateRelationship = (index: number, field: keyof CharacterRelationship, value: string): void => {
    setRelationships((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    )
  }

  const removeRelationship = (index: number): void => {
    setRelationships((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  const persistCharacter = async (): Promise<void> => {
    if (!name.trim()) return
    setSaving(true)
    await saveCharacter({
      id: charId.current,
      bookId,
      name: name.trim(),
      photoPath,
      photoDataUrl,
      age,
      gender,
      hairColor,
      eyeColor,
      skinColor,
      build,
      ghost,
      lie,
      truth,
      motivation,
      stakes,
      voiceProfile,
      mannerisms,
      behaviour,
      role,
      arcType,
      relationships: relationships.filter((r) => r.charId),
      galleryPaths,
      galleryDataUrls,
      createdAt: initial?.createdAt ?? new Date().toISOString()
    })
    setSaving(false)
    setAutoSaved(true)
    setTimeout(() => setAutoSaved(false), 1500)
  }

  const handleSave = async (): Promise<void> => {
    await persistCharacter()
    onClose()
  }

  // ── Auto-save effect (1 s debounce) ───────────────────────────────────────

  useEffect(() => {
    if (!autoSave || !name.trim()) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => { persistCharacter() }, 1000)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  }, [name, age, gender, hairColor, eyeColor, skinColor, build,
      ghost, lie, truth, motivation, stakes,
      voiceProfile, mannerisms, behaviour,
      role, arcType, relationships,
      photoPath, photoDataUrl, galleryPaths, galleryDataUrls, autoSave])

  // ── Tab content ───────────────────────────────────────────────────────────

  const renderPhysical = (): React.JSX.Element => (
    <div className="space-y-6">
      <div>
        <label className="block text-xs font-semibold text-[var(--fg)] mb-1.5">
          Character Name <span className="text-[var(--accent)]">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          className="w-full px-3 py-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] text-[var(--fg)] placeholder-[var(--fg-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--accent)] text-sm"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Age" value={age} onChange={setAge} placeholder="e.g. 34" />
        <TextInput label="Gender" value={gender} onChange={setGender} placeholder="e.g. Female" />
      </div>
      <div>
        <p className="text-[11px] font-semibold text-[var(--fg-faint)] uppercase tracking-widerr mb-3">
          Colour Profile
        </p>
        <div className="grid grid-cols-3 gap-4">
          <ColorField label="Hair Colour" value={hairColor} onChange={setHairColor} />
          <ColorField label="Eye Colour" value={eyeColor} onChange={setEyeColor} />
          <ColorField label="Skin Colour" value={skinColor} onChange={setSkinColor} />
        </div>
      </div>
      <FieldBlock
        label="Build"
        helper="Physical stature: Describe their frame (e.g., Athletic, Lanky, Petite, Stocky)."
        value={build}
        onChange={setBuild}
        rows={2}
        placeholder="Describe their physical frame…"
      />
    </div>
  )

  const renderPersonality = (): React.JSX.Element => (
    <div className="space-y-6">
      <FieldBlock
        label="The Ghost"
        helper="The past wound: A traumatic event from the backstory that haunts their present decisions."
        value={ghost}
        onChange={setGhost}
        placeholder="What happened to them in the past that still shapes who they are today?"
      />
      <FieldBlock
        label="The Lie"
        helper='The false belief: A flawed philosophy the character believes about themselves or the world (e.g., "Vulnerability is weakness").'
        value={lie}
        onChange={setLie}
        placeholder="What false truth do they cling to?"
      />
      <FieldBlock
        label="The Truth"
        helper="The lesson: The realization the character must reach to grow and overcome their Lie by the end of the story."
        value={truth}
        onChange={setTruth}
        placeholder="What do they need to learn to grow?"
      />
      <FieldBlock
        label="Motivation"
        helper="The driving force: What does this character want more than anything else in this book?"
        value={motivation}
        onChange={setMotivation}
        placeholder="What is their deepest desire or goal?"
      />
      <FieldBlock
        label="The Stakes"
        helper="The cost of failure: What specific disaster happens if the character fails to achieve their goal?"
        value={stakes}
        onChange={setStakes}
        placeholder="What do they stand to lose?"
      />
    </div>
  )

  const renderTraits = (): React.JSX.Element => (
    <div className="space-y-6">
      <FieldBlock
        label="Voice Profile"
        helper="Speech pattern: How do they sound? Consider their vocabulary, accent, rhythm, or common slang (useful for dictation consistency)."
        value={voiceProfile}
        onChange={setVoiceProfile}
        placeholder="Describe how they speak…"
      />
      <FieldBlock
        label="Mannerisms"
        helper="Physical tics: Small habits like tapping a foot, avoiding eye contact, or smoothing their hair when stressed."
        value={mannerisms}
        onChange={setMannerisms}
        placeholder="What are their recurring physical habits?"
      />
      <FieldBlock
        label="Behaviour"
        helper="Social mask: How they generally present themselves to the world (e.g., Guarded, Over-eager, Arrogant)."
        value={behaviour}
        onChange={setBehaviour}
        placeholder="How do they come across to strangers?"
      />
    </div>
  )

  const renderStoryRole = (): React.JSX.Element => (
    <div className="space-y-6">
      <SelectInput
        label="Role"
        value={role}
        onChange={setRole}
        options={[
          { value: 'Protagonist', label: 'Protagonist' },
          { value: 'Antagonist', label: 'Antagonist' },
          { value: 'Sidekick', label: 'Sidekick' },
          { value: 'Mentor', label: 'Mentor' },
          { value: 'Foil', label: 'Foil' }
        ]}
      />

      <SelectInput
        label="Arc Type"
        helper="The journey: Positive (growth), Negative (corruption/tragedy), or Flat (the character changes the world around them)."
        value={arcType}
        onChange={setArcType}
        options={[
          { value: 'Positive', label: 'Positive — growth arc' },
          { value: 'Negative', label: 'Negative — corruption / tragedy arc' },
          { value: 'Flat', label: 'Flat — the character changes the world around them' }
        ]}
      />

      {/* Relationships */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <label className="block text-sm font-semibold text-[var(--fg)]">Relationships</label>
            <p className="text-xs text-[var(--fg-faint)] mt-0.5 leading-relaxed">
              Connections: Link this character to others in the book with a description of their relationship.
            </p>
          </div>
          <button
            onClick={addRelationship}
            className="flex-shrink-0 ml-4 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--bg-subtle)] text-[var(--fg-muted)] text-xs font-medium hover:bg-[#e7e0d8] transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
            Add
          </button>
        </div>

        {relationships.length === 0 ? (
          <div className="py-6 text-center rounded-xl border border-dashed border-[var(--border)] text-xs text-[var(--fg-faint)]">
            No relationships added yet.{' '}
            {otherCharacters.length === 0
              ? 'Create more characters to link them.'
              : 'Click Add to connect this character to others.'}
          </div>
        ) : (
          <div className="space-y-2">
            {relationships.map((rel, i) => (
              <div key={i} className="flex gap-2 items-start">
                <select
                  value={rel.charId}
                  onChange={(e) => updateRelationship(i, 'charId', e.target.value)}
                  className="flex-shrink-0 w-40 px-2.5 py-2 rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] text-xs text-[var(--fg)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--accent)]"
                >
                  <option value="">Select character…</option>
                  {otherCharacters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={rel.description}
                  onChange={(e) => updateRelationship(i, 'description', e.target.value)}
                  placeholder='e.g. "is the sibling of"'
                  className="flex-1 px-2.5 py-2 rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] text-xs text-[var(--fg)] placeholder-[var(--fg-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:border-[var(--accent)]"
                />
                <button
                  onClick={() => removeRelationship(i)}
                  className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-[var(--fg-faint)] hover:text-red-400 hover:bg-red-50 transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  const renderGallery = (): React.JSX.Element => (
    <div>
      <p className="text-xs text-[var(--fg-faint)] mb-4 leading-relaxed">
        Upload reference images for this character — clothing, concept art, or inspirational
        aesthetic photos.
      </p>
      <div className="grid grid-cols-4 gap-3">
        {galleryDataUrls.map((url, i) => (
          <div key={i} className="group relative aspect-square rounded-xl overflow-hidden bg-[var(--bg-subtle)]">
            <img src={url} alt={`Gallery ${i + 1}`} className="w-full h-full object-cover" />
            <button
              onClick={() => removeGalleryImage(i)}
              className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded-full bg-white/80 backdrop-blur text-[var(--fg-muted)] hover:text-red-500 shadow-sm transition-all"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        ))}
        {/* Add image tile */}
        <button
          onClick={addGalleryImage}
          className="aspect-square rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--bg)] flex flex-col items-center justify-center hover:border-[var(--accent)] hover:bg-[var(--bg-amber)]/30 transition-all text-[var(--fg-faint)] hover:text-[var(--accent)]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
          <span className="text-xs mt-1">Add Image</span>
        </button>
      </div>
    </div>
  )

  const tabContent: Record<Tab, () => React.JSX.Element> = {
    physical: renderPhysical,
    personality: renderPersonality,
    traits: renderTraits,
    role: renderStoryRole,
    gallery: renderGallery
  }

  // Derived values for the photo panel (used in the persistent right panel)
  const hasImages = galleryDataUrls.length > 0
  const isDefault = hasImages && galleryDataUrls[currentPhotoIndex] === photoDataUrl
  const canGoLeft = currentPhotoIndex > 0
  const canGoRight = currentPhotoIndex < galleryDataUrls.length - 1

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--bg-card)]">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back
        </button>
        <h2 className="font-semibold text-[var(--fg)] text-base">
          {initial ? 'Edit Character' : 'New Character'}
        </h2>
        <div className="flex items-center gap-2.5">
          {/* Saved flash */}
          <span
            className="text-[11px] font-medium text-[var(--color-success)] pointer-events-none transition-opacity duration-300"
            style={{ opacity: autoSaved ? 1 : 0 }}
          >
            Saved
          </span>
          {/* Save always active — gives user the "I pressed save" feeling */}
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="px-4 py-2 rounded-[10px] bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── Body: left panel (tabs) + right panel (photos) ────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left panel — 3/4: tab bar + scrollable content */}
        <div className="flex flex-col flex-1 min-w-0 border-r border-[var(--border)]">
          {/* Tab bar */}
          <div className="flex-shrink-0 flex border-b border-[var(--border)] bg-[var(--bg-card)] overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center px-5 py-3 border-b-2 transition-colors flex-shrink-0 ${
                  activeTab === tab.id
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-transparent text-[var(--fg-muted)] hover:text-[var(--fg)]'
                }`}
              >
                <span className="text-sm font-semibold">{tab.label}</span>
                <span className="text-[10px] mt-0.5 opacity-70">{tab.subtitle}</span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-6">
            {tabContent[activeTab]()}
          </div>
        </div>

        {/* Right panel — 1/3: persistent photo carousel */}
        <div className="w-[400px] flex-shrink-0 flex flex-col gap-4 p-5 bg-[var(--bg-card)] overflow-y-auto">
          <p className="text-xs font-semibold text-[var(--fg-faint)] uppercase tracking-wide">Photos</p>

          {/* Image area */}
          <div className="relative rounded-xl overflow-hidden bg-[var(--bg-subtle)] border border-[var(--border)] flex items-center justify-center" style={{ aspectRatio: '3/4' }}>
            {hasImages ? (
              <>
                <img
                  src={galleryDataUrls[currentPhotoIndex]}
                  alt="Character"
                  className="w-full h-full object-cover"
                />

                {/* Default badge */}
                {isDefault && (
                  <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--accent)] text-white text-[10px] font-semibold shadow">
                    ★ Default
                  </div>
                )}

                {/* Left arrow */}
                {galleryDataUrls.length > 1 && (
                  <button
                    onClick={() => setCurrentPhotoIndex((p) => p - 1)}
                    disabled={!canGoLeft}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm shadow text-[var(--fg)] hover:bg-[var(--bg-card)] disabled:opacity-30 transition-all"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                  </button>
                )}

                {/* Right arrow */}
                {galleryDataUrls.length > 1 && (
                  <button
                    onClick={() => setCurrentPhotoIndex((p) => p + 1)}
                    disabled={!canGoRight}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm shadow text-[var(--fg)] hover:bg-[var(--bg-card)] disabled:opacity-30 transition-all"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                  </button>
                )}

                {/* Counter */}
                {galleryDataUrls.length > 1 && (
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-black/40 text-white text-[10px] font-medium backdrop-blur-sm">
                    {currentPhotoIndex + 1} / {galleryDataUrls.length}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 text-[var(--fg-faint)] py-10">
                <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                  <circle cx="9" cy="9" r="2"/>
                  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                </svg>
                <p className="text-xs">No photos yet</p>
              </div>
            )}
          </div>

          {/* Upload */}
          <button
            onClick={addGalleryImageAndJump}
            className="w-full py-2 rounded-[10px] border border-[var(--border)] bg-[var(--bg-card)] text-sm font-medium text-[var(--fg)] hover:bg-[var(--bg-subtle)] transition-colors flex items-center justify-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            Upload Photo
          </button>

          {/* Set as Default */}
          <button
            onClick={setAsDefault}
            disabled={!hasImages || isDefault}
            className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
              isDefault
                ? 'bg-[var(--accent)] text-white cursor-default'
                : 'border border-[var(--border)] bg-[var(--bg-card)] text-[var(--fg)] hover:bg-[var(--bg-subtle)] disabled:opacity-40'
            }`}
          >
            {isDefault ? '★ Default Photo' : 'Set as Default'}
          </button>

          {/* Remove */}
          <button
            onClick={removeCurrentImage}
            disabled={!hasImages}
            className="w-full py-2 rounded-lg border border-red-200 bg-[var(--bg-card)] text-sm font-medium text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors"
          >
            Remove Photo
          </button>
        </div>
      </div>
    </div>
  )
}
