import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { publicAssetUrl } from '../../utils/publicAssetUrl';
import { useMessageStore } from '../../stores/messageStore';
import { useReplyDraftStore } from '../../stores/replyDraftStore';
import { usePresenceStore } from '../../stores/presenceStore';
import { useHubStore } from '../../stores/hubStore';
import { useEmojiStore } from '../../stores/emojiStore';
import { useMediaPickerStore } from '../../stores/mediaPickerStore';
import MediaPicker from '../media/MediaPicker';
import type { EmojiSelection } from '../media/EmojiTab';
import { EMOJI_AUTOCOMPLETE_LIST } from '../../utils/emojiNames';
import { api } from '../../api/client';
import type { Attachment, HubSticker, User } from '../../types';
import { getReplyAuthorLabel, getReplyPreviewMeta } from '../../utils/replyPreview';

const TYPING_THROTTLE_MS = 500;
const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB

function inferClipboardFileExtension(contentType: string): string {
  const subtype = contentType.split('/')[1] ?? 'bin';
  const normalized = subtype.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'bin';
}

function normalizeIncomingFile(file: File): File {
  if (file.name.trim()) {
    return file;
  }

  return new File(
    [file],
    `pasted-file-${Date.now()}.${inferClipboardFileExtension(file.type)}`,
    {
      type: file.type || 'application/octet-stream',
      lastModified: file.lastModified || Date.now(),
    },
  );
}

interface PendingFile {
  file: File;
  preview?: string;
  uploading: boolean;
  attachment?: Attachment;
  error?: string;
}

interface MessageInputProps {
  streamName: string;
  onTyping?: () => void;
  onTypingStop?: () => void;
  isDMMode?: boolean;
  onSendDM?: (content: string, attachmentIds?: string[], replyToMessageId?: string) => Promise<void>;
  /** When this changes (channel / DM switch), reply draft is cleared. */
  replyScopeKey?: string;
}

