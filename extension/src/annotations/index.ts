/**
 * Annotations Module
 * Text highlighting and commenting system with real-time sync
 */

import {
  saveAnnotationToCloud,
  deleteAnnotationFromCloud,
  subscribeToAnnotations,
  fetchAnnotationsFromCloud,
  addReplyToAnnotation,
  toggleReactionOnAnnotation,
  type CloudAnnotation,
  isFirestoreAvailable
} from '@/db';
import { getCurrentUser } from '@/auth';

interface Annotation {
  id: string;
  // Text selection info
  text: string;
  contextBefore: string;  // Text before selection for unique matching
  contextAfter: string;   // Text after selection for unique matching
  anchorSelector: string;
  anchorOffset: number;
  focusSelector: string;
  focusOffset: number;
  // Content
  comment: string;
  color: string;
  // Author (placeholder for now)
  authorId: string;
  authorName: string;
  // Timestamps
  createdAt: number;
  // Reactions/comments
  reactions: { emoji: string; count: number; userReacted: boolean }[];
  replies: { authorName: string; text: string; createdAt: number }[];
}

let annotations: Annotation[] = [];
let activePopup: HTMLElement | null = null;
let annotationHost: HTMLElement | null = null;
let annotationRoot: ShadowRoot | null = null;
let currentCommentAnnotation: Annotation | null = null;

// Bookmarked annotation IDs (across all pages)
let bookmarkedIds: Set<string> = new Set();

const HIGHLIGHT_COLORS = ['#ffeb3b', '#ff9800', '#4caf50', '#2196f3', '#e91e63'];

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '😡', '🔥', '👀', '💯', '🎉'];

const STYLES = `
  .oo-annotate-btn {
    position: absolute;
    background: #22c55e;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    z-index: 2147483646;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    transition: transform 0.1s;
  }

  .oo-annotate-btn:hover {
    transform: scale(1.05);
  }

  .oo-annotation-form {
    position: absolute;
    background: #1a1a1a;
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    z-index: 2147483646;
    width: 300px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .oo-annotation-form textarea {
    width: 100%;
    height: 80px;
    background: #2a2a2a;
    border: 1px solid #333;
    border-radius: 8px;
    color: #fff;
    padding: 10px;
    font-size: 14px;
    resize: none;
    font-family: inherit;
  }

  .oo-annotation-form textarea:focus {
    outline: none;
    border-color: #22c55e;
  }

  .oo-annotation-form .colors {
    display: flex;
    gap: 6px;
    margin: 12px 0;
  }

  .oo-annotation-form .color-btn {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 0.1s;
  }

  .oo-annotation-form .color-btn:hover {
    transform: scale(1.2);
  }

  .oo-annotation-form .color-btn.active {
    border-color: #fff;
  }

  .oo-annotation-form .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }

  .oo-annotation-form button {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }

  .oo-annotation-form .cancel-btn {
    background: #333;
    color: #fff;
  }

  .oo-annotation-form .save-btn {
    background: #22c55e;
    color: #fff;
  }

  .oo-popup {
    position: absolute;
    background: #1a1a1a;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    z-index: 2147483646;
    max-width: 320px;
    min-width: 200px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    pointer-events: auto;
    padding: 14px;
  }

  .oo-popup .popup-quote {
    font-size: 18px;
    font-weight: 700;
    color: #fff;
    line-height: 1.3;
    margin-bottom: 8px;
  }

  .oo-popup .popup-author {
    text-align: right;
    color: #888;
    font-size: 12px;
    margin-bottom: 10px;
  }

  .oo-popup .popup-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .oo-popup .popup-reactions {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    flex: 1;
  }

  .oo-popup .reaction {
    background: #222;
    border: 1px solid #333;
    border-radius: 12px;
    padding: 2px 6px;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.1s;
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .oo-popup .reaction:hover {
    background: #333;
  }

  .oo-popup .reaction .count {
    color: #888;
    font-size: 11px;
  }

  .oo-popup .reaction.active {
    background: #22c55e33;
    border-color: #22c55e;
  }

  .oo-popup .popup-actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .oo-popup .comment-btn {
    background: #222;
    border: 1px solid #333;
    border-radius: 12px;
    padding: 2px 8px;
    font-size: 12px;
    cursor: pointer;
    color: #888;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .oo-popup .comment-btn:hover {
    background: #333;
    color: #fff;
  }

  .oo-popup .add-reaction {
    background: #222;
    border: 1px solid #333;
    border-radius: 12px;
    padding: 2px 6px;
    font-size: 14px;
    cursor: pointer;
    color: #888;
  }

  .oo-popup .add-reaction:hover {
    background: #333;
    border-color: #22c55e;
    color: #22c55e;
  }

  .oo-popup .maximize-btn {
    background: none;
    border: none;
    color: #666;
    font-size: 14px;
    cursor: pointer;
    padding: 2px 4px;
  }

  .oo-popup .maximize-btn:hover {
    color: #fff;
  }

  .oo-popup .bookmark-btn {
    background: transparent;
    border: none;
    padding: 2px 4px;
    cursor: pointer;
    font-size: 14px;
    color: #888;
    transition: color 0.15s;
  }

  .oo-popup .bookmark-btn:hover {
    color: #fff;
  }

  .oo-popup .bookmark-btn.active {
    color: #f59e0b;
  }

  .oo-popup .popup-reply-section {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #333;
    display: none;
  }

  .oo-popup .popup-reply-section.open {
    display: block;
  }

  .oo-popup .popup-reply-input {
    display: flex;
    gap: 6px;
  }

  .oo-popup .popup-reply-input input {
    flex: 1;
    background: #222;
    border: 1px solid #333;
    border-radius: 14px;
    padding: 6px 10px;
    color: #fff;
    font-size: 12px;
  }

  .oo-popup .popup-reply-input input:focus {
    outline: none;
    border-color: #22c55e;
  }

  .oo-popup .popup-reply-input button {
    background: #22c55e;
    border: none;
    border-radius: 50%;
    width: 26px;
    height: 26px;
    color: white;
    font-size: 12px;
    cursor: pointer;
  }

  .oo-popup .quick-emojis {
    display: flex;
    gap: 2px;
    margin-top: 8px;
  }

  .oo-popup .quick-emoji {
    background: none;
    border: none;
    font-size: 16px;
    cursor: pointer;
    padding: 2px;
    border-radius: 4px;
    opacity: 0.6;
    transition: opacity 0.1s, transform 0.1s;
  }

  .oo-popup .quick-emoji:hover {
    opacity: 1;
    transform: scale(1.2);
  }

  .oo-popup-emoji-picker {
    position: absolute;
    background: #222;
    border-radius: 10px;
    padding: 6px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    width: 180px;
    bottom: 100%;
    left: 0;
    margin-bottom: 4px;
  }

  .oo-popup-emoji-picker .emoji-btn {
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    border-radius: 4px;
    font-size: 16px;
    cursor: pointer;
  }

  .oo-popup-emoji-picker .emoji-btn:hover {
    background: #333;
  }

  .oo-comment-panel {
    position: fixed;
    right: 0;
    top: 0;
    width: 360px;
    height: 100vh;
    background: #111;
    box-shadow: -4px 0 24px rgba(0,0,0,0.3);
    z-index: 2147483646;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform 0.2s ease-out;
  }

  .oo-comment-panel.open {
    transform: translateX(0);
  }

  .oo-comment-panel .header {
    padding: 16px;
    border-bottom: 1px solid #222;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .oo-comment-panel .header h3 {
    margin: 0;
    color: #fff;
    font-size: 16px;
  }

  .oo-comment-panel .close-btn {
    background: none;
    border: none;
    color: #888;
    font-size: 24px;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .oo-comment-panel .highlighted-text {
    padding: 16px;
    background: #1a1a1a;
    border-bottom: 1px solid #222;
  }

  .oo-comment-panel .highlighted-text blockquote {
    margin: 0;
    padding-left: 12px;
    border-left: 3px solid #22c55e;
    color: #aaa;
    font-style: italic;
  }

  .oo-comment-panel .main-comment {
    padding: 16px;
    border-bottom: 1px solid #222;
  }

  .oo-comment-panel .author-info {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .oo-comment-panel .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #333;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #888;
    font-size: 14px;
  }

  .oo-comment-panel .author-name {
    color: #fff;
    font-weight: 600;
    font-size: 14px;
  }

  .oo-comment-panel .timestamp {
    color: #666;
    font-size: 12px;
  }

  .oo-comment-panel .comment-text {
    color: #ddd;
    font-size: 14px;
    line-height: 1.5;
  }

  .oo-comment-panel .reactions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    flex-wrap: wrap;
  }

  .oo-comment-panel .reaction {
    background: #222;
    border: 1px solid #333;
    border-radius: 16px;
    padding: 4px 10px;
    font-size: 13px;
    cursor: pointer;
    transition: background 0.1s;
  }

  .oo-comment-panel .reaction:hover {
    background: #333;
  }

  .oo-comment-panel .reaction .emoji {
    margin-right: 4px;
  }

  .oo-comment-panel .reaction .count {
    color: #888;
  }

  .oo-comment-panel .add-reaction {
    background: #1a1a1a;
    border: 1px dashed #444;
    color: #888;
    font-size: 16px;
    min-width: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .oo-comment-panel .add-reaction:hover {
    border-color: #22c55e;
    color: #22c55e;
  }

  .oo-comment-panel .reaction.active {
    background: #22c55e33;
    border-color: #22c55e;
  }

  .oo-emoji-picker {
    position: absolute;
    background: #222;
    border-radius: 12px;
    padding: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    width: 200px;
    z-index: 10;
  }

  .oo-emoji-picker .emoji-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    border-radius: 6px;
    font-size: 18px;
    cursor: pointer;
    transition: background 0.1s, transform 0.1s;
  }

  .oo-emoji-picker .emoji-btn:hover {
    background: #333;
    transform: scale(1.2);
  }

  .oo-comment-panel .replies-section {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .oo-comment-panel .reply {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid #222;
  }

  .oo-comment-panel .reply:last-child {
    border-bottom: none;
  }

  .oo-comment-panel .reply-input {
    padding: 16px;
    border-top: 1px solid #222;
    display: flex;
    gap: 8px;
  }

  .oo-comment-panel .reply-input input {
    flex: 1;
    background: #222;
    border: 1px solid #333;
    border-radius: 20px;
    padding: 10px 16px;
    color: #fff;
    font-size: 14px;
  }

  .oo-comment-panel .reply-input input:focus {
    outline: none;
    border-color: #22c55e;
  }

  .oo-comment-panel .reply-input button {
    background: #22c55e;
    border: none;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    color: white;
    font-size: 18px;
    cursor: pointer;
  }
`;

