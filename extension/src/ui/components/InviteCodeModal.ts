/**
 * Invite Code Modal Component
 *
 * Modal that appears on first use requiring an invite code to access the extension.
 * Creates exclusivity and tracks viral spread.
 */

import { validateInviteCode, redeemInviteCode, skipInviteCode } from '@/db';
import { getCurrentUser } from '@/auth';

const STYLES = `
  :host {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2147483647;
    pointer-events: auto;
    display: none;
  }

  :host([visible]) {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .backdrop {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
  }

  .modal {
    position: relative;
    width: 380px;
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    overflow: hidden;
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .modal-header {
    padding: 24px 24px 0;
    text-align: center;
  }

  .logo {
    font-size: 32px;
    margin-bottom: 8px;
  }

  .title {
    font-size: 20px;
    font-weight: 700;
    color: #111;
    margin: 0 0 8px;
  }

  .subtitle {
    font-size: 14px;
    color: #666;
    margin: 0;
    line-height: 1.4;
  }

  .modal-body {
    padding: 24px;
  }

  .input-group {
    margin-bottom: 16px;
  }

  .input-label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    margin-bottom: 8px;
  }

  .code-input {
    width: 100%;
    padding: 14px 16px;
    font-size: 18px;
    font-weight: 600;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 4px;
    border: 2px solid #e0e0e0;
    border-radius: 12px;
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
  }

  .code-input:focus {
    border-color: #ec4899;
  }

  .code-input.error {
    border-color: #ef4444;
    animation: shake 0.3s ease-out;
  }

  .code-input.success {
    border-color: #22c55e;
  }

  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-8px); }
    75% { transform: translateX(8px); }
  }

  .error-message {
    font-size: 13px;
    color: #ef4444;
    margin-top: 8px;
    text-align: center;
    min-height: 20px;
  }

  .submit-btn {
    width: 100%;
    padding: 14px;
    font-size: 16px;
    font-weight: 600;
    color: #fff;
    background: linear-gradient(135deg, #ec4899, #db2777);
    border: none;
    border-radius: 12px;
    cursor: pointer;
    transition: opacity 0.2s, transform 0.2s;
  }

  .submit-btn:hover {
    opacity: 0.9;
  }

  .submit-btn:active {
    transform: scale(0.98);
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .submit-btn.loading {
    pointer-events: none;
  }

  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-right: 8px;
    vertical-align: middle;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .modal-footer {
    padding: 16px 24px 24px;
    text-align: center;
  }

  .footer-text {
    font-size: 13px;
    color: #888;
  }

  .footer-link {
    color: #ec4899;
    text-decoration: none;
    cursor: pointer;
  }

  .footer-link:hover {
    text-decoration: underline;
  }

  .divider {
    display: flex;
    align-items: center;
    margin: 20px 0;
    color: #999;
    font-size: 12px;
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #e0e0e0;
  }

  .divider::before {
    margin-right: 12px;
  }

  .divider::after {
    margin-left: 12px;
  }

  .waitlist-btn {
    width: 100%;
    padding: 12px;
    font-size: 14px;
    font-weight: 500;
    color: #666;
    background: #f5f5f5;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .waitlist-btn:hover {
    background: #ebebeb;
  }

  .success-state {
    text-align: center;
    padding: 20px 0;
  }

  .success-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  .success-title {
    font-size: 20px;
    font-weight: 700;
    color: #111;
    margin: 0 0 8px;
  }

  .success-message {
    font-size: 14px;
    color: #666;
    margin: 0;
  }
`;

const TEMPLATE = `
  <div class="backdrop"></div>
  <div class="modal">
    <div class="modal-header">
      <div class="logo">✏️</div>
      <h2 class="title">Welcome to Smudgz</h2>
      <p class="subtitle">Enter your invite code to start drawing on the web</p>
    </div>
    <div class="modal-body" id="main-form">
      <div class="input-group">
        <label class="input-label">Invite Code</label>
        <input
          type="text"
          class="code-input"
          id="code-input"
          placeholder="ENTER CODE"
          maxlength="20"
          autocomplete="off"
          spellcheck="false"
        />
        <div class="error-message" id="error-message"></div>
      </div>
      <button class="submit-btn" id="submit-btn">
        Unlock Smudgz
      </button>
      <div class="divider">or</div>
      <button class="waitlist-btn" id="waitlist-btn">
        Join the Waitlist
      </button>
    </div>
    <div class="modal-body success-state" id="success-state" style="display: none;">
      <div class="success-icon">🎉</div>
      <h3 class="success-title">You're in!</h3>
      <p class="success-message">Welcome to Smudgz. Start drawing on any webpage.</p>
    </div>
    <div class="modal-footer">
      <p class="footer-text">
        Don't have a code? <a class="footer-link" href="https://smudgz.com" target="_blank">Get one here</a>
      </p>
    </div>
  </div>
`;

