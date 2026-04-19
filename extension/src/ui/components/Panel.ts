/**
 * Panel Component
 *
 * Side panel for settings, user management, and content filters.
 * Includes: user profile, following list, content toggles, etc.
 */

import { store } from '@/shared/state';

const STYLES = `
  :host {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 2147483647;
    pointer-events: auto;
    display: none;
  }

  :host([visible]) {
    display: block;
  }

  .panel {
    width: 320px;
    max-height: calc(100vh - 32px);
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.15);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    padding: 16px;
    border-bottom: 1px solid #eee;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .panel-title {
    font-size: 16px;
    font-weight: 600;
    color: #111;
  }

  .close-btn {
    width: 28px;
    height: 28px;
    border: none;
    background: #f5f5f5;
    border-radius: 50%;
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  .section {
    margin-bottom: 20px;
  }

  .section-title {
    font-size: 12px;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    margin-bottom: 12px;
  }

  .user-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: #f9f9f9;
    border-radius: 8px;
  }

  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #ddd;
  }

  .user-info {
    flex: 1;
  }

  .username {
    font-weight: 600;
    color: #111;
  }

  .user-tier {
    font-size: 12px;
    color: #666;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
  }

  .toggle-label {
    font-size: 14px;
    color: #333;
  }

  .toggle {
    width: 44px;
    height: 24px;
    background: #ddd;
    border-radius: 12px;
    position: relative;
    cursor: pointer;
    transition: background 0.2s;
  }

  .toggle.active {
    background: #22c55e;
  }

  .toggle::after {
    content: '';
    position: absolute;
    width: 20px;
    height: 20px;
    background: #fff;
    border-radius: 50%;
    top: 2px;
    left: 2px;
    transition: transform 0.2s;
  }

  .toggle.active::after {
    transform: translateX(20px);
  }

  .btn {
    width: 100%;
    padding: 12px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
  }

  .btn-primary {
    background: #22c55e;
    color: #fff;
  }

  .btn-outline {
    background: transparent;
    border: 1px solid #ddd;
    color: #333;
  }

  .btn + .btn {
    margin-top: 8px;
  }
`;

const TEMPLATE = `
  <div class="panel">
    <div class="panel-header">
      <span class="panel-title">OpenOverlay</span>
      <button class="close-btn" id="close">×</button>
    </div>
    <div class="panel-body">
      <div class="section" id="auth-section">
        <!-- Will be populated based on auth state -->
      </div>

      <div class="section">
        <div class="section-title">Show Content</div>
        <div class="toggle-row">
          <span class="toggle-label">Drawings</span>
          <div class="toggle active" data-filter="drawings"></div>
        </div>
        <div class="toggle-row">
          <span class="toggle-label">Annotations</span>
          <div class="toggle active" data-filter="annotations"></div>
        </div>
        <div class="toggle-row">
          <span class="toggle-label">Race Courses</span>
          <div class="toggle active" data-filter="courses"></div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Content From</div>
        <select id="show-from" style="width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #ddd;">
          <option value="all">Everyone</option>
          <option value="following">People I Follow</option>
          <option value="none">Only Me</option>
        </select>
      </div>
    </div>
  </div>
`;

export class Panel extends HTMLElement {
  private shadow: ShadowRoot;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this.attachEvents();
    this.subscribeToStore();
  }

  private render(): void {
    const style = document.createElement('style');
    style.textContent = STYLES;

    const template = document.createElement('template');
    template.innerHTML = TEMPLATE;

    this.shadow.appendChild(style);
    this.shadow.appendChild(template.content.cloneNode(true));

    this.updateAuthSection();
  }

  private attachEvents(): void {
    const closeBtn = this.shadow.getElementById('close');
    closeBtn?.addEventListener('click', () => {
      store.setState({ panelOpen: false });
    });

    // Toggle handlers
    const toggles = this.shadow.querySelectorAll('.toggle');
    toggles.forEach((toggle) => {
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('active');
        const filter = (toggle as HTMLElement).dataset.filter;
        if (filter) {
          this.updateFilter(filter, toggle.classList.contains('active'));
        }
      });
    });
  }

  private subscribeToStore(): void {
    // Show/hide panel
    store.subscribeKey('panelOpen', (open) => {
      this.toggleAttribute('visible', open);
    });

    // Update auth section when user changes
    store.subscribeKey('user', () => {
      this.updateAuthSection();
    });
  }

  private updateAuthSection(): void {
    const section = this.shadow.getElementById('auth-section');
    if (!section) return;

    const { user, isAuthenticated } = store.getState();

    if (isAuthenticated && user) {
      section.innerHTML = `
        <div class="user-card">
          <img class="avatar" src="${user.avatarUrl || ''}" alt="">
          <div class="user-info">
            <div class="username">@${user.username}</div>
            <div class="user-tier">${user.tier} plan</div>
          </div>
        </div>
        <button class="btn btn-outline" id="logout" style="margin-top: 12px;">Sign Out</button>
      `;

      section.querySelector('#logout')?.addEventListener('click', () => {
        // TODO: Implement logout
      });
    } else {
      section.innerHTML = `
        <button class="btn btn-primary" id="login">Sign in with Google</button>
        <p style="text-align: center; margin-top: 8px; font-size: 12px; color: #666;">
          Sign in to save your drawings and follow others
        </p>
      `;

      section.querySelector('#login')?.addEventListener('click', () => {
        // TODO: Implement Google sign-in
      });
    }
  }

  private updateFilter(filter: string, enabled: boolean): void {
    const { filters } = store.getState();

    switch (filter) {
      case 'drawings':
        store.setState({
          filters: { ...filters, showDrawings: enabled },
        });
        break;
      case 'annotations':
        store.setState({
          filters: { ...filters, showAnnotations: enabled },
        });
        break;
      case 'courses':
        store.setState({
          filters: { ...filters, showCourses: enabled },
        });
        break;
    }
  }
}