/**
 * Initialize the annotations system
 */
export function initAnnotations(): void {
  console.log('[OpenOverlay] initAnnotations starting...');

  // Create shadow host for annotation UI
  annotationHost = document.createElement('div');
  annotationHost.id = 'openoverlay-annotations';
  annotationHost.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    z-index: 2147483646;
    pointer-events: none;
  `;
  annotationRoot = annotationHost.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = STYLES;
  annotationRoot.appendChild(style);

  document.body.appendChild(annotationHost);

  // Listen for text selection
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('selectionchange', onSelectionChange);

  // Load saved annotations
  loadAnnotations();

  // Load bookmarked annotation IDs
  loadBookmarkIds();

  // Apply highlights to page
  applyHighlights();

  console.log('[OpenOverlay] Annotations initialized');
}

let selectionTimeout: number | null = null;

function onSelectionChange(): void {
  // Debounce
  if (selectionTimeout) clearTimeout(selectionTimeout);
  selectionTimeout = window.setTimeout(() => {
    checkSelection();
  }, 100);
}

function onMouseUp(e: MouseEvent): void {
  // Don't interfere with our own UI
  if ((e.target as Element)?.closest('#openoverlay-annotations')) return;
  if ((e.target as Element)?.closest('#openoverlay-ui')) return;

  setTimeout(checkSelection, 10);
}

function checkSelection(): void {
  const selection = window.getSelection();

  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    hideAnnotateButton();
    return;
  }

  const text = selection.toString().trim();
  if (text.length < 3) {
    hideAnnotateButton();
    return;
  }

  // Show annotate button near selection
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  showAnnotateButton(rect, selection);
}

function showAnnotateButton(rect: DOMRect, selection: Selection): void {
  hideAnnotateButton();

  if (!annotationRoot) return;

  const btn = document.createElement('button');
  btn.className = 'oo-annotate-btn';
  btn.textContent = '+ Annotate';
  btn.style.pointerEvents = 'auto';
  btn.style.left = `${rect.left + window.scrollX + rect.width / 2 - 50}px`;
  btn.style.top = `${rect.bottom + window.scrollY + 8}px`;

  btn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    showAnnotationForm(rect, selection);
  };

  annotationRoot.appendChild(btn);
  activePopup = btn;
}

function hideAnnotateButton(): void {
  if (activePopup && annotationRoot?.contains(activePopup)) {
    activePopup.remove();
  }
  activePopup = null;
}

function showAnnotationForm(rect: DOMRect, selection: Selection): void {
  hideAnnotateButton();

  if (!annotationRoot) return;

  const text = selection.toString().trim();
  const range = selection.getRangeAt(0);

  // Get selection anchor info for persistence
  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;

  const form = document.createElement('div');
  form.className = 'oo-annotation-form';
  form.style.pointerEvents = 'auto';
  form.style.left = `${Math.max(10, rect.left + window.scrollX - 50)}px`;
  form.style.top = `${rect.bottom + window.scrollY + 8}px`;

  let selectedColor = HIGHLIGHT_COLORS[0];

  form.innerHTML = `
    <textarea placeholder="Add your annotation..." autofocus></textarea>
    <div class="colors">
      ${HIGHLIGHT_COLORS.map((c, i) => `
        <div class="color-btn ${i === 0 ? 'active' : ''}"
             data-color="${c}"
             style="background: ${c}"></div>
      `).join('')}
    </div>
    <div class="actions">
      <button class="cancel-btn">Cancel</button>
      <button class="save-btn">Save</button>
    </div>
  `;

  // Color selection
  form.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      form.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedColor = (btn as HTMLElement).dataset.color || HIGHLIGHT_COLORS[0];
    });
  });

  // Cancel
  form.querySelector('.cancel-btn')?.addEventListener('click', () => {
    form.remove();
    window.getSelection()?.removeAllRanges();
  });

  // Save
  form.querySelector('.save-btn')?.addEventListener('click', () => {
    const textarea = form.querySelector('textarea') as HTMLTextAreaElement;
    const comment = textarea.value.trim();

    if (!comment) {
      textarea.focus();
      return;
    }

    // Get surrounding context for unique matching
    const { contextBefore, contextAfter } = getSelectionContext(range, text);

    // Create annotation
    const annotation: Annotation = {
      id: generateId(),
      text,
      contextBefore,
      contextAfter,
      anchorSelector: getNodeSelector(anchorNode),
      anchorOffset: selection.anchorOffset,
      focusSelector: getNodeSelector(focusNode),
      focusOffset: selection.focusOffset,
      comment,
      color: selectedColor,
      authorId: 'local-user',
      authorName: 'You',
      createdAt: Date.now(),
      reactions: [],
      replies: [],
    };

    annotations.push(annotation);
    saveAnnotations();
    applyHighlights();

    // Sync to cloud for real-time updates
    saveAnnotationToCloudAsync(annotation);

    form.remove();
    window.getSelection()?.removeAllRanges();

    console.log('[OpenOverlay] Annotation created:', annotation.id);
  });

  annotationRoot.appendChild(form);

  // Focus textarea
  setTimeout(() => {
    (form.querySelector('textarea') as HTMLTextAreaElement)?.focus();
  }, 10);
}

function getNodeSelector(node: Node | null): string {
  if (!node) return 'body';

  // Get the parent element if this is a text node
  const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node as Element;
  if (!element) return 'body';

  // Build a selector path
  const path: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      path.unshift(`#${CSS.escape(current.id)}`);
      break;
    }

    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(current) + 1;
      selector += `:nth-child(${index})`;
    }

    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(' > ') || 'body';
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

