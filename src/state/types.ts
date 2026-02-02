/**
 * Persistent state types for wisdom-mcp
 */

/**
 * Session state that persists across restarts
 */
export interface PersistentState {
  // Current working context
  current_project?: string;
  current_agent?: string;

  // Recent activity (for quick access)
  recent_fragments?: string[];
  recent_projects?: string[];

  // Cached lookups
  tag_cache?: Record<string, TagCacheEntry>;

  // Session metadata
  last_activity?: string;
}

/**
 * Cached tag entry
 */
export interface TagCacheEntry {
  uuid: string;
  name: string;
  category: string;
  cached_at: string;
}

/**
 * Transform delegation state
 */
export interface TransformDelegationState {
  pending_transforms: PendingTransform[];
}

/**
 * A pending transform awaiting host completion
 */
export interface PendingTransform {
  id: string;
  direction: 'encode' | 'decode';
  input: string;
  transform_uuid?: string;
  created_at: string;
  status: 'pending' | 'completed' | 'failed';
}
