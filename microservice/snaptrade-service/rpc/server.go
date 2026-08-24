package rpc

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"snaptrade-service/client"
	"snaptrade-service/contract"
	pb "snaptrade-service/gen/snaptrade/v1"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
)

type Server struct {
	pb.UnimplementedSnapTradeAdapterServiceServer
	snapTrade *client.SnapTradeClient
	auth      *authenticator
}

func NewServer(snapTrade *client.SnapTradeClient, internalSecret string) (*Server, error) {
	auth, err := newAuthenticator(internalSecret)
	if err != nil {
		return nil, err
	}
	return &Server{snapTrade: snapTrade, auth: auth}, nil
}

func (s *Server) authenticate(method string, auth *pb.RequestAuth, request proto.Message, clearAuth func()) error {
	clearAuth()
	payload, err := proto.MarshalOptions{Deterministic: true}.Marshal(request)
	if err != nil {
		return status.Error(codes.Internal, "failed to authenticate request")
	}
	if err := s.auth.verify(method, auth, payload); err != nil {
		return status.Error(codes.Unauthenticated, "invalid internal authentication")
	}
	return nil
}

func commercialCredentials(value *pb.ApiCredentials) (string, string, error) {
	commercial := value.GetCommercial()
	if commercial == nil || commercial.UserId == "" || commercial.UserSecret == "" {
		return "", "", status.Error(codes.InvalidArgument, "user credentials are required")
	}
	return commercial.UserId, commercial.UserSecret, nil
}

func oauthAccessToken(value *pb.ApiCredentials) string {
	if value == nil || value.GetOauth() == nil {
		return ""
	}
	return value.GetOauth().AccessToken
}

func (s *Server) RegisterUser(ctx context.Context, request *pb.RegisterUserRequest) (*pb.RegisterUserResponse, error) {
	if err := s.authenticate(pb.SnapTradeAdapterService_RegisterUser_FullMethodName, request.Auth, request, func() { request.Auth = nil }); err != nil {
		return nil, err
	}
	if request.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user ID is required")
	}
	value, meta, err := s.snapTrade.CreateUser(request.UserId)
	if err != nil {
		return nil, upstreamError(ctx, "failed to register SnapTrade user", err)
	}
	return &pb.RegisterUserResponse{Meta: responseMeta(meta), User: &pb.UserRegistration{UserId: value.UserID, UserSecret: value.UserSecret}}, nil
}

func (s *Server) DeleteUser(ctx context.Context, request *pb.DeleteUserRequest) (*pb.DeleteUserResponse, error) {
	if err := s.authenticate(pb.SnapTradeAdapterService_DeleteUser_FullMethodName, request.Auth, request, func() { request.Auth = nil }); err != nil {
		return nil, err
	}
	if request.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user ID is required")
	}
	meta, err := s.snapTrade.DeleteUser(request.UserId)
	if err != nil {
		return nil, upstreamError(ctx, "failed to delete SnapTrade user", err)
	}
	return &pb.DeleteUserResponse{Meta: responseMeta(meta), Accepted: true}, nil
}

func (s *Server) InitiateConnection(ctx context.Context, request *pb.InitiateConnectionRequest) (*pb.InitiateConnectionResponse, error) {
	if err := s.authenticate(pb.SnapTradeAdapterService_InitiateConnection_FullMethodName, request.Auth, request, func() { request.Auth = nil }); err != nil {
		return nil, err
	}
	if request.UserId == "" || request.UserSecret == "" {
		return nil, status.Error(codes.InvalidArgument, "user credentials are required")
	}
	connectionType := request.ConnectionType
	if connectionType == "" {
		connectionType = "read"
	}
	value, meta, err := s.snapTrade.GenerateConnectionPortalURL(
		request.UserId, request.UserSecret, stringValue(request.BrokerageId), connectionType,
		stringValue(request.CustomRedirect), stringValue(request.Reconnect),
	)
	if err != nil {
		return nil, upstreamError(ctx, "failed to generate connection portal URL", err)
	}
	return &pb.InitiateConnectionResponse{Meta: responseMeta(meta), Portal: &pb.ConnectionPortal{RedirectUrl: value.RedirectURL, SessionId: value.SessionID}}, nil
}