/**
 * Get surrounding text context for a selection to enable unique matching
 */
function getSelectionContext(range: Range, selectedText: string): { contextBefore: string; contextAfter: string } {
  const CONTEXT_LENGTH = 30;

  try {
    // Get the common ancestor container
    const container = range.commonAncestorContainer;
    const parentEl = container.nodeType === Node.TEXT_NODE ? container.parentElement : container as Element;

    if (!parentEl) {
      return { contextBefore: '', contextAfter: '' };
    }

    // Get all text content of the parent element
    const fullText = parentEl.textContent || '';

    // Find where our selected text appears in the parent's full text
    // We need to find the right occurrence based on the range position
    const textBeforeRange = range.startContainer.textContent?.substring(0, range.startOffset) || '';

    // Walk backwards to accumulate text before the selection
    let beforeText = '';
    const walker = document.createTreeWalker(parentEl, NodeFilter.SHOW_TEXT, null);
    let node: Node | null;

    while ((node = walker.nextNode())) {
      if (node === range.startContainer) {
        beforeText += textBeforeRange;
        break;
      }
      beforeText += node.textContent || '';
    }

    // Get context before (last N chars before selection)
    const contextBefore = beforeText.slice(-CONTEXT_LENGTH);

    // Get context after (first N chars after selection)
    const afterStartIndex = beforeText.length + selectedText.length;
    const contextAfter = fullText.substring(afterStartIndex, afterStartIndex + CONTEXT_LENGTH);

    return { contextBefore, contextAfter };
  } catch (e) {
    console.warn('[OpenOverlay] Failed to get selection context:', e);
    return { contextBefore: '', contextAfter: '' };
  }
}

/**
 * Clear all existing highlights
 */
function clearHighlights(): void {
  document.querySelectorAll('.oo-highlight').forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(el.textContent || ''), el);
      parent.normalize();
    }
  });
}

/**
 * Apply highlight styles to annotated text
 */
function applyHighlights(): void {
  // Remove existing highlights
  clearHighlights();

  // Apply new highlights
  for (const annotation of annotations) {
    try {
      highlightAnnotation(annotation);
    } catch (e) {
      console.warn('[OpenOverlay] Failed to highlight annotation:', annotation.id, e);
    }
  }
}