export class InviteCodeModal extends HTMLElement {
  private shadow: ShadowRoot;
  private onSuccess: (() => void) | null = null;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this.attachEvents();
  }

  private render(): void {
    const style = document.createElement('style');
    style.textContent = STYLES;

    const template = document.createElement('template');
    template.innerHTML = TEMPLATE;

    this.shadow.appendChild(style);
    this.shadow.appendChild(template.content.cloneNode(true));
  }

  private attachEvents(): void {
    const input = this.shadow.getElementById('code-input') as HTMLInputElement;
    const submitBtn = this.shadow.getElementById('submit-btn') as HTMLButtonElement;
    const waitlistBtn = this.shadow.getElementById('waitlist-btn') as HTMLButtonElement;
    const errorMessage = this.shadow.getElementById('error-message') as HTMLDivElement;

    // Auto-uppercase input
    input?.addEventListener('input', () => {
      input.value = input.value.toUpperCase();
      input.classList.remove('error', 'success');
      errorMessage.textContent = '';
    });

    // Submit on enter
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleSubmit();
      }
    });

    // Submit button
    submitBtn?.addEventListener('click', () => this.handleSubmit());

    // Waitlist button - for now just opens the website
    waitlistBtn?.addEventListener('click', () => {
      window.open('https://smudgz.com', '_blank');
    });

    // Focus input when modal opens
    setTimeout(() => input?.focus(), 100);
  }

  private async handleSubmit(): Promise<void> {
    const input = this.shadow.getElementById('code-input') as HTMLInputElement;
    const submitBtn = this.shadow.getElementById('submit-btn') as HTMLButtonElement;
    const errorMessage = this.shadow.getElementById('error-message') as HTMLDivElement;

    const code = input.value.trim();

    if (!code) {
      input.classList.add('error');
      errorMessage.textContent = 'Please enter an invite code';
      return;
    }

    // Show loading state
    submitBtn.classList.add('loading');
    submitBtn.innerHTML = '<span class="spinner"></span>Checking...';
    submitBtn.disabled = true;
    input.disabled = true;

    try {
      // Check if user is signed in
      const user = getCurrentUser();
      if (!user) {
        // Just validate the code, don't redeem yet
        const validation = await validateInviteCode(code);

        if (validation.valid) {
          // Store the code temporarily - it will be redeemed after sign in
          await chrome.storage.local.set({ 'oo_pending_invite_code': code });
          this.showSuccess();
        } else {
          input.classList.add('error');
          errorMessage.textContent = validation.error || 'Invalid code';
          submitBtn.classList.remove('loading');
          submitBtn.innerHTML = 'Unlock Smudgz';
          submitBtn.disabled = false;
          input.disabled = false;
        }
      } else {
        // User is signed in, redeem the code
        const result = await redeemInviteCode(code);

        if (result.success) {
          this.showSuccess();
        } else {
          input.classList.add('error');
          errorMessage.textContent = result.error || 'Failed to redeem code';
          submitBtn.classList.remove('loading');
          submitBtn.innerHTML = 'Unlock Smudgz';
          submitBtn.disabled = false;
          input.disabled = false;
        }
      }
    } catch (err) {
      console.error('[OpenOverlay] Invite code error:', err);
      input.classList.add('error');
      errorMessage.textContent = 'Something went wrong. Please try again.';
      submitBtn.classList.remove('loading');
      submitBtn.innerHTML = 'Unlock Smudgz';
      submitBtn.disabled = false;
      input.disabled = false;
    }
  }

  private showSuccess(): void {
    const mainForm = this.shadow.getElementById('main-form');
    const successState = this.shadow.getElementById('success-state');
    const footer = this.shadow.querySelector('.modal-footer') as HTMLElement;

    if (mainForm) mainForm.style.display = 'none';
    if (successState) successState.style.display = 'block';
    if (footer) footer.style.display = 'none';

    // Close modal after showing success
    setTimeout(() => {
      this.hide();
      if (this.onSuccess) {
        this.onSuccess();
      }
    }, 2000);
  }

  show(onSuccess?: () => void): void {
    this.onSuccess = onSuccess || null;
    this.setAttribute('visible', '');

    // Focus the input
    setTimeout(() => {
      const input = this.shadow.getElementById('code-input') as HTMLInputElement;
      input?.focus();
    }, 100);
  }

  hide(): void {
    this.removeAttribute('visible');
  }

  /**
   * Skip the invite code requirement (for testing/admin)
   */
  async skip(): Promise<void> {
    await skipInviteCode();
    this.hide();
    if (this.onSuccess) {
      this.onSuccess();
    }
  }
}

// Register the custom element
if (!customElements.get('oo-invite-code-modal')) {
  customElements.define('oo-invite-code-modal', InviteCodeModal);
}
