package client

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"snaptrade-service/contract"

	snaptrade "github.com/passiv/snaptrade-sdks/sdks/go"
)

func (c *SnapTradeClient) ListConnectionsOAuth(accessToken string) ([]contract.Connection, contract.ResponseMeta, error) {
	var raw []snaptrade.BrokerageAuthorization
	meta, err := c.bearerJSON(accessToken, "/authorizations", nil, &raw)
	if err != nil {
		return nil, meta, err
	}
	values := make([]contract.Connection, 0, len(raw))
	for index := range raw {
		value, err := normalizeConnection(&raw[index])
		if err != nil {
			return nil, meta, err
		}
		values = append(values, value)
	}
	return values, meta, nil
}

func (c *SnapTradeClient) GetConnectionOAuth(accessToken, connectionID string) (contract.Connection, contract.ResponseMeta, error) {
	var raw snaptrade.BrokerageAuthorization
	meta, err := c.bearerJSON(accessToken, "/authorizations/"+url.PathEscape(connectionID), nil, &raw)
	if err != nil {
		return contract.Connection{}, meta, err
	}
	value, err := normalizeConnection(&raw)
	return value, meta, err
}

func (c *SnapTradeClient) ListAccountsOAuth(accessToken string) ([]contract.Account, contract.ResponseMeta, error) {
	var raw []snaptrade.Account
	meta, err := c.bearerJSON(accessToken, "/api/v1/accounts", nil, &raw)
	if err != nil {
		return nil, meta, err
	}
	values := make([]contract.Account, 0, len(raw))
	for index := range raw {
		value, err := normalizeAccount(&raw[index])
		if err != nil {
			return nil, meta, err
		}
		values = append(values, value)
	}
	return values, meta, nil
}

func (c *SnapTradeClient) GetAccountOAuth(accessToken, accountID string) (contract.Account, contract.ResponseMeta, error) {
	var raw snaptrade.Account
	meta, err := c.bearerJSON(accessToken, "/accounts/"+url.PathEscape(accountID), nil, &raw)
	if err != nil {
		return contract.Account{}, meta, err
	}
	value, err := normalizeAccount(&raw)
	return value, meta, err
}

func (c *SnapTradeClient) GetActivitiesOAuth(
	accessToken, accountID string,
	startDate, endDate, activityType *string,
	offset, limit *int32,
) (contract.ActivitiesPage, contract.ResponseMeta, error) {
	query := url.Values{}
	if startDate != nil {
		query.Set("startDate", *startDate)
	}
	if endDate != nil {
		query.Set("endDate", *endDate)
	}
	if activityType != nil {
		query.Set("type", *activityType)
	}
	if offset != nil {
		query.Set("offset", fmt.Sprintf("%d", *offset))
	}
	if limit != nil {
		query.Set("limit", fmt.Sprintf("%d", *limit))
	}
	var raw struct {
		Data       []contract.Activity  `json:"data"`
		Pagination *contract.Pagination `json:"pagination"`
	}
	meta, err := c.bearerJSON(accessToken, "/accounts/"+url.PathEscape(accountID)+"/activities", query, &raw)
	if err != nil {
		return contract.ActivitiesPage{}, meta, err
	}
	return contract.ActivitiesPage{Activities: raw.Data, Pagination: raw.Pagination}, meta, nil
}

func (c *SnapTradeClient) GetPortfolioSnapshotOAuth(accessToken, accountID string) (contract.PortfolioSnapshot, contract.ResponseMeta, error) {
	account, meta, err := c.GetAccountOAuth(accessToken, accountID)
	if err != nil {
		return contract.PortfolioSnapshot{}, meta, err
	}
	snapshot := contract.PortfolioSnapshot{
		AccountID: accountID, Positions: []contract.Position{}, Balances: []contract.Balance{},
		Orders: []contract.Order{}, TotalValue: account.TotalValue,
	}
	if account.SyncStatus != nil && account.SyncStatus.Holdings != nil {
		snapshot.HoldingsUnavailable = account.SyncStatus.Holdings.HoldingsUnavailable
	}
	if snapshot.HoldingsUnavailable {
		return snapshot, meta, nil
	}
	var positions allAccountPositionsResponse
	positionMeta, err := c.bearerJSON(accessToken, "/accounts/"+url.PathEscape(accountID)+"/positions/all", nil, &positions)
	meta = MergeMeta(meta, positionMeta)
	if err != nil {
		return contract.PortfolioSnapshot{}, meta, err
	}
	snapshot.Positions, err = normalizePositions(positions)
	if err != nil {
		return contract.PortfolioSnapshot{}, meta, err
	}
	snapshot.AsOf = positions.DataFreshness.AsOf

	var balances []snaptrade.Balance
	balanceMeta, err := c.bearerJSON(accessToken, "/accounts/"+url.PathEscape(accountID)+"/balances", nil, &balances)
	meta = MergeMeta(meta, balanceMeta)
	if err != nil {
		return contract.PortfolioSnapshot{}, meta, err
	}
	snapshot.Balances, err = normalizeBalances(balances)
	if err != nil {
		return contract.PortfolioSnapshot{}, meta, err
	}

	var orders []snaptrade.AccountOrderRecord
	orderMeta, err := c.bearerJSON(accessToken, "/accounts/"+url.PathEscape(accountID)+"/orders", nil, &orders)
	meta = MergeMeta(meta, orderMeta)
	if err != nil {
		return contract.PortfolioSnapshot{}, meta, err
	}
	snapshot.Orders, err = normalizeOrders(orders)
	if err != nil {
		return contract.PortfolioSnapshot{}, meta, err
	}
	snapshot.Complete = true
	return snapshot, meta, nil
}

func (c *SnapTradeClient) bearerJSON(accessToken, path string, query url.Values, output any) (contract.ResponseMeta, error) {
	requestURL := strings.TrimRight(c.baseURL, "/") + path
	if len(query) > 0 {
		requestURL += "?" + query.Encode()
	}
	request, err := http.NewRequest(http.MethodGet, requestURL, nil)
	if err != nil {
		return contract.ResponseMeta{}, fmt.Errorf("build OAuth API request: %w", err)
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Authorization", "Bearer "+accessToken)
	response, err := c.httpClient.Do(request)
	if err != nil {
		return contract.ResponseMeta{}, fmt.Errorf("SnapTrade OAuth API request failed")
	}
	defer response.Body.Close()
	meta := ResponseMeta(response)
	body, err := io.ReadAll(io.LimitReader(response.Body, 16<<20))
	if err != nil {
		return meta, fmt.Errorf("read SnapTrade OAuth API response: %w", err)
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return meta, NewSnapTradeAPIError(response, body, fmt.Errorf("SnapTrade OAuth API request failed"))
	}
	if err := json.Unmarshal(body, output); err != nil {
		return meta, fmt.Errorf("decode SnapTrade OAuth API response: %w", err)
	}
	return meta, nil
}