function highlightAnnotation(annotation: Annotation): void {
  // Build a search pattern using context
  const searchPattern = (annotation.contextBefore || '') + annotation.text + (annotation.contextAfter || '');
  const textToFind = annotation.text;

  // Collect all text content with node references
  const textNodes: { node: Node; start: number; end: number }[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);

  let fullText = '';
  let node: Node | null;

  while ((node = walker.nextNode())) {
    const content = node.textContent || '';
    textNodes.push({
      node,
      start: fullText.length,
      end: fullText.length + content.length
    });
    fullText += content;
  }

  // Find the best match using context
  let bestMatchIndex = -1;

  if (annotation.contextBefore || annotation.contextAfter) {
    // Search for text with context
    const contextBefore = annotation.contextBefore || '';
    const contextAfter = annotation.contextAfter || '';

    // Try to find the full pattern (context + text + context)
    let searchIndex = 0;
    while (searchIndex < fullText.length) {
      const idx = fullText.indexOf(textToFind, searchIndex);
      if (idx === -1) break;

      // Check if context matches
      const beforeMatch = contextBefore === '' ||
        fullText.substring(Math.max(0, idx - contextBefore.length), idx).endsWith(contextBefore);
      const afterMatch = contextAfter === '' ||
        fullText.substring(idx + textToFind.length, idx + textToFind.length + contextAfter.length).startsWith(contextAfter);

      if (beforeMatch && afterMatch) {
        bestMatchIndex = idx;
        break;
      }

      searchIndex = idx + 1;
    }
  }

  // Fall back to first occurrence if context matching failed
  if (bestMatchIndex === -1) {
    bestMatchIndex = fullText.indexOf(textToFind);
  }

  if (bestMatchIndex === -1) return;

  // Find which text node contains the match
  let targetNode: Node | null = null;
  let nodeOffset = 0;

  for (const tn of textNodes) {
    if (bestMatchIndex >= tn.start && bestMatchIndex < tn.end) {
      targetNode = tn.node;
      nodeOffset = bestMatchIndex - tn.start;
      break;
    }
  }

  if (!targetNode) return;

  // Create the highlight
  try {
    const range = document.createRange();
    range.setStart(targetNode, nodeOffset);
    range.setEnd(targetNode, nodeOffset + textToFind.length);

    const highlight = document.createElement('span');
    highlight.className = 'oo-highlight';
    highlight.dataset.annotationId = annotation.id;
    highlight.style.cssText = `
      background: ${annotation.color}40;
      border-bottom: 2px solid ${annotation.color};
      cursor: pointer;
      transition: background 0.15s;
    `;

    // Hover to show popup
    highlight.addEventListener('mouseenter', (e) => {
      highlight.style.background = `${annotation.color}60`;
      showInteractivePopup(annotation, e as MouseEvent, highlight);
    });

    highlight.addEventListener('mouseleave', (e) => {
      highlight.style.background = `${annotation.color}40`;
      schedulePopupHide();
    });

    range.surroundContents(highlight);
  } catch (e) {
    console.warn('[OpenOverlay] Failed to highlight annotation:', annotation.id, e);
  }
}

let popupElement: HTMLElement | null = null;
let currentPopupAnnotation: Annotation | null = null;
let popupHideTimeout: number | null = null;
let isPopupPinned = false;

function schedulePopupHide(): void {
  if (isPopupPinned) return;
  if (popupHideTimeout) clearTimeout(popupHideTimeout);
  popupHideTimeout = window.setTimeout(() => {
    hideInteractivePopup();
  }, 150);
}

function cancelPopupHide(): void {
  if (popupHideTimeout) {
    clearTimeout(popupHideTimeout);
    popupHideTimeout = null;
  }
}

function showInteractivePopup(annotation: Annotation, e: MouseEvent, highlightEl?: HTMLElement): void {
  // If same annotation popup is already open, just cancel any pending hide
  if (popupElement && currentPopupAnnotation?.id === annotation.id) {
    cancelPopupHide();
    return;
  }

  cancelPopupHide();
  hideInteractivePopup();
  closeCommentPanel();
  isPopupPinned = false;

  if (!annotationRoot) return;

  currentPopupAnnotation = annotation;

  const popup = document.createElement('div');
  popup.className = 'oo-popup';

  // Position popup near click, but keep on screen
  let left = e.pageX - 100;
  let top = e.pageY + 15;

  // Keep on screen
  if (left < 10) left = 10;
  if (left + 320 > window.innerWidth) left = window.innerWidth - 330;

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;

  // Only show reactions that have been used
  const usedReactions = annotation.reactions.filter(r => r.count > 0);
  const replyCount = annotation.replies.length;

  popup.innerHTML = `
    <div class="popup-quote">"${escapeHtml(annotation.comment)}"</div>
    <div class="popup-author">— ${escapeHtml(annotation.authorName)}</div>
    <div class="popup-footer">
      <div class="popup-reactions" id="popup-reactions">
        ${usedReactions.map(r => `
          <div class="reaction ${r.userReacted ? 'active' : ''}" data-emoji="${r.emoji}">
            <span class="emoji">${r.emoji}</span>
            <span class="count">${r.count}</span>
          </div>
        `).join('')}
      </div>
      <div class="popup-actions">
        <button class="comment-btn" id="popup-comment-btn" title="Comments">
          💬 ${replyCount > 0 ? replyCount : ''}
        </button>
        <button class="add-reaction" id="popup-add-reaction" title="React">+</button>
        <button class="bookmark-btn ${bookmarkedIds.has(annotation.id) ? 'active' : ''}" id="popup-bookmark-btn" title="Bookmark">🔖</button>
        <button class="maximize-btn" title="Open in sidebar">⛶</button>
      </div>
    </div>
    <div class="popup-reply-section" id="popup-reply-section">
      <div class="popup-reply-input">
        <input type="text" placeholder="Add a comment..." />
        <button>➤</button>
      </div>
      <div class="quick-emojis">
        ${REACTION_EMOJIS.slice(0, 6).map(emoji => `
          <button class="quick-emoji" data-emoji="${emoji}">${emoji}</button>
        `).join('')}
      </div>
    </div>
  `;

  // Keep popup open when hovering over it
  popup.addEventListener('mouseenter', () => {
    cancelPopupHide();
  });

  popup.addEventListener('mouseleave', () => {
    schedulePopupHide();
  });

  // Clicking inside popup pins it open
  popup.addEventListener('click', (e) => {
    e.stopPropagation();
    isPopupPinned = true;
    cancelPopupHide();
  });

  // Maximize button - open sidebar
  popup.querySelector('.maximize-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    isPopupPinned = false;
    hideInteractivePopup();
    openCommentPanel(annotation);
  });

  // Bookmark button - toggle bookmark
  popup.querySelector('#popup-bookmark-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleBookmark(annotation.id);
    const btn = popup.querySelector('#popup-bookmark-btn');
    btn?.classList.toggle('active', bookmarkedIds.has(annotation.id));
  });

  // Comment button - toggle reply section
  const commentBtn = popup.querySelector('#popup-comment-btn');
  const replySection = popup.querySelector('#popup-reply-section');
  commentBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    replySection?.classList.toggle('open');
    if (replySection?.classList.contains('open')) {
      const input = popup.querySelector('.popup-reply-input input') as HTMLInputElement;
      input?.focus();
    }
  });

  // Setup existing reaction toggles
  popup.querySelectorAll('.reaction').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const emoji = (btn as HTMLElement).dataset.emoji;
      if (!emoji) return;

      const reaction = annotation.reactions.find(r => r.emoji === emoji);
      if (reaction) {
        if (reaction.userReacted) {
          reaction.count--;
          reaction.userReacted = false;
          if (reaction.count <= 0) {
            annotation.reactions = annotation.reactions.filter(r => r.emoji !== emoji);
          }
        } else {
          reaction.count++;
          reaction.userReacted = true;
        }
        saveAnnotations();
        syncReactionToCloud(annotation, emoji);
        // Refresh popup
        hideInteractivePopup();
        showInteractivePopup(annotation, e as MouseEvent);
      }
    });
  });

  // Add reaction button - show picker
  popup.querySelector('#popup-add-reaction')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const reactionsContainer = popup.querySelector('#popup-reactions') as HTMLElement;
    showPopupEmojiPicker(popup, annotation, reactionsContainer);
  });

  // Quick emoji buttons
  popup.querySelectorAll('.quick-emoji').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const emoji = (btn as HTMLElement).dataset.emoji;
      if (!emoji) return;

      let reaction = annotation.reactions.find(r => r.emoji === emoji);
      if (reaction) {
        if (!reaction.userReacted) {
          reaction.count++;
          reaction.userReacted = true;
        }
      } else {
        annotation.reactions.push({ emoji, count: 1, userReacted: true });
      }
      saveAnnotations();
      syncReactionToCloud(annotation, emoji);
      hideInteractivePopup();
      showInteractivePopup(annotation, e as MouseEvent);
    });
  });

  // Reply input
  const replyInput = popup.querySelector('.popup-reply-input input') as HTMLInputElement;
  const replyBtn = popup.querySelector('.popup-reply-input button');

  const submitReply = () => {
    const text = replyInput.value.trim();
    if (!text) return;

    const user = getCurrentUser();
    const reply = {
      authorName: user?.displayName || 'You',
      text,
      createdAt: Date.now(),
    };

    annotation.replies.push(reply);
    saveAnnotations();
    syncReplyToCloud(annotation, reply);
    replyInput.value = '';

    // Update comment count
    const btn = popup.querySelector('#popup-comment-btn');
    if (btn) btn.innerHTML = `💬 ${annotation.replies.length}`;
  };

  replyBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    submitReply();
  });

  replyInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      submitReply();
    }
  });

  annotationRoot.appendChild(popup);
  popupElement = popup;

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', handlePopupOutsideClick);
  }, 10);
}