func (s *Server) GetConnection(ctx context.Context, request *pb.GetConnectionRequest) (*pb.GetConnectionResponse, error) {
	if err := s.authenticate(pb.SnapTradeAdapterService_GetConnection_FullMethodName, request.Auth, request, func() { request.Auth = nil }); err != nil {
		return nil, err
	}
	var value contract.Connection
	var meta contract.ResponseMeta
	var err error
	if token := oauthAccessToken(request.Credentials); token != "" {
		value, meta, err = s.snapTrade.GetConnectionOAuth(token, request.ConnectionId)
	} else {
		userID, secret, credentialErr := commercialCredentials(request.Credentials)
		if credentialErr != nil {
			return nil, credentialErr
		}
		value, meta, err = s.snapTrade.GetConnection(userID, secret, request.ConnectionId)
	}
	if err != nil {
		return nil, upstreamError(ctx, "failed to get connection", err)
	}
	return &pb.GetConnectionResponse{Meta: responseMeta(meta), Connection: connection(value)}, nil
}

func (s *Server) ListConnections(ctx context.Context, request *pb.ListConnectionsRequest) (*pb.ListConnectionsResponse, error) {
	if err := s.authenticate(pb.SnapTradeAdapterService_ListConnections_FullMethodName, request.Auth, request, func() { request.Auth = nil }); err != nil {
		return nil, err
	}
	var values []contract.Connection
	var meta contract.ResponseMeta
	var err error
	if token := oauthAccessToken(request.Credentials); token != "" {
		values, meta, err = s.snapTrade.ListConnectionsOAuth(token)
	} else {
		userID, secret, credentialErr := commercialCredentials(request.Credentials)
		if credentialErr != nil {
			return nil, credentialErr
		}
		values, meta, err = s.snapTrade.ListConnections(userID, secret)
	}
	if err != nil {
		return nil, upstreamError(ctx, "failed to list connections", err)
	}
	result := make([]*pb.Connection, 0, len(values))
	for _, value := range values {
		result = append(result, connection(value))
	}
	return &pb.ListConnectionsResponse{Meta: responseMeta(meta), Connections: result}, nil
}

func (s *Server) RefreshConnection(ctx context.Context, request *pb.RefreshConnectionRequest) (*pb.RefreshConnectionResponse, error) {
	if err := s.authenticate(pb.SnapTradeAdapterService_RefreshConnection_FullMethodName, request.Auth, request, func() { request.Auth = nil }); err != nil {
		return nil, err
	}
	userID, secret, err := commercialCredentials(request.Credentials)
	if err != nil {
		return nil, err
	}
	value, meta, err := s.snapTrade.RefreshConnection(userID, secret, request.ConnectionId)
	if err != nil {
		return nil, upstreamError(ctx, "failed to queue connection refresh", err)
	}
	return &pb.RefreshConnectionResponse{Meta: responseMeta(meta), Result: &pb.RefreshResult{ConnectionId: value.ConnectionID, Status: value.Status}}, nil
}

func (s *Server) DeleteConnection(ctx context.Context, request *pb.DeleteConnectionRequest) (*pb.DeleteConnectionResponse, error) {
	if err := s.authenticate(pb.SnapTradeAdapterService_DeleteConnection_FullMethodName, request.Auth, request, func() { request.Auth = nil }); err != nil {
		return nil, err
	}
	userID, secret, err := commercialCredentials(request.Credentials)
	if err != nil {
		return nil, err
	}
	meta, err := s.snapTrade.DeleteConnection(userID, secret, request.ConnectionId)
	if err != nil {
		return nil, upstreamError(ctx, "failed to delete connection", err)
	}
	return &pb.DeleteConnectionResponse{Meta: responseMeta(meta), Deleted: true}, nil
}

func (s *Server) ListAccounts(ctx context.Context, request *pb.ListAccountsRequest) (*pb.ListAccountsResponse, error) {
	if err := s.authenticate(pb.SnapTradeAdapterService_ListAccounts_FullMethodName, request.Auth, request, func() { request.Auth = nil }); err != nil {
		return nil, err
	}
	var values []contract.Account
	var meta contract.ResponseMeta
	var err error
	if token := oauthAccessToken(request.Credentials); token != "" {
		values, meta, err = s.snapTrade.ListAccountsOAuth(token)
	} else {
		userID, secret, credentialErr := commercialCredentials(request.Credentials)
		if credentialErr != nil {
			return nil, credentialErr
		}
		values, meta, err = s.snapTrade.ListAccounts(userID, secret)
	}
	if err != nil {
		return nil, upstreamError(ctx, "failed to list accounts", err)
	}
	result := make([]*pb.Account, 0, len(values))
	for _, value := range values {
		result = append(result, account(value))
	}
	return &pb.ListAccountsResponse{Meta: responseMeta(meta), Accounts: result}, nil
}