export default function MessageInput({
  streamName,
  onTyping,
  onTypingStop,
  isDMMode,
  onSendDM,
  replyScopeKey = '',
}: MessageInputProps) {
  const [content, setContent] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const sendMessage = useMessageStore((s) => s.sendMessage);
  const replyTo = useReplyDraftStore((s) => s.replyTo);
  const setReplyTo = useReplyDraftStore((s) => s.setReplyTo);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastTypingRef = useRef(0);
  const hubMembers = usePresenceStore((s) => s.hubMembers);
  const activeHubId = useHubStore((s) => s.activeHubId);

  // Media picker store
  const mediaPickerOpen = useMediaPickerStore((s) => s.isOpen);
  const toggleMediaPicker = useMediaPickerStore((s) => s.toggle);
  const closeMediaPicker = useMediaPickerStore((s) => s.close);
  const trackEmojiUsage = useMediaPickerStore((s) => s.trackEmojiUsage);

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionStartRef = useRef<number | null>(null);

  // :emoji: autocomplete state
  const [emojiQuery, setEmojiQuery] = useState<string | null>(null);
  const [emojiIndex, setEmojiIndex] = useState(0);
  const emojiStartRef = useRef<number | null>(null);
  const hubEmojis = useEmojiStore((s) => (activeHubId ? s.hubEmojis[activeHubId] : undefined));

  const memberList = useMemo<User[]>(
    () => Object.values(hubMembers),
    [hubMembers],
  );

  const mentionResults = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return memberList
      .filter((u) => u.username.toLowerCase().startsWith(q) || u.display_name.toLowerCase().startsWith(q))
      .slice(0, 8);
  }, [mentionQuery, memberList]);

  const emojiResults = useMemo(() => {
    if (emojiQuery === null || emojiQuery.length < 1) return [];
    const q = emojiQuery.toLowerCase();
    const results: { name: string; emoji: string; emojiId?: string; fileUrl?: string; isCustom: boolean }[] = [];

    // Custom hub emojis first
    if (hubEmojis) {
      for (const e of hubEmojis) {
        if (e.name.toLowerCase().startsWith(q)) {
          results.push({ name: e.name, emoji: `:${e.name}:`, emojiId: e.id, fileUrl: e.file_url, isCustom: true });
        }
        if (results.length >= 10) break;
      }
    }

    // Then unicode emojis
    if (results.length < 10) {
      for (const entry of EMOJI_AUTOCOMPLETE_LIST) {
        if (entry.name.startsWith(q)) {
          // Avoid duplicate unicode chars
          if (!results.some((r) => r.emoji === entry.emoji)) {
            results.push({ name: entry.name, emoji: entry.emoji, isCustom: false });
          }
        }
        if (results.length >= 10) break;
      }
    }

    return results;
  }, [emojiQuery, hubEmojis]);
  const replyAuthorLabel = useMemo(() => getReplyAuthorLabel(replyTo ?? undefined), [replyTo]);
  const replyPreview = useMemo(() => getReplyPreviewMeta(replyTo ?? undefined), [replyTo]);

  useEffect(() => {
    setReplyTo(null);
  }, [replyScopeKey, setReplyTo]);

  useEffect(() => {
    const handler = (e: Event) => {
      const username = (e as CustomEvent<string>).detail;
      if (username) {
        setContent((prev) => {
          const mention = `@${username} `;
          return prev.endsWith(' ') || prev === '' ? prev + mention : prev + ' ' + mention;
        });
        textareaRef.current?.focus();
      }
    };
    document.addEventListener('insert-mention', handler);
    return () => document.removeEventListener('insert-mention', handler);
  }, []);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const newFiles: PendingFile[] = [];
    for (const rawFile of Array.from(files)) {
      const file = normalizeIncomingFile(rawFile);
      if (file.size > MAX_FILE_SIZE) {
        newFiles.push({ file, uploading: false, error: 'File too large (max 2 GB)' });
        continue;
      }
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      newFiles.push({ file, preview, uploading: true });
    }
    setPendingFiles((prev) => [...prev, ...newFiles]);

    // Upload each file
    for (let i = 0; i < newFiles.length; i++) {
      const pf = newFiles[i];
      if (pf.error) continue;
      try {
        const attachment = await api.uploadFile(pf.file);
        setPendingFiles((prev) =>
          prev.map((f) => (f.file === pf.file ? { ...f, uploading: false, attachment } : f))
        );
      } catch {
        setPendingFiles((prev) =>
          prev.map((f) => (f.file === pf.file ? { ...f, uploading: false, error: 'Upload failed' } : f))
        );
      }
    }
  }, []);

  const removeFile = useCallback((file: File) => {
    setPendingFiles((prev) => {
      const removed = prev.find((f) => f.file === file);
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((f) => f.file !== file);
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = content.trim();
    const readyAttachments = pendingFiles.filter((f) => f.attachment).map((f) => f.attachment!);
    if (!trimmed && readyAttachments.length === 0) return;
    const replyToMessageId = replyTo?.id;

    // Revoke any object URLs to prevent memory leaks
    for (const pf of pendingFiles) {
      if (pf.preview) URL.revokeObjectURL(pf.preview);
    }

    setContent('');
    setPendingFiles([]);
    closeMediaPicker();
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    onTypingStop?.();
    lastTypingRef.current = 0;

    const attachmentIds = readyAttachments.map((a) => a.id);
    if (isDMMode && onSendDM) {
      await onSendDM(trimmed, attachmentIds.length > 0 ? attachmentIds : undefined, replyToMessageId);
    } else {
      await sendMessage(trimmed, attachmentIds.length > 0 ? attachmentIds : undefined, replyToMessageId);
    }
    setReplyTo(null);
  }, [content, pendingFiles, sendMessage, onTypingStop, isDMMode, onSendDM, replyTo, setReplyTo]);

  const insertMention = useCallback((username: string) => {
    const start = mentionStartRef.current;
    if (start === null) return;
    const before = content.slice(0, start);
    const textarea = textareaRef.current;
    const cursorPos = textarea?.selectionStart ?? content.length;
    const after = content.slice(cursorPos);
    const inserted = `@${username} `;
    setContent(before + inserted + after);
    setMentionQuery(null);
    mentionStartRef.current = null;
    // Restore focus & cursor
    requestAnimationFrame(() => {
      if (textarea) {
        textarea.focus();
        const pos = before.length + inserted.length;
        textarea.setSelectionRange(pos, pos);
      }
    });
  }, [content]);

  const insertEmojiAutocomplete = useCallback((result: { name: string; emoji: string; isCustom: boolean }) => {
    const start = emojiStartRef.current;
    if (start === null) return;
    const before = content.slice(0, start);
    const textarea = textareaRef.current;
    const cursorPos = textarea?.selectionStart ?? content.length;
    const after = content.slice(cursorPos);
    // For custom emojis insert :name:, for unicode insert the character directly
    const inserted = result.isCustom ? result.emoji + ' ' : result.emoji + ' ';
    setContent(before + inserted + after);
    setEmojiQuery(null);
    emojiStartRef.current = null;
    requestAnimationFrame(() => {
      if (textarea) {
        textarea.focus();
        const pos = before.length + inserted.length;
        textarea.setSelectionRange(pos, pos);
      }
    });
  }, [content]);

  const handleEmojiSelect = useCallback((sel: EmojiSelection) => {
    const insert = sel.emojiId ? sel.emoji : sel.emoji;
    setContent((prev) => {
      const textarea = textareaRef.current;
      const cursorPos = textarea?.selectionStart ?? prev.length;
      const before = prev.slice(0, cursorPos);
      const after = prev.slice(cursorPos);
      return before + insert + after;
    });
    trackEmojiUsage(sel.emoji, sel.emojiId, sel.fileUrl);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [trackEmojiUsage]);

  const handleGifSelect = useCallback(async (url: string, _previewUrl: string, _width?: number, _height?: number) => {
    closeMediaPicker();
    const replyToMessageId = replyTo?.id;
    if (isDMMode && onSendDM) {
      await onSendDM(url, undefined, replyToMessageId);
    } else {
      await sendMessage(url, undefined, replyToMessageId);
    }
    setReplyTo(null);
  }, [closeMediaPicker, isDMMode, onSendDM, replyTo?.id, sendMessage, setReplyTo]);

  const handleStickerSelect = useCallback(async (sticker: HubSticker) => {
    closeMediaPicker();
    const stickerUrl = publicAssetUrl(sticker.file_url);
    const replyToMessageId = replyTo?.id;
    if (isDMMode && onSendDM) {
      await onSendDM(stickerUrl, undefined, replyToMessageId);
    } else {
      await sendMessage(stickerUrl, undefined, replyToMessageId);
    }
    setReplyTo(null);
  }, [closeMediaPicker, isDMMode, onSendDM, replyTo?.id, sendMessage, setReplyTo]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Mention autocomplete navigation
    if (mentionQuery !== null && mentionResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionResults.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + mentionResults.length) % mentionResults.length);
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        insertMention(mentionResults[mentionIndex].username);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        mentionStartRef.current = null;
        return;
      }
    }
    // Emoji autocomplete navigation
    if (emojiQuery !== null && emojiResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setEmojiIndex((i) => (i + 1) % emojiResults.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setEmojiIndex((i) => (i - 1 + emojiResults.length) % emojiResults.length);
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        insertEmojiAutocomplete(emojiResults[emojiIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setEmojiQuery(null);
        emojiStartRef.current = null;
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    handleInput();

    // Detect @mention query
    const cursorPos = e.target.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursorPos);
    const atMatch = textBefore.match(/@([\w.\-]*)$/);
    if (atMatch) {
      mentionStartRef.current = cursorPos - atMatch[0].length;
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
    } else {
      mentionStartRef.current = null;
      setMentionQuery(null);
    }

    // Detect :emoji query (must be at least 1 char after the colon, and no space in the query)
    const colonMatch = textBefore.match(/(?:^|[\s]):([\w.\-+]*)$/);
    if (colonMatch && colonMatch[1].length >= 1) {
      emojiStartRef.current = cursorPos - colonMatch[1].length - 1; // include the ':'
      setEmojiQuery(colonMatch[1]);
      setEmojiIndex(0);
    } else {
      emojiStartRef.current = null;
      setEmojiQuery(null);
    }

    // Throttled typing event
    const now = Date.now();
    if (val.length > 0 && now - lastTypingRef.current > TYPING_THROTTLE_MS) {
      lastTypingRef.current = now;
      onTyping?.();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardFiles = Array.from(e.clipboardData.items ?? [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => file != null);

    if (clipboardFiles.length > 0) {
      void addFiles(clipboardFiles);
      return;
    }

    if (e.clipboardData.files.length > 0) {
      void addFiles(Array.from(e.clipboardData.files));
    }
  }, [addFiles]);

  return (
    <div
      className="px-4 pb-6 pt-1 flex-shrink-0"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragging && (
        <div className="mb-2 border-2 border-dashed border-riftapp-accent rounded-xl p-8 text-center text-sm text-riftapp-accent bg-riftapp-accent/5 animate-fade-in">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-2 opacity-70">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Drop files here to upload
        </div>
      )}

      {/* Pending file previews */}
      {pendingFiles.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap animate-slide-up">
          {pendingFiles.map((pf, i) => (
            <div
              key={i}
              className="relative bg-riftapp-content-elevated border border-riftapp-border/60 rounded-xl p-2.5 flex items-center gap-2.5 max-w-[220px] shadow-elevation-low group/file"
            >
              {pf.preview ? (
                <img src={pf.preview} alt="" className="w-12 h-12 rounded-lg object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-riftapp-bg flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-riftapp-text-dim">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                    <polyline points="13 2 13 9 20 9" />
                  </svg>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-riftapp-text truncate">{pf.file.name}</p>
                {pf.uploading && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="w-3 h-3 border border-riftapp-accent border-t-transparent rounded-full animate-spin" />
                    <p className="text-[10px] text-riftapp-accent">Uploading…</p>
                  </div>
                )}
                {pf.error && <p className="text-[10px] text-riftapp-danger mt-0.5">{pf.error}</p>}
                {pf.attachment && <p className="text-[10px] text-riftapp-success mt-0.5">Ready</p>}
              </div>
              <button
                onClick={() => removeFile(pf.file)}
                className="absolute -top-2 -right-2 w-6 h-6 bg-riftapp-panel border border-riftapp-border rounded-full flex items-center justify-center
                  text-riftapp-text-dim hover:text-white hover:bg-riftapp-danger hover:border-riftapp-danger transition-all duration-150
                  opacity-0 group-hover/file:opacity-100 shadow-elevation-low"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {replyTo && (
        <div className="mb-2 flex items-center gap-2 px-1 py-0.5 text-[12px] leading-4 text-riftapp-text-dim/85">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            <span className="max-w-[42%] shrink-0 truncate font-semibold text-riftapp-accent-hover">
              @{replyAuthorLabel}
            </span>
            <span className={`min-w-0 truncate ${replyPreview.tone === 'default' ? 'text-riftapp-text-dim' : 'text-riftapp-text-dim/75'}`}>
              {replyPreview.text}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            className="text-riftapp-text-dim hover:text-riftapp-text p-1 rounded-md hover:bg-riftapp-content-elevated flex-shrink-0"
            aria-label="Cancel reply"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}


      <div className={`rounded-xl border bg-riftapp-panel/95 shadow-[0_6px_18px_rgba(0,0,0,0.22)] flex items-end transition-all duration-200 relative ${
        dragging ? 'border-riftapp-accent shadow-glow' : 'border-riftapp-border/70 hover:border-riftapp-border-light'
      }`}>
        {/* Mention autocomplete dropdown */}
        {mentionQuery !== null && mentionResults.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1 bg-riftapp-panel border border-riftapp-border/60 rounded-xl shadow-elevation-high overflow-hidden z-50 animate-scale-in">
            <div className="px-3 py-1.5 text-[11px] font-semibold text-riftapp-text-dim uppercase tracking-wide">Members</div>
            {mentionResults.map((user, i) => (
              <button
                key={user.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(user.username);
                }}
                onMouseEnter={() => setMentionIndex(i)}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[14px] transition-colors ${
                  i === mentionIndex
                    ? 'bg-riftapp-accent/15 text-riftapp-text'
                    : 'text-riftapp-text-muted hover:bg-riftapp-content-elevated'
                }`}
              >
                {user.avatar_url ? (
                  <img src={publicAssetUrl(user.avatar_url)} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-riftapp-content-elevated flex items-center justify-center text-[10px] font-bold text-riftapp-text-dim flex-shrink-0">
                    {(user.display_name || user.username).slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span className="font-medium truncate">{user.display_name}</span>
                <span className="text-[12px] text-riftapp-text-dim ml-auto flex-shrink-0">@{user.username}</span>
              </button>
            ))}
          </div>
        )}
        {/* Emoji autocomplete dropdown */}
        {emojiQuery !== null && emojiResults.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1 bg-riftapp-panel border border-riftapp-border/60 rounded-xl shadow-elevation-high overflow-hidden z-50 animate-scale-in">
            <div className="px-3 py-1.5 text-[11px] font-semibold text-riftapp-text-dim uppercase tracking-wide">Emoji matching <span className="text-riftapp-accent">:{emojiQuery}</span></div>
            {emojiResults.map((result, i) => (
              <button
                key={result.emojiId || result.name}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertEmojiAutocomplete(result);
                }}
                onMouseEnter={() => setEmojiIndex(i)}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-[14px] transition-colors ${
                  i === emojiIndex
                    ? 'bg-riftapp-accent/15 text-riftapp-text'
                    : 'text-riftapp-text-muted hover:bg-riftapp-content-elevated'
                }`}
              >
                {result.isCustom && result.fileUrl ? (
                  <img src={publicAssetUrl(result.fileUrl)} alt={result.name} className="w-6 h-6 object-contain flex-shrink-0" />
                ) : (
                  <span className="w-6 h-6 flex items-center justify-center text-lg flex-shrink-0">{result.emoji}</span>
                )}
                <span className="font-medium truncate">:{result.name}:</span>
              </button>
            ))}
          </div>
        )}
        {/* File attach button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-3 py-3 text-riftapp-text-dim hover:text-riftapp-text active:scale-95 transition-all duration-150"
          title="Attach file"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        <textarea
          ref={textareaRef}
          data-riftapp-message-input
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={isDMMode ? `Message @${streamName}` : `Message #${streamName}`}
          rows={1}
          className="flex-1 px-1 py-3 bg-transparent text-[15px] text-riftapp-text placeholder:text-riftapp-text-dim/60 resize-none focus:outline-none max-h-[200px] leading-relaxed"
          maxLength={4000}
        />
        {/* Media buttons: GIF, Stickers, Emoji */}
        <div className="relative flex items-center">
          <button
            data-media-btn
            onClick={() => toggleMediaPicker('gifs')}
            className={`px-1.5 py-3 transition-all duration-150 active:scale-95 ${
              mediaPickerOpen && useMediaPickerStore.getState().activeTab === 'gifs'
                ? 'text-[#dbdee1]'
                : 'text-[#b5bac1] hover:text-[#dbdee1]'
            }`}
            title="GIFs"
            type="button"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <text x="12" y="15" textAnchor="middle" fill="currentColor" stroke="none" fontSize="8" fontWeight="bold" fontFamily="sans-serif">GIF</text>
            </svg>
          </button>
          <button
            data-media-btn
            onClick={() => toggleMediaPicker('stickers')}
            className={`px-1.5 py-3 transition-all duration-150 active:scale-95 ${
              mediaPickerOpen && useMediaPickerStore.getState().activeTab === 'stickers'
                ? 'text-[#dbdee1]'
                : 'text-[#b5bac1] hover:text-[#dbdee1]'
            }`}
            title="Stickers"
            type="button"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3z" />
              <polyline points="14 3 14 8 21 8" />
            </svg>
          </button>
          <button
            data-media-btn
            onClick={() => toggleMediaPicker('emojis')}
            className={`px-1.5 py-3 transition-all duration-150 active:scale-95 ${
              mediaPickerOpen && useMediaPickerStore.getState().activeTab === 'emojis'
                ? 'text-[#dbdee1]'
                : 'text-[#b5bac1] hover:text-[#dbdee1]'
            }`}
            title="Emoji"
            type="button"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </button>
          <MediaPicker
            onEmojiSelect={handleEmojiSelect}
            onGifSelect={handleGifSelect}
            onStickerSelect={handleStickerSelect}
          />
        </div>
      </div>
    </div>
  );
}