function renderPopupReactions(annotation: Annotation): string {
  return `
    ${annotation.reactions.map(r => `
      <div class="reaction ${r.userReacted ? 'active' : ''}" data-emoji="${r.emoji}">
        <span class="emoji">${r.emoji}</span>
        <span class="count">${r.count}</span>
      </div>
    `).join('')}
    <div class="reaction add-reaction" id="popup-add-reaction">😀+</div>
  `;
}

function setupPopupReactions(popup: HTMLElement, annotation: Annotation): void {
  const reactionsContainer = popup.querySelector('#popup-reactions') as HTMLElement;
  if (!reactionsContainer) return;

  // Toggle existing reactions
  reactionsContainer.querySelectorAll('.reaction:not(.add-reaction)').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const emoji = (btn as HTMLElement).dataset.emoji;
      if (!emoji) return;

      const reaction = annotation.reactions.find(r => r.emoji === emoji);
      if (reaction) {
        if (reaction.userReacted) {
          reaction.count--;
          reaction.userReacted = false;
          if (reaction.count <= 0) {
            annotation.reactions = annotation.reactions.filter(r => r.emoji !== emoji);
          }
        } else {
          reaction.count++;
          reaction.userReacted = true;
        }
        saveAnnotations();
        syncReactionToCloud(annotation, emoji);
        refreshPopupReactions(popup, annotation);
      }
    });
  });

  // Add reaction button
  reactionsContainer.querySelector('#popup-add-reaction')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showPopupEmojiPicker(popup, annotation, reactionsContainer);
  });
}

function refreshPopupReactions(popup: HTMLElement, annotation: Annotation): void {
  const container = popup.querySelector('#popup-reactions') as HTMLElement;
  if (!container) return;

  container.innerHTML = renderPopupReactions(annotation);
  setupPopupReactions(popup, annotation);
}

let popupEmojiPicker: HTMLElement | null = null;

function showPopupEmojiPicker(popup: HTMLElement, annotation: Annotation, container: HTMLElement): void {
  hidePopupEmojiPicker();

  const picker = document.createElement('div');
  picker.className = 'oo-popup-emoji-picker';

  picker.innerHTML = REACTION_EMOJIS.map(emoji => `
    <button class="emoji-btn" data-emoji="${emoji}">${emoji}</button>
  `).join('');

  picker.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const emoji = (btn as HTMLElement).dataset.emoji;
      if (!emoji) return;

      let reaction = annotation.reactions.find(r => r.emoji === emoji);
      if (reaction) {
        if (!reaction.userReacted) {
          reaction.count++;
          reaction.userReacted = true;
        }
      } else {
        annotation.reactions.push({
          emoji,
          count: 1,
          userReacted: true,
        });
      }

      saveAnnotations();
      syncReactionToCloud(annotation, emoji);
      refreshPopupReactions(popup, annotation);
      hidePopupEmojiPicker();
    });
  });

  container.appendChild(picker);
  popupEmojiPicker = picker;

  setTimeout(() => {
    document.addEventListener('click', hidePopupEmojiPickerOnOutside);
  }, 10);
}

function hidePopupEmojiPickerOnOutside(e: MouseEvent): void {
  if (popupEmojiPicker && !popupEmojiPicker.contains(e.target as Node)) {
    hidePopupEmojiPicker();
  }
}

