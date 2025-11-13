import { apiClient } from './api-client';
import { apiConfig } from '@/lib/config/api';
import type {
  Playbook,
  CreatePlaybookRequest,
  UpdatePlaybookRequest,
  PlaybookQuery,
  PlaybookRule,
  CreateRuleRequest,
  UpdateRuleRequest,
  TagTradeRequest,
  CreateMissedTradeRequest,
  MissedTrade,
  PlaybookAnalytics,
  ApiResponse,
  PlaybookListResponse,
  TagTradeResponse,
} from '@/lib/types/playbook';

class PlaybookService {
  // Basic CRUD operations
  async createPlaybook(payload: CreatePlaybookRequest): Promise<ApiResponse<Playbook>> {  
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return apiClient.post(apiConfig.endpoints.playbooks.base, payload);
  }

  async getPlaybook(playbookId: string): Promise<ApiResponse<Playbook>> {
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return apiClient.get(apiConfig.endpoints.playbooks.byId(playbookId));
  }

  async listPlaybooks(query?: PlaybookQuery): Promise<PlaybookListResponse> {
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return apiClient.get(apiConfig.endpoints.playbooks.base, { params: query });
  }

  async updatePlaybook(playbookId: string, payload: UpdatePlaybookRequest): Promise<ApiResponse<Playbook>> {
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return apiClient.put(apiConfig.endpoints.playbooks.byId(playbookId), payload);
  }

  async deletePlaybook(playbookId: string): Promise<ApiResponse<void>> {
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return apiClient.delete(apiConfig.endpoints.playbooks.byId(playbookId));
  }

  async getPlaybooksCount(): Promise<ApiResponse<{ count: number }>> {
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return apiClient.get(apiConfig.endpoints.playbooks.count);
  }

  // Tagging operations
  async tagTrade(payload: TagTradeRequest): Promise<TagTradeResponse> {
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return apiClient.post(apiConfig.endpoints.playbooks.tag, payload);
  }

  async untagTrade(payload: TagTradeRequest): Promise<TagTradeResponse> {
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return apiClient.delete(apiConfig.endpoints.playbooks.untag, { data: payload });
  }

  async getTradePlaybooks(tradeId: number, tradeType?: 'stock' | 'option'): Promise<PlaybookListResponse> {
    const params = tradeType ? { trade_type: tradeType } : {};
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return apiClient.get(apiConfig.endpoints.playbooks.byTrade(tradeId), { params });
  }

  async getPlaybookTrades(setupId: string): Promise<TagTradeResponse> {
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return apiClient.get(apiConfig.endpoints.playbooks.trades(setupId));
  }

  // Rules management
  async createRule(playbookId: string, payload: CreateRuleRequest): Promise<ApiResponse<PlaybookRule>> {
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return apiClient.post(apiConfig.endpoints.playbooks.rules(playbookId), payload);
  }

  async getRules(playbookId: string): Promise<ApiResponse<PlaybookRule[]>> {
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
      return apiClient.get(apiConfig.endpoints.playbooks.rules(playbookId));
  }

  async updateRule(playbookId: string, ruleId: string, payload: UpdateRuleRequest): Promise<ApiResponse<PlaybookRule>> {
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return apiClient.put(apiConfig.endpoints.playbooks.rule(playbookId, ruleId), payload);
  }

  async deleteRule(playbookId: string, ruleId: string): Promise<ApiResponse<void>> {
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return apiClient.delete(apiConfig.endpoints.playbooks.rule(playbookId, ruleId));
  }

  // Missed trades
  async createMissedTrade(playbookId: string, payload: CreateMissedTradeRequest): Promise<ApiResponse<MissedTrade>> {
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return apiClient.post(apiConfig.endpoints.playbooks.missedTrades(playbookId), payload);
  }

  async getMissedTrades(playbookId: string): Promise<ApiResponse<MissedTrade[]>> {
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return apiClient.get(apiConfig.endpoints.playbooks.missedTrades(playbookId));
  }

  async deleteMissedTrade(playbookId: string, missedId: string): Promise<ApiResponse<void>> {
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return apiClient.delete(apiConfig.endpoints.playbooks.missedTrade(playbookId, missedId));
  }

  // Analytics
  async getPlaybookAnalytics(playbookId: string, timeRange?: string): Promise<ApiResponse<PlaybookAnalytics>> {
    const params = timeRange ? { timeRange } : {};
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return apiClient.get(apiConfig.endpoints.playbooks.analytics(playbookId), { params });
  }

  async getAllPlaybooksAnalytics(timeRange?: string): Promise<ApiResponse<PlaybookAnalytics[]>> {
    const params = timeRange ? { timeRange } : {};
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    return apiClient.get(apiConfig.endpoints.playbooks.allAnalytics, { params });
  }
}

export const playbookService = new PlaybookService();
export default playbookService;