func (s *Server) GetAccount(ctx context.Context, request *pb.GetAccountRequest) (*pb.GetAccountResponse, error) {
	if err := s.authenticate(pb.SnapTradeAdapterService_GetAccount_FullMethodName, request.Auth, request, func() { request.Auth = nil }); err != nil {
		return nil, err
	}
	var value contract.Account
	var meta contract.ResponseMeta
	var err error
	if token := oauthAccessToken(request.Credentials); token != "" {
		value, meta, err = s.snapTrade.GetAccountOAuth(token, request.AccountId)
	} else {
		userID, secret, credentialErr := commercialCredentials(request.Credentials)
		if credentialErr != nil {
			return nil, credentialErr
		}
		value, meta, err = s.snapTrade.GetAccount(userID, secret, request.AccountId)
	}
	if err != nil {
		return nil, upstreamError(ctx, "failed to get account", err)
	}
	return &pb.GetAccountResponse{Meta: responseMeta(meta), Account: account(value)}, nil
}

func (s *Server) GetPortfolioSnapshot(ctx context.Context, request *pb.GetPortfolioSnapshotRequest) (*pb.GetPortfolioSnapshotResponse, error) {
	if err := s.authenticate(pb.SnapTradeAdapterService_GetPortfolioSnapshot_FullMethodName, request.Auth, request, func() { request.Auth = nil }); err != nil {
		return nil, err
	}
	var value contract.PortfolioSnapshot
	var meta contract.ResponseMeta
	var err error
	if token := oauthAccessToken(request.Credentials); token != "" {
		value, meta, err = s.snapTrade.GetPortfolioSnapshotOAuth(token, request.AccountId)
	} else {
		userID, secret, credentialErr := commercialCredentials(request.Credentials)
		if credentialErr != nil {
			return nil, credentialErr
		}
		value, meta, err = s.snapTrade.GetPortfolioSnapshot(userID, secret, request.AccountId)
	}
	if err != nil {
		return nil, upstreamError(ctx, "failed to get complete portfolio snapshot", err)
	}
	return &pb.GetPortfolioSnapshotResponse{Meta: responseMeta(meta), Snapshot: portfolio(value)}, nil
}

func (s *Server) GetActivities(ctx context.Context, request *pb.GetActivitiesRequest) (*pb.GetActivitiesResponse, error) {
	if err := s.authenticate(pb.SnapTradeAdapterService_GetActivities_FullMethodName, request.Auth, request, func() { request.Auth = nil }); err != nil {
		return nil, err
	}
	var value contract.ActivitiesPage
	var meta contract.ResponseMeta
	var err error
	if token := oauthAccessToken(request.Credentials); token != "" {
		value, meta, err = s.snapTrade.GetActivitiesOAuth(
			token, request.AccountId, request.StartDate, request.EndDate,
			request.ActivityType, request.Offset, request.Limit,
		)
	} else {
		userID, secret, credentialErr := commercialCredentials(request.Credentials)
		if credentialErr != nil {
			return nil, credentialErr
		}
		value, meta, err = s.snapTrade.GetActivities(
			userID, secret, request.AccountId, request.StartDate, request.EndDate,
			request.ActivityType, request.Offset, request.Limit,
		)
	}
	if err != nil {
		return nil, upstreamError(ctx, "failed to get account activities", err)
	}
	return &pb.GetActivitiesResponse{Meta: responseMeta(meta), Page: activities(value)}, nil
}

func (s *Server) BeginOAuth(ctx context.Context, request *pb.BeginOAuthRequest) (*pb.BeginOAuthResponse, error) {
	if err := s.authenticate(pb.SnapTradeAdapterService_BeginOAuth_FullMethodName, request.Auth, request, func() { request.Auth = nil }); err != nil {
		return nil, err
	}
	if request.State == "" || request.CodeChallenge == "" || request.RedirectUri == "" || len(request.Scopes) == 0 {
		return nil, status.Error(codes.InvalidArgument, "complete OAuth authorization parameters are required")
	}
	value, meta, err := s.snapTrade.BeginOAuth(request.State, request.CodeChallenge, request.RedirectUri, request.Scopes)
	if err != nil {
		return nil, upstreamError(ctx, "failed to begin SnapTrade OAuth", err)
	}
	return &pb.BeginOAuthResponse{Meta: responseMeta(meta), AuthorizationUrl: value}, nil
}

func (s *Server) ExchangeOAuthCode(ctx context.Context, request *pb.ExchangeOAuthCodeRequest) (*pb.ExchangeOAuthCodeResponse, error) {
	if err := s.authenticate(pb.SnapTradeAdapterService_ExchangeOAuthCode_FullMethodName, request.Auth, request, func() { request.Auth = nil }); err != nil {
		return nil, err
	}
	if request.Code == "" || request.CodeVerifier == "" || request.RedirectUri == "" {
		return nil, status.Error(codes.InvalidArgument, "complete OAuth code exchange parameters are required")
	}
	value, meta, err := s.snapTrade.ExchangeOAuthCode(request.Code, request.CodeVerifier, request.RedirectUri)
	if err != nil {
		return nil, upstreamError(ctx, "failed to exchange SnapTrade OAuth code", err)
	}
	return &pb.ExchangeOAuthCodeResponse{Meta: responseMeta(meta), Tokens: oauthTokens(value)}, nil
}

