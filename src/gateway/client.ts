import type {
  Agent,
  CreateAgentRequest,
  Fragment,
  CreateFragmentRequest,
  SearchFragmentsRequest,
  Relation,
  CreateRelationRequest,
  Tag,
  CreateTagRequest,
  Transform,
  CreateTransformRequest,
  Project,
  CreateProjectRequest,
  TrustVote,
  CreateTrustVoteRequest,
  CursorPaginatedResponse,
  HubStatus,
  ResourceLevel,
} from './types.js';

/**
 * HTTP client for the shared-wisdom Gateway API
 */
export class GatewayClient {
  private baseUrl: string;
  private lastHubStatus: HubStatus | null = null;
  private lastHubStatusTime: number = 0;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  /**
   * Get the last known hub status
   */
  getLastHubStatus(): HubStatus | null {
    return this.lastHubStatus;
  }

  /**
   * Get the timestamp of the last hub status update
   */
  getLastHubStatusTime(): number {
    return this.lastHubStatusTime;
  }

  /**
   * Check if the hub is at warning or critical level
   */
  hasHubWarning(): boolean {
    return this.lastHubStatus !== null && this.lastHubStatus.level !== 'normal';
  }

  /**
   * Check if the hub is at critical capacity
   */
  isHubCritical(): boolean {
    return this.lastHubStatus !== null && this.lastHubStatus.level === 'critical';
  }

  /**
   * Update the base URL
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, '');
  }

  /**
   * Make an HTTP request to the gateway
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    projectUUID?: string
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (projectUUID) {
      headers['X-Wisdom-Project'] = projectUUID;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Extract hub status from response headers
    this.updateHubStatusFromResponse(response);

    if (!response.ok) {
      const text = await response.text();
      let message = `Gateway error: ${response.status} ${response.statusText}`;
      try {
        const json = JSON.parse(text);
        if (json.error) message = json.error;
        if (json.message) message = json.message;
      } catch {
        if (text) message = text;
      }
      throw new Error(message);
    }

    // Handle empty responses
    const text = await response.text();
    if (!text || text === 'null') {
      return {} as T;
    }

    const parsed = JSON.parse(text);
    // Handle null JSON response (gateway returns null for empty lists)
    if (parsed === null) {
      return {} as T;
    }
    return parsed as T;
  }

  /**
   * Update hub status from HTTP response headers
   */
  private updateHubStatusFromResponse(response: Response): void {
    const statusHeader = response.headers.get('X-Hub-Status');

    if (!statusHeader) {
      // No status header means normal operation
      this.lastHubStatus = null;
      return;
    }

    const level = statusHeader as ResourceLevel;
    const hint = response.headers.get('X-Hub-Hint') || undefined;

    this.lastHubStatus = {
      level,
      hint,
      warnings: [],
    };
    this.lastHubStatusTime = Date.now();
  }

  /**
   * Get formatted warning messages for the user based on hub status
   */
  getHubWarningMessages(): string[] {
    if (!this.lastHubStatus || this.lastHubStatus.level === 'normal') {
      return [];
    }

    const warnings: string[] = [];

    if (this.lastHubStatus.hint) {
      warnings.push(this.lastHubStatus.hint);
    }

    if (this.lastHubStatus.level === 'critical') {
      warnings.push('⚠️ WARNING: Hub at critical capacity. Some operations may be restricted.');
    } else if (this.lastHubStatus.level === 'warning') {
      warnings.push('⚠️ NOTICE: Hub resources are running low.');
    }

    return warnings;
  }

  // ============================================================================
  // Agent API
  // ============================================================================

  async createAgent(agent: CreateAgentRequest): Promise<Agent> {
    return this.request<Agent>('POST', '/api/v1/agents', agent);
  }

  async getAgent(uuid: string): Promise<Agent> {
    return this.request<Agent>('GET', `/api/v1/agents/${uuid}`);
  }

  async listAgents(limit = 20, cursor?: string): Promise<CursorPaginatedResponse<Agent>> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (cursor) params.set('cursor', cursor);

    const result = await this.request<CursorPaginatedResponse<Agent>>(
      'GET',
      `/api/v1/agents?${params.toString()}`
    );