function hidePopupEmojiPicker(): void {
  document.removeEventListener('click', hidePopupEmojiPickerOnOutside);
  if (popupEmojiPicker) {
    popupEmojiPicker.remove();
    popupEmojiPicker = null;
  }
}

function handlePopupOutsideClick(e: MouseEvent): void {
  // Only close on outside click if popup is pinned
  if (isPopupPinned && popupElement && !popupElement.contains(e.target as Node)) {
    hideInteractivePopup();
  }
}

function hideInteractivePopup(): void {
  cancelPopupHide();
  document.removeEventListener('click', handlePopupOutsideClick);
  hidePopupEmojiPicker();
  if (popupElement) {
    popupElement.remove();
    popupElement = null;
  }
  currentPopupAnnotation = null;
  isPopupPinned = false;
}

let commentPanel: HTMLElement | null = null;

function openCommentPanel(annotation: Annotation): void {
  hideInteractivePopup();
  closeCommentPanel();

  if (!annotationRoot) return;

  const panel = document.createElement('div');
  panel.className = 'oo-comment-panel open';
  panel.style.pointerEvents = 'auto';

  const timeAgo = formatTimeAgo(annotation.createdAt);

  panel.innerHTML = `
    <div class="header">
      <h3>Annotation</h3>
      <button class="close-btn">&times;</button>
    </div>
    <div class="highlighted-text">
      <blockquote>"${escapeHtml(annotation.text)}"</blockquote>
    </div>
    <div class="main-comment">
      <div class="author-info">
        <div class="avatar">${annotation.authorName.charAt(0).toUpperCase()}</div>
        <div>
          <div class="author-name">${escapeHtml(annotation.authorName)}</div>
          <div class="timestamp">${timeAgo}</div>
        </div>
      </div>
      <div class="comment-text">${escapeHtml(annotation.comment)}</div>
      <div class="reactions" id="reactions-container">
        ${annotation.reactions.map(r => `
          <div class="reaction ${r.userReacted ? 'active' : ''}" data-emoji="${r.emoji}">
            <span class="emoji">${r.emoji}</span>
            <span class="count">${r.count}</span>
          </div>
        `).join('')}
        <div class="reaction add-reaction" id="add-reaction-btn">😀+</div>
      </div>
    </div>
    <div class="replies-section">
      ${annotation.replies.map(reply => `
        <div class="reply">
          <div class="author-info">
            <div class="avatar">${reply.authorName.charAt(0).toUpperCase()}</div>
            <div>
              <div class="author-name">${escapeHtml(reply.authorName)}</div>
              <div class="timestamp">${formatTimeAgo(reply.createdAt)}</div>
            </div>
          </div>
          <div class="comment-text">${escapeHtml(reply.text)}</div>
        </div>
      `).join('')}
    </div>
    <div class="reply-input">
      <input type="text" placeholder="Add a reply..." />
      <button>➤</button>
    </div>
  `;

  // Prevent clicks inside panel from closing it
  panel.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Close button
  panel.querySelector('.close-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeCommentPanel();
  });

  // Reply input
  const replyInput = panel.querySelector('.reply-input input') as HTMLInputElement;
  const replyBtn = panel.querySelector('.reply-input button');

  const submitReply = () => {
    const text = replyInput.value.trim();
    if (!text) return;

    const user = getCurrentUser();
    const authorName = user?.displayName || 'You';
    const reply = {
      authorName,
      text,
      createdAt: Date.now(),
    };

    annotation.replies.push(reply);
    saveAnnotations();
    syncReplyToCloud(annotation, reply);

    // Refresh the replies section without reopening
    const repliesSection = panel.querySelector('.replies-section');
    if (repliesSection) {
      const replyHtml = `
        <div class="reply">
          <div class="author-info">
            <div class="avatar">${authorName.charAt(0).toUpperCase()}</div>
            <div>
              <div class="author-name">${escapeHtml(authorName)}</div>
              <div class="timestamp">just now</div>
            </div>
          </div>
          <div class="comment-text">${escapeHtml(text)}</div>
        </div>
      `;
      repliesSection.insertAdjacentHTML('beforeend', replyHtml);
    }

    replyInput.value = '';
    replyInput.focus();
  };

  replyBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    submitReply();
  });

  replyInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      submitReply();
    }
  });

  // Reaction handlers
  const reactionsContainer = panel.querySelector('#reactions-container');

  // Toggle existing reactions
  panel.querySelectorAll('.reaction:not(.add-reaction)').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const emoji = (btn as HTMLElement).dataset.emoji;
      if (!emoji) return;

      const reaction = annotation.reactions.find(r => r.emoji === emoji);
      if (reaction) {
        if (reaction.userReacted) {
          reaction.count--;
          reaction.userReacted = false;
          if (reaction.count <= 0) {
            annotation.reactions = annotation.reactions.filter(r => r.emoji !== emoji);
          }
        } else {
          reaction.count++;
          reaction.userReacted = true;
        }
        saveAnnotations();
        syncReactionToCloud(annotation, emoji);
        refreshReactions(annotation, reactionsContainer as HTMLElement);
      }
    });
  });

  // Add reaction button
  panel.querySelector('#add-reaction-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showEmojiPicker(annotation, e.target as HTMLElement, reactionsContainer as HTMLElement);
  });

  annotationRoot.appendChild(panel);
  commentPanel = panel;
  currentCommentAnnotation = annotation;

  // Focus reply input
  setTimeout(() => replyInput?.focus(), 100);

  // Close on click outside (on the main document)
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick);
  }, 50);
}

let emojiPicker: HTMLElement | null = null;

function showEmojiPicker(annotation: Annotation, triggerBtn: HTMLElement, container: HTMLElement): void {
  hideEmojiPicker();

  const picker = document.createElement('div');
  picker.className = 'oo-emoji-picker';

  // Position above the add button
  const rect = triggerBtn.getBoundingClientRect();
  picker.style.bottom = '40px';
  picker.style.left = '0';

  picker.innerHTML = REACTION_EMOJIS.map(emoji => `
    <button class="emoji-btn" data-emoji="${emoji}">${emoji}</button>
  `).join('');

  picker.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const emoji = (btn as HTMLElement).dataset.emoji;
      if (!emoji) return;

      // Check if this emoji already exists
      let reaction = annotation.reactions.find(r => r.emoji === emoji);
      if (reaction) {
        if (!reaction.userReacted) {
          reaction.count++;
          reaction.userReacted = true;
        }
      } else {
        annotation.reactions.push({
          emoji,
          count: 1,
          userReacted: true,
        });
      }

      saveAnnotations();
      syncReactionToCloud(annotation, emoji);
      refreshReactions(annotation, container);
      hideEmojiPicker();
    });
  });

  // Add to container (position relative parent)
  container.style.position = 'relative';
  container.appendChild(picker);
  emojiPicker = picker;

  // Close picker on outside click
  setTimeout(() => {
    document.addEventListener('click', hideEmojiPickerOnOutsideClick);
  }, 10);
}

