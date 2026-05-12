'use client';
import { useState, useMemo, useRef, useEffect } from 'react';
import { siIcons, siBySlug, emojiCategories, toSimpleIconValue, toCustomSvgValue, retroBrandSlugs } from '../lib/icons';
import type { SimpleIcon, EmojiEntry } from '../lib/icons';

interface Props {
  value: string | null;
  onChange: (value: string) => void;
  onClose: () => void;
}

export default function IconPicker({ value, onChange, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [svgInput, setSvgInput] = useState('');
  const [svgError, setSvgError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const q = search.toLowerCase().trim();

  const filteredSi = useMemo<SimpleIcon[]>(() => {
    if (!q) return siIcons;
    return siIcons.filter(icon =>
      icon.title.toLowerCase().includes(q) || icon.slug.includes(q)
    );
  }, [q]);

  const filteredEmojiFlat = useMemo<EmojiEntry[]>(() => {
    if (!q) return [];
    const results: EmojiEntry[] = [];
    emojiCategories.forEach(cat => {
      cat.emojis.forEach(e => {
        if (
          e.name.toLowerCase().includes(q) ||
          e.id.includes(q) ||
          e.keywords.some(k => k.includes(q))
        ) {
          results.push(e);
        }
      });
    });
    return results;
  }, [q]);

  function select(val: string) {
    onChange(val);
    onClose();
  }

  function applyCustomSvg() {
    const trimmed = svgInput.trim();
    if (!trimmed.toLowerCase().includes('<svg')) {
      setSvgError('Paste a valid SVG file (must contain an <svg> element).');
      return;
    }
    select(toCustomSvgValue(trimmed));
  }

  const retroIcons = useMemo<SimpleIcon[]>(() =>
    retroBrandSlugs.map(s => siBySlug.get(s)).filter((i): i is SimpleIcon => i !== undefined),
  []);

  const isSearching = q.length > 0;
  const noResults = isSearching && filteredSi.length === 0 && filteredEmojiFlat.length === 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '80vh' }}>

        {/* Search bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 shrink-0">
          <input
            ref={inputRef}
            className="input flex-1"
            placeholder="Search brand icons and emoji…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Custom SVG paste */}
        <div className="px-4 py-3 border-b border-gray-100 shrink-0">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">Paste custom SVG</p>
          <div className="flex gap-2 items-start">
            <textarea
              className="input flex-1 text-xs font-mono resize-none"
              rows={2}
              placeholder="<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; viewBox=&quot;…&quot;>…</svg>"
              value={svgInput}
              onChange={e => { setSvgInput(e.target.value); setSvgError(''); }}
            />
            <button
              type="button"
              onClick={applyCustomSvg}
              disabled={!svgInput.trim()}
              className="btn-primary shrink-0 disabled:opacity-40"
            >
              Use
            </button>
          </div>
          {svgError && <p className="text-xs text-red-500 mt-1">{svgError}</p>}
        </div>

        {/* Grid */}
        <div className="overflow-y-auto flex-1 p-4 space-y-6">
          {noResults ? (
            <p className="text-sm text-gray-400 text-center py-8">No results for &ldquo;{search}&rdquo;</p>
          ) : isSearching ? (
            <>
              {filteredSi.length > 0 && (
                <Section label={`Brands (${filteredSi.length})`}>
                  {filteredSi.map(icon => (
                    <SiTile key={icon.slug} icon={icon} selected={value === toSimpleIconValue(icon.slug)} onSelect={() => select(toSimpleIconValue(icon.slug))} />
                  ))}
                </Section>
              )}
              {filteredEmojiFlat.length > 0 && (
                <Section label={`Emoji (${filteredEmojiFlat.length})`}>
                  {filteredEmojiFlat.map(e => (
                    <EmojiTile key={e.id} emoji={e} selected={value === e.native} onSelect={() => select(e.native)} />
                  ))}
                </Section>
              )}
            </>
          ) : (
            <>
              {retroIcons.length > 0 && (
                <Section label="Retro & Vintage">
                  {retroIcons.map(icon => (
                    <SiTile key={icon.slug} icon={icon} selected={value === toSimpleIconValue(icon.slug)} onSelect={() => select(toSimpleIconValue(icon.slug))} />
                  ))}
                </Section>
              )}
              <Section label={`All Brands (${siIcons.length})`}>
                {siIcons.map(icon => (
                  <SiTile key={icon.slug} icon={icon} selected={value === toSimpleIconValue(icon.slug)} onSelect={() => select(toSimpleIconValue(icon.slug))} />
                ))}
              </Section>
              {emojiCategories.map(cat => (
                <Section key={cat.id} label={cat.label}>
                  {cat.emojis.map(e => (
                    <EmojiTile key={e.id} emoji={e} selected={value === e.native} onSelect={() => select(e.native)} />
                  ))}
                </Section>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{label}</h3>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function SiTile({ icon, selected, onSelect }: { icon: SimpleIcon; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      title={icon.title}
      onClick={onSelect}
      className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors hover:bg-gray-100 ${
        selected ? 'ring-2 ring-blue-500 bg-blue-50' : ''
      }`}
    >
      <svg viewBox="0 0 24 24" width={18} height={18} fill={`#${icon.hex}`}>
        <path d={icon.path} />
      </svg>
    </button>
  );
}

function EmojiTile({ emoji, selected, onSelect }: { emoji: EmojiEntry; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      title={emoji.name}
      onClick={onSelect}
      className={`w-9 h-9 flex items-center justify-center rounded-lg text-xl leading-none transition-colors hover:bg-gray-100 ${
        selected ? 'ring-2 ring-blue-500 bg-blue-50' : ''
      }`}
    >
      {emoji.native}
    </button>
  );
}
