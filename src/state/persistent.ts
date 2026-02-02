import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PersistentState, TagCacheEntry } from './types.js';

const STATE_FILE = '.wisdom/state.json';
const MAX_RECENT_ITEMS = 10;
const TAG_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Manage persistent state across sessions
 */
export class StateManager {
  private state: PersistentState;
  private statePath: string | null;

  constructor(projectRoot: string | null) {
    this.statePath = projectRoot ? path.join(projectRoot, STATE_FILE) : null;
    this.state = this.loadState();
  }

  /**
   * Load state from disk
   */
  private loadState(): PersistentState {
    if (!this.statePath) {
      return {};
    }

    try {
      if (fs.existsSync(this.statePath)) {
        const content = fs.readFileSync(this.statePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch {
      // Ignore errors, start fresh
    }

    return {};
  }

  /**
   * Save state to disk
   */
  private saveState(): void {
    if (!this.statePath) {
      return;
    }

    try {
      const dir = path.dirname(this.statePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.state.last_activity = new Date().toISOString();
      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
    } catch {
      // Ignore save errors
    }
  }

  /**
   * Get current project
   */
  getCurrentProject(): string | undefined {
    return this.state.current_project;
  }

  /**
   * Set current project
   */
  setCurrentProject(projectUuid: string | undefined): void {
    this.state.current_project = projectUuid;

    // Add to recent projects
    if (projectUuid) {
      this.addRecentProject(projectUuid);
    }

    this.saveState();
  }

  /**
   * Get recent fragments
   */
  getRecentFragments(): string[] {
    return this.state.recent_fragments || [];
  }

  /**
   * Add a fragment to recent list
   */
  addRecentFragment(fragmentUuid: string): void {
    const recent = this.state.recent_fragments || [];
    const filtered = recent.filter((f) => f !== fragmentUuid);
    this.state.recent_fragments = [fragmentUuid, ...filtered].slice(
      0,
      MAX_RECENT_ITEMS
    );
    this.saveState();
  }

  /**
   * Get recent projects
   */
  getRecentProjects(): string[] {
    return this.state.recent_projects || [];
  }

  /**
   * Add a project to recent list
   */
  addRecentProject(projectUuid: string): void {
    const recent = this.state.recent_projects || [];
    const filtered = recent.filter((p) => p !== projectUuid);
    this.state.recent_projects = [projectUuid, ...filtered].slice(
      0,
      MAX_RECENT_ITEMS
    );
    this.saveState();
  }

  /**
   * Get cached tag by name
   */
  getCachedTag(name: string): TagCacheEntry | null {
    const cache = this.state.tag_cache || {};
    const entry = cache[name];

    if (!entry) {
      return null;
    }

    // Check if cache is still valid
    const cachedAt = new Date(entry.cached_at).getTime();
    if (Date.now() - cachedAt > TAG_CACHE_TTL_MS) {
      // Cache expired
      delete cache[name];
      this.state.tag_cache = cache;
      this.saveState();
      return null;
    }

    return entry;
  }

  /**
   * Cache a tag lookup
   */
  cacheTag(name: string, uuid: string, category: string): void {
    const cache = this.state.tag_cache || {};
    cache[name] = {
      uuid,
      name,
      category,
      cached_at: new Date().toISOString(),
    };
    this.state.tag_cache = cache;
    this.saveState();
  }

  /**
   * Clear all cached tags
   */
  clearTagCache(): void {
    this.state.tag_cache = {};
    this.saveState();
  }

  /**
   * Get last activity timestamp
   */
  getLastActivity(): string | undefined {
    return this.state.last_activity;
  }

  /**
   * Get full state (for debugging)
   */
  getState(): PersistentState {
    return { ...this.state };
  }

  /**
   * Clear all state
   */
  clearState(): void {
    this.state = {};
    this.saveState();
  }
}
