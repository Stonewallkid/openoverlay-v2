/**
 * API client for the OpenOverlay backend.
 * Handles all HTTP requests with auth token injection.
 */

import { store } from './state';
import type {
  User,
  Drawing,
  Annotation,
  Comment,
  Course,
  RaceTime,
  PageContent,
  ApiError,
} from './types';

// API base URL - configured per environment
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const { token } = store.getState();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        error: 'unknown',
        message: 'An unknown error occurred',
      }));
      throw new ApiClientError(response.status, error);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // Auth
  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    return this.request('POST', '/auth/login', { email, password });
  }

  async register(email: string, username: string, password: string): Promise<{ user: User; token: string }> {
    return this.request('POST', '/auth/register', { email, username, password });
  }

  async googleAuth(googleToken: string): Promise<{ user: User; token: string }> {
    return this.request('POST', '/auth/google', { token: googleToken });
  }

  async getMe(): Promise<User> {
    return this.request('GET', '/auth/me');
  }

  // Users
  async getUser(username: string): Promise<User> {
    return this.request('GET', `/users/${username}`);
  }

  async followUser(userId: string): Promise<void> {
    return this.request('POST', `/users/${userId}/follow`);
  }

  async unfollowUser(userId: string): Promise<void> {
    return this.request('DELETE', `/users/${userId}/follow`);
  }

  async getFollowing(userId: string): Promise<User[]> {
    return this.request('GET', `/users/${userId}/following`);
  }

  async getFollowers(userId: string): Promise<User[]> {
    return this.request('GET', `/users/${userId}/followers`);
  }

  // Page content
  async getPageContent(urlHash: string): Promise<PageContent> {
    return this.request('GET', `/pages/${urlHash}`);
  }

  // Drawings
  async createDrawing(data: {
    pageUrl: string;
    items: Drawing['items'];
    visibility: Drawing['visibility'];
  }): Promise<Drawing> {
    return this.request('POST', '/drawings', data);
  }

  async updateDrawing(id: string, items: Drawing['items']): Promise<Drawing> {
    return this.request('PATCH', `/drawings/${id}`, { items });
  }

  async deleteDrawing(id: string): Promise<void> {
    return this.request('DELETE', `/drawings/${id}`);
  }

  // Annotations
  async createAnnotation(data: {
    pageUrl: string;
    selector: Annotation['selector'];
    cssHint?: string;
    body: string;
    visibility: Annotation['visibility'];
  }): Promise<Annotation> {
    return this.request('POST', '/annotations', data);
  }

  async updateAnnotation(id: string, body: string): Promise<Annotation> {
    return this.request('PATCH', `/annotations/${id}`, { body });
  }

  async deleteAnnotation(id: string): Promise<void> {
    return this.request('DELETE', `/annotations/${id}`);
  }

  // Comments
  async getComments(annotationId: string): Promise<Comment[]> {
    return this.request('GET', `/annotations/${annotationId}/comments`);
  }

  async createComment(annotationId: string, body: string, parentId?: string): Promise<Comment> {
    return this.request('POST', `/annotations/${annotationId}/comments`, { body, parentId });
  }

  async deleteComment(commentId: string): Promise<void> {
    return this.request('DELETE', `/comments/${commentId}`);
  }

  // Courses
  async createCourse(data: {
    pageUrl: string;
    start: Course['start'];
    flags: Course['flags'];
    finish: Course['finish'];
    spikes: Course['spikes'];
    boosts: Course['boosts'];
    triples: Course['triples'];
    lowgs: Course['lowgs'];
    visibility: Course['visibility'];
  }): Promise<Course> {
    return this.request('POST', '/courses', data);
  }

  async deleteCourse(id: string): Promise<void> {
    return this.request('DELETE', `/courses/${id}`);
  }

  // Leaderboard
  async getLeaderboard(courseId: string): Promise<RaceTime[]> {
    return this.request('GET', `/courses/${courseId}/leaderboard`);
  }

  async submitTime(courseId: string, timeMs: number, character: string): Promise<RaceTime> {
    return this.request('POST', `/courses/${courseId}/times`, { timeMs, character });
  }

  // Billing
  async createCheckout(priceId: string): Promise<{ url: string }> {
    return this.request('POST', '/billing/checkout', { priceId });
  }

  async getPortalUrl(): Promise<{ url: string }> {
    return this.request('POST', '/billing/portal');
  }
}

// Custom error class
export class ApiClientError extends Error {
  status: number;
  apiError: ApiError;

  constructor(status: number, apiError: ApiError) {
    super(apiError.message);
    this.name = 'ApiClientError';
    this.status = status;
    this.apiError = apiError;
  }

  get requiresUpgrade(): boolean {
    return this.apiError.upgradeRequired === true;
  }
}

// Export singleton instance
export const api = new ApiClient(API_URL);