function hideEmojiPickerOnOutsideClick(e: MouseEvent): void {
  if (emojiPicker && !emojiPicker.contains(e.target as Node)) {
    hideEmojiPicker();
  }
}

function hideEmojiPicker(): void {
  document.removeEventListener('click', hideEmojiPickerOnOutsideClick);
  if (emojiPicker) {
    emojiPicker.remove();
    emojiPicker = null;
  }
}

function refreshReactions(annotation: Annotation, container: HTMLElement): void {
  if (!container) return;

  container.innerHTML = `
    ${annotation.reactions.map(r => `
      <div class="reaction ${r.userReacted ? 'active' : ''}" data-emoji="${r.emoji}">
        <span class="emoji">${r.emoji}</span>
        <span class="count">${r.count}</span>
      </div>
    `).join('')}
    <div class="reaction add-reaction" id="add-reaction-btn">😀+</div>
  `;

  // Re-attach event listeners
  container.querySelectorAll('.reaction:not(.add-reaction)').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const emoji = (btn as HTMLElement).dataset.emoji;
      if (!emoji) return;

      const reaction = annotation.reactions.find(r => r.emoji === emoji);
      if (reaction) {
        if (reaction.userReacted) {
          reaction.count--;
          reaction.userReacted = false;
          if (reaction.count <= 0) {
            annotation.reactions = annotation.reactions.filter(r => r.emoji !== emoji);
          }
        } else {
          reaction.count++;
          reaction.userReacted = true;
        }
        saveAnnotations();
        syncReactionToCloud(annotation, emoji);
        refreshReactions(annotation, container);
      }
    });
  });

  container.querySelector('#add-reaction-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showEmojiPicker(annotation, e.target as HTMLElement, container);
  });
}

function handleOutsideClick(e: MouseEvent): void {
  if (commentPanel && !commentPanel.contains(e.target as Node)) {
    closeCommentPanel();
  }
}

function closeCommentPanel(): void {
  document.removeEventListener('click', handleOutsideClick);
  if (commentPanel) {
    commentPanel.remove();
    commentPanel = null;
  }
  currentCommentAnnotation = null;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

  return new Date(timestamp).toLocaleDateString();
}

function saveAnnotations(): void {
  const pageKey = getPageKey();
  localStorage.setItem(`oo_annotations_${pageKey}`, JSON.stringify(annotations));
  console.log('[OpenOverlay] Saved', annotations.length, 'annotations locally');
}

/**
 * Save a single annotation to cloud (for real-time sync)
 */
async function saveAnnotationToCloudAsync(annotation: Annotation): Promise<void> {
  if (!isFirestoreAvailable()) {
    console.log('[OpenOverlay] Firestore not available, skipping cloud save');
    return;
  }

  const user = getCurrentUser();
  const pageKey = getPageKey();
  console.log('[OpenOverlay] Saving annotation to cloud:', annotation.id, 'pageKey:', pageKey);

  const cloudAnnotation: CloudAnnotation = {
    id: annotation.id,
    pageKey,
    text: annotation.text,
    contextBefore: annotation.contextBefore || '',
    contextAfter: annotation.contextAfter || '',
    anchorSelector: annotation.anchorSelector,
    anchorOffset: annotation.anchorOffset,
    focusSelector: annotation.focusSelector,
    focusOffset: annotation.focusOffset,
    comment: annotation.comment,
    color: annotation.color,
    authorId: user?.uid || annotation.authorId,
    authorName: user?.displayName || annotation.authorName,
    createdAt: annotation.createdAt,
    reactions: annotation.reactions.map(r => ({
      emoji: r.emoji,
      count: r.count,
      users: r.userReacted && user ? [user.uid] : []
    })),
    replies: annotation.replies.map(r => ({
      authorId: '',
      authorName: r.authorName,
      text: r.text,
      createdAt: r.createdAt
    }))
  };

  await saveAnnotationToCloud(pageKey, cloudAnnotation);
}

/**
 * Sync reaction toggle to cloud
 */
async function syncReactionToCloud(annotation: Annotation, emoji: string): Promise<void> {
  if (!isFirestoreAvailable()) return;

  const user = getCurrentUser();
  if (!user) return;

  const pageKey = getPageKey();
  await toggleReactionOnAnnotation(pageKey, annotation.id, emoji, user.uid);
}

/**
 * Sync a reply to cloud
 */
async function syncReplyToCloud(annotation: Annotation, reply: { authorName: string; text: string; createdAt: number }): Promise<void> {
  if (!isFirestoreAvailable()) return;

  const user = getCurrentUser();
  const pageKey = getPageKey();

  await addReplyToAnnotation(pageKey, annotation.id, {
    authorId: user?.uid || '',
    authorName: user?.displayName || reply.authorName,
    text: reply.text,
    createdAt: reply.createdAt
  });
}

function loadAnnotations(): void {
  const pageKey = getPageKey();
  const data = localStorage.getItem(`oo_annotations_${pageKey}`);

  if (data) {
    try {
      annotations = JSON.parse(data);
      console.log('[OpenOverlay] Loaded', annotations.length, 'annotations from localStorage');
    } catch (e) {
      console.warn('[OpenOverlay] Failed to load annotations');
      annotations = [];
    }
  }

  // Set up real-time sync if Firestore is available
  setupRealtimeSync();
}

/**
 * Set up real-time annotation sync
 */