func (s *Server) RefreshOAuthToken(ctx context.Context, request *pb.RefreshOAuthTokenRequest) (*pb.RefreshOAuthTokenResponse, error) {
	if err := s.authenticate(pb.SnapTradeAdapterService_RefreshOAuthToken_FullMethodName, request.Auth, request, func() { request.Auth = nil }); err != nil {
		return nil, err
	}
	if request.RefreshToken == "" {
		return nil, status.Error(codes.InvalidArgument, "refresh token is required")
	}
	value, meta, err := s.snapTrade.RefreshOAuthToken(request.RefreshToken)
	if err != nil {
		return nil, upstreamError(ctx, "failed to refresh SnapTrade OAuth token", err)
	}
	return &pb.RefreshOAuthTokenResponse{Meta: responseMeta(meta), Tokens: oauthTokens(value)}, nil
}

func (s *Server) RevokeOAuthToken(ctx context.Context, request *pb.RevokeOAuthTokenRequest) (*pb.RevokeOAuthTokenResponse, error) {
	if err := s.authenticate(pb.SnapTradeAdapterService_RevokeOAuthToken_FullMethodName, request.Auth, request, func() { request.Auth = nil }); err != nil {
		return nil, err
	}
	if request.Token == "" {
		return nil, status.Error(codes.InvalidArgument, "token is required")
	}
	meta, err := s.snapTrade.RevokeOAuthToken(request.Token)
	if err != nil {
		return nil, upstreamError(ctx, "failed to revoke SnapTrade OAuth token", err)
	}
	return &pb.RevokeOAuthTokenResponse{Meta: responseMeta(meta), Revoked: true}, nil
}

func oauthTokens(value contract.OAuthTokens) *pb.OAuthTokens {
	return &pb.OAuthTokens{
		AccessToken: value.AccessToken, RefreshToken: value.RefreshToken,
		ExpiresIn: value.ExpiresIn, Scopes: value.Scopes,
		OauthClientId: value.OAuthClientID, SnaptradeUserId: value.SnapTradeUserID,
	}
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func upstreamError(ctx context.Context, message string, err error) error {
	var apiErr *client.SnapTradeAPIError
	if !errors.As(err, &apiErr) {
		_ = grpc.SetTrailer(ctx, metadata.Pairs("x-adapter-code", "UPSTREAM_UNAVAILABLE", "x-retryable", "true"))
		return status.Error(codes.Unavailable, message)
	}
	code := codes.Unknown
	switch apiErr.Status {
	case http.StatusBadRequest:
		code = codes.InvalidArgument
	case http.StatusUnauthorized:
		code = codes.Unauthenticated
	case http.StatusForbidden:
		code = codes.PermissionDenied
	case http.StatusNotFound:
		code = codes.NotFound
	case http.StatusConflict:
		code = codes.Aborted
	case http.StatusTooManyRequests:
		code = codes.ResourceExhausted
	default:
		if apiErr.Status >= 500 {
			code = codes.Unavailable
		}
	}
	adapterCode := "SNAPTRADE_REJECTED"
	retryable := apiErr.Status == http.StatusTooManyRequests || apiErr.Status >= 500
	if apiErr.Status == http.StatusTooManyRequests {
		adapterCode = "RATE_LIMITED"
	}
	trailers := []string{
		"x-adapter-code", adapterCode,
		"x-retryable", strconv.FormatBool(retryable),
		"x-upstream-status", strconv.Itoa(apiErr.Status),
	}
	if apiErr.Code != "" {
		trailers = append(trailers, "x-upstream-code", apiErr.Code)
	}
	if apiErr.Meta.RateLimit != nil {
		retryAfter := apiErr.Meta.RateLimit.AccountReset
		if retryAfter == nil {
			retryAfter = apiErr.Meta.RateLimit.ResetSeconds
		}
		if retryAfter != nil {
			trailers = append(trailers, "x-retry-after-seconds", strconv.Itoa(*retryAfter))
		}
	}
	if trailerErr := grpc.SetTrailer(ctx, metadata.Pairs(trailers...)); trailerErr != nil {
		return status.Error(codes.Internal, fmt.Sprintf("failed to set adapter error metadata: %v", trailerErr))
	}
	return status.Error(code, message)
}