    return {
      items: result.items || [],
      next_cursor: result.next_cursor,
    };
  }

  // ============================================================================
  // Fragment API
  // ============================================================================

  async createFragment(fragment: CreateFragmentRequest, projectUUID?: string): Promise<Fragment> {
    return this.request<Fragment>('POST', '/api/v1/fragments', fragment, projectUUID);
  }

  async getFragment(uuid: string): Promise<Fragment> {
    return this.request<Fragment>('GET', `/api/v1/fragments/${uuid}`);
  }

  async searchFragments(
    params: SearchFragmentsRequest
  ): Promise<CursorPaginatedResponse<Fragment>> {
    const queryParams = new URLSearchParams();
    if (params.query) queryParams.set('query', params.query);
    if (params.author) queryParams.set('author', params.author);
    if (params.project) queryParams.set('project', params.project);
    if (params.state) queryParams.set('state', params.state);
    if (params.limit) queryParams.set('limit', String(params.limit));
    if (params.tags) {
      for (const tag of params.tags) {
        queryParams.append('tag', tag);
      }
    }

    const result = await this.request<CursorPaginatedResponse<Fragment>>(
      'GET',
      `/api/v1/fragments?${queryParams.toString()}`
    );

    return {
      items: result.items || [],
      next_cursor: result.next_cursor,
    };
  }

  async listFragments(
    limit = 20,
    cursor?: string
  ): Promise<CursorPaginatedResponse<Fragment>> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (cursor) params.set('cursor', cursor);

    const result = await this.request<CursorPaginatedResponse<Fragment>>(
      'GET',
      `/api/v1/fragments?${params.toString()}`
    );

    return {
      items: result.items || [],
      next_cursor: result.next_cursor,
    };
  }

  // ============================================================================
  // Relation API
  // ============================================================================

  async createRelation(relation: CreateRelationRequest, projectUUID?: string): Promise<Relation> {
    return this.request<Relation>('POST', '/api/v1/relations', relation, projectUUID);
  }

  async getRelation(uuid: string): Promise<Relation> {
    return this.request<Relation>('GET', `/api/v1/relations/${uuid}`);
  }

  async getRelationsForEntity(
    entityUuid: string,
    direction?: 'source' | 'target' | 'both'
  ): Promise<Relation[]> {
    const params = new URLSearchParams();
    params.set('entity', entityUuid);
    if (direction) params.set('direction', direction);
    return this.request<Relation[]>('GET', `/api/v1/relations?${params.toString()}`);
  }

  async listRelations(
    limit = 100,
    cursor?: string
  ): Promise<CursorPaginatedResponse<Relation>> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (cursor) params.set('cursor', cursor);

    const result = await this.request<CursorPaginatedResponse<Relation>>(
      'GET',
      `/api/v1/relations?${params.toString()}`
    );

    return {
      items: result.items || [],
      next_cursor: result.next_cursor,
    };
  }

  // ============================================================================
  // Tag API
  // ============================================================================

  async createTag(tag: CreateTagRequest): Promise<Tag> {
    return this.request<Tag>('POST', '/api/v1/tags', tag);
  }

  async getTag(uuid: string): Promise<Tag> {
    return this.request<Tag>('GET', `/api/v1/tags/${uuid}`);
  }

  async getTagByName(name: string): Promise<Tag | null> {
    try {
      const tags = await this.listTags();
      return tags.items.find((t) => t.name === name) || null;
    } catch {
      return null;
    }
  }

  async listTags(
    category?: string,
    limit = 100,
    cursor?: string
  ): Promise<CursorPaginatedResponse<Tag>> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (cursor) params.set('cursor', cursor);
    if (category) params.set('category', category);

    const result = await this.request<CursorPaginatedResponse<Tag>>(
      'GET',
      `/api/v1/tags?${params.toString()}`
    );

    return {
      items: result.items || [],
      next_cursor: result.next_cursor,
    };
  }

  // ============================================================================
  // Transform API
  // ============================================================================

  async createTransform(transform: CreateTransformRequest, projectUUID?: string): Promise<Transform> {
    return this.request<Transform>('POST', '/api/v1/transforms', transform, projectUUID);
  }

  async getTransform(uuid: string): Promise<Transform> {
    return this.request<Transform>('GET', `/api/v1/transforms/${uuid}`);
  }

  async listTransforms(
    domain?: string,
    limit = 20,
    cursor?: string
  ): Promise<CursorPaginatedResponse<Transform>> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (cursor) params.set('cursor', cursor);
    if (domain) params.set('domain', domain);

    const result = await this.request<CursorPaginatedResponse<Transform>>(
      'GET',
      `/api/v1/transforms?${params.toString()}`
    );

    return {
      items: result.items || [],
      next_cursor: result.next_cursor,
    };
  }

  // ============================================================================
  // Project API (Gateway-only, not federated)
  // ============================================================================

  async createProject(project: CreateProjectRequest): Promise<Project> {
    return this.request<Project>('POST', '/api/v1/projects', project);
  }

  async getProject(uuid: string): Promise<Project> {
    return this.request<Project>('GET', `/api/v1/projects/${uuid}`);
  }

  async listProjects(
    agentUuid?: string,
    limit = 20,
    cursor?: string
  ): Promise<CursorPaginatedResponse<Project>> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (cursor) params.set('cursor', cursor);
    if (agentUuid) params.set('agent_uuid', agentUuid);

    const result = await this.request<CursorPaginatedResponse<Project>>(
      'GET',
      `/api/v1/projects?${params.toString()}`
    );

    return {
      items: result.items || [],
      next_cursor: result.next_cursor,
    };
  }

  async updateProject(
    uuid: string,
    updates: Partial<CreateProjectRequest>
  ): Promise<Project> {
    return this.request<Project>('PUT', `/api/v1/projects/${uuid}`, updates);
  }

  // ============================================================================
  // Trust Vote API
  // ============================================================================

  async createTrustVote(vote: CreateTrustVoteRequest): Promise<TrustVote> {
    return this.request<TrustVote>('POST', '/api/v1/votes', vote);
  }

  async getVotesForTarget(targetUuid: string): Promise<TrustVote[]> {
    return this.request<TrustVote[]>('GET', `/api/v1/votes?target=${targetUuid}`);
  }

  // ============================================================================
  // Health Check
  // ============================================================================

  async healthCheck(): Promise<{ status: string }> {
    return this.request<{ status: string }>('GET', '/health');
  }

  /**
   * Check if gateway is reachable
   */
  async isReachable(): Promise<boolean> {
    try {
      await this.healthCheck();
      return true;
    } catch {
      return false;
    }
  }
}