async function setupRealtimeSync(): Promise<void> {
  if (!isFirestoreAvailable()) {
    console.log('[OpenOverlay] Firestore not available, skipping real-time sync');
    return;
  }

  const pageKey = getPageKey();
  console.log('[OpenOverlay] Setting up real-time sync for page:', pageKey);

  // Try to subscribe to real-time updates
  const unsubscribe = subscribeToAnnotations(pageKey, (cloudAnnotations) => {
    handleCloudAnnotations(cloudAnnotations);
  });

  // If subscription failed, try one-time fetch
  if (!unsubscribe) {
    console.log('[OpenOverlay] Real-time subscription failed, trying one-time fetch');
    const cloudAnnotations = await fetchAnnotationsFromCloud(pageKey);
    handleCloudAnnotations(cloudAnnotations);
  }
}

/**
 * Handle incoming cloud annotations (merge with local)
 */
function handleCloudAnnotations(cloudAnnotations: CloudAnnotation[]): void {
  const user = getCurrentUser();
  console.log('[OpenOverlay] Processing', cloudAnnotations.length, 'cloud annotations');

  if (cloudAnnotations.length === 0) {
    console.log('[OpenOverlay] No cloud annotations found');
    return;
  }

  // Merge cloud annotations with local ones
  const merged = new Map<string, Annotation>();

  // Add local annotations first
  for (const ann of annotations) {
    merged.set(ann.id, ann);
  }

  // Update/add cloud annotations
  for (const cloudAnn of cloudAnnotations) {
    const localAnn = merged.get(cloudAnn.id);

    // Convert cloud annotation to local format
    const converted: Annotation = {
      id: cloudAnn.id,
      text: cloudAnn.text,
      contextBefore: cloudAnn.contextBefore || '',
      contextAfter: cloudAnn.contextAfter || '',
      anchorSelector: cloudAnn.anchorSelector,
      anchorOffset: cloudAnn.anchorOffset,
      focusSelector: cloudAnn.focusSelector,
      focusOffset: cloudAnn.focusOffset,
      comment: cloudAnn.comment,
      color: cloudAnn.color,
      authorId: cloudAnn.authorId,
      authorName: cloudAnn.authorName,
      createdAt: cloudAnn.createdAt,
      reactions: (cloudAnn.reactions || []).map(r => ({
        emoji: r.emoji,
        count: r.count,
        userReacted: user ? r.users.includes(user.uid) : false
      })),
      replies: (cloudAnn.replies || []).map(r => ({
        authorName: r.authorName,
        text: r.text,
        createdAt: r.createdAt
      }))
    };

    // Cloud version is newer or doesn't exist locally
    if (!localAnn || cloudAnn.createdAt >= localAnn.createdAt) {
      merged.set(cloudAnn.id, converted);
    }
  }

  // Update annotations array
  annotations = Array.from(merged.values());
  console.log('[OpenOverlay] Merged to', annotations.length, 'total annotations');

  // Save merged state to localStorage
  const pageKey = getPageKey();
  localStorage.setItem(`oo_annotations_${pageKey}`, JSON.stringify(annotations));

  // Re-apply highlights to show new annotations
  clearHighlights();
  applyHighlights();

  // Update any open popup/panel
  refreshOpenUI();
}

/**
 * Refresh any open popup or comment panel with latest data
 */
function refreshOpenUI(): void {
  // If a popup is open, refresh it
  if (currentPopupAnnotation) {
    const updated = annotations.find(a => a.id === currentPopupAnnotation?.id);
    if (updated) {
      currentPopupAnnotation = updated;
      // The popup will update on next interaction
    }
  }

  // If comment panel is open, refresh it
  if (commentPanel && currentCommentAnnotation) {
    const updated = annotations.find(a => a.id === currentCommentAnnotation?.id);
    if (updated) {
      refreshCommentPanel(updated);
    }
  }
}

/**
 * Refresh the comment panel with updated annotation data
 */
function refreshCommentPanel(annotation: Annotation): void {
  if (!commentPanel || !annotationRoot) return;

  const repliesSection = commentPanel.querySelector('.replies-section');
  if (!repliesSection) return;

  // Update replies list with same structure as openCommentPanel
  repliesSection.innerHTML = annotation.replies.map(reply => `
    <div class="reply">
      <div class="author-info">
        <div class="avatar">${reply.authorName.charAt(0).toUpperCase()}</div>
        <div>
          <div class="author-name">${escapeHtml(reply.authorName)}</div>
          <div class="timestamp">${formatTimeAgo(reply.createdAt)}</div>
        </div>
      </div>
      <div class="comment-text">${escapeHtml(reply.text)}</div>
    </div>
  `).join('');

  currentCommentAnnotation = annotation;
  console.log('[OpenOverlay] Comment panel refreshed with', annotation.replies.length, 'replies');
}

// ============ BOOKMARKS ============

interface BookmarkedAnnotation {
  id: string;
  pageUrl: string;
  pageTitle: string;
  text: string;
  comment: string;
  authorName: string;
  bookmarkedAt: number;
}

function toggleBookmark(annotationId: string): void {
  if (bookmarkedIds.has(annotationId)) {
    bookmarkedIds.delete(annotationId);
    removeBookmark(annotationId);
    console.log('[OpenOverlay] Removed bookmark');
  } else {
    bookmarkedIds.add(annotationId);
    const annotation = annotations.find(a => a.id === annotationId);
    if (annotation) {
      addBookmark(annotation);
      console.log('[OpenOverlay] Added bookmark');
    }
  }
}

function addBookmark(annotation: Annotation): void {
  const bookmarks = getBookmarks();

  // Don't duplicate
  if (bookmarks.some(b => b.id === annotation.id)) return;

  bookmarks.push({
    id: annotation.id,
    pageUrl: window.location.href,
    pageTitle: document.title,
    text: annotation.text,
    comment: annotation.comment,
    authorName: annotation.authorName,
    bookmarkedAt: Date.now(),
  });

  localStorage.setItem('oo_bookmarks', JSON.stringify(bookmarks));
}

function removeBookmark(annotationId: string): void {
  const bookmarks = getBookmarks().filter(b => b.id !== annotationId);
  localStorage.setItem('oo_bookmarks', JSON.stringify(bookmarks));
}

function getBookmarks(): BookmarkedAnnotation[] {
  try {
    return JSON.parse(localStorage.getItem('oo_bookmarks') || '[]');
  } catch {
    return [];
  }
}

function loadBookmarkIds(): void {
  const bookmarks = getBookmarks();
  bookmarkedIds = new Set(bookmarks.map(b => b.id));
}

// Export for UI
export { getBookmarks, type BookmarkedAnnotation };

function getPageKey(): string {
  return btoa(window.location.href).slice(0, 32);
}
