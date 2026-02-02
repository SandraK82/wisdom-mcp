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
  PaginatedResponse,
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
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

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
    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
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
    return this.request<Agent>('POST', '/api/agents', agent);
  }

  async getAgent(uuid: string): Promise<Agent> {
    return this.request<Agent>('GET', `/api/agents/${uuid}`);
  }

  async listAgents(limit = 20, offset = 0): Promise<PaginatedResponse<Agent>> {
    return this.request<PaginatedResponse<Agent>>(
      'GET',
      `/api/agents?limit=${limit}&offset=${offset}`
    );
  }

  // ============================================================================
  // Fragment API
  // ============================================================================

  async createFragment(fragment: CreateFragmentRequest): Promise<Fragment> {
    return this.request<Fragment>('POST', '/api/fragments', fragment);
  }

  async getFragment(uuid: string): Promise<Fragment> {
    return this.request<Fragment>('GET', `/api/fragments/${uuid}`);
  }

  async searchFragments(
    params: SearchFragmentsRequest
  ): Promise<PaginatedResponse<Fragment>> {
    const queryParams = new URLSearchParams();
    if (params.query) queryParams.set('query', params.query);
    if (params.author) queryParams.set('author', params.author);
    if (params.project) queryParams.set('project', params.project);
    if (params.state) queryParams.set('state', params.state);
    if (params.limit) queryParams.set('limit', String(params.limit));
    if (params.offset) queryParams.set('offset', String(params.offset));
    if (params.tags) {
      for (const tag of params.tags) {
        queryParams.append('tag', tag);
      }
    }

    return this.request<PaginatedResponse<Fragment>>(
      'GET',
      `/api/fragments?${queryParams.toString()}`
    );
  }

  async listFragments(
    limit = 20,
    offset = 0
  ): Promise<PaginatedResponse<Fragment>> {
    return this.request<PaginatedResponse<Fragment>>(
      'GET',
      `/api/fragments?limit=${limit}&offset=${offset}`
    );
  }

  // ============================================================================
  // Relation API
  // ============================================================================

  async createRelation(relation: CreateRelationRequest): Promise<Relation> {
    return this.request<Relation>('POST', '/api/relations', relation);
  }

  async getRelation(uuid: string): Promise<Relation> {
    return this.request<Relation>('GET', `/api/relations/${uuid}`);
  }

  async getRelationsForEntity(
    entityUuid: string,
    direction?: 'source' | 'target' | 'both'
  ): Promise<Relation[]> {
    const params = new URLSearchParams();
    params.set('entity', entityUuid);
    if (direction) params.set('direction', direction);
    return this.request<Relation[]>('GET', `/api/relations?${params.toString()}`);
  }

  async listRelations(
    limit = 100,
    offset = 0
  ): Promise<PaginatedResponse<Relation>> {
    return this.request<PaginatedResponse<Relation>>(
      'GET',
      `/api/relations?limit=${limit}&offset=${offset}`
    );
  }

  // ============================================================================
  // Tag API
  // ============================================================================

  async createTag(tag: CreateTagRequest): Promise<Tag> {
    return this.request<Tag>('POST', '/api/tags', tag);
  }

  async getTag(uuid: string): Promise<Tag> {
    return this.request<Tag>('GET', `/api/tags/${uuid}`);
  }

  async getTagByName(name: string): Promise<Tag | null> {
    try {
      const tags = await this.listTags();
      return tags.data.find((t) => t.name === name) || null;
    } catch {
      return null;
    }
  }

  async listTags(
    category?: string,
    limit = 100,
    offset = 0
  ): Promise<PaginatedResponse<Tag>> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (category) params.set('category', category);
    return this.request<PaginatedResponse<Tag>>(
      'GET',
      `/api/tags?${params.toString()}`
    );
  }

  // ============================================================================
  // Transform API
  // ============================================================================

  async createTransform(transform: CreateTransformRequest): Promise<Transform> {
    return this.request<Transform>('POST', '/api/transforms', transform);
  }

  async getTransform(uuid: string): Promise<Transform> {
    return this.request<Transform>('GET', `/api/transforms/${uuid}`);
  }

  async listTransforms(
    domain?: string,
    limit = 20,
    offset = 0
  ): Promise<PaginatedResponse<Transform>> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (domain) params.set('domain', domain);
    return this.request<PaginatedResponse<Transform>>(
      'GET',
      `/api/transforms?${params.toString()}`
    );
  }

  // ============================================================================
  // Project API (Gateway-only, not federated)
  // ============================================================================

  async createProject(project: CreateProjectRequest): Promise<Project> {
    return this.request<Project>('POST', '/api/projects', project);
  }

  async getProject(uuid: string): Promise<Project> {
    return this.request<Project>('GET', `/api/projects/${uuid}`);
  }

  async listProjects(
    owner?: string,
    limit = 20,
    offset = 0
  ): Promise<PaginatedResponse<Project>> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (owner) params.set('owner', owner);
    return this.request<PaginatedResponse<Project>>(
      'GET',
      `/api/projects?${params.toString()}`
    );
  }

  async updateProject(
    uuid: string,
    updates: Partial<CreateProjectRequest>
  ): Promise<Project> {
    return this.request<Project>('PUT', `/api/projects/${uuid}`, updates);
  }

  // ============================================================================
  // Trust Vote API
  // ============================================================================

  async createTrustVote(vote: CreateTrustVoteRequest): Promise<TrustVote> {
    return this.request<TrustVote>('POST', '/api/votes', vote);
  }

  async getVotesForTarget(targetUuid: string): Promise<TrustVote[]> {
    return this.request<TrustVote[]>('GET', `/api/votes?target=${targetUuid}`);
  }

  // ============================================================================
  // Health Check
  // ============================================================================

  async healthCheck(): Promise<{ status: string }> {
    return this.request<{ status: string }>('GET', '/api/health');
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
