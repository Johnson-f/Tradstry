package oauth

import (
	"net/http"

	sdkauth "github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/oauthex"
)

const (
	rootMetadataPath = "/.well-known/oauth-protected-resource"
	MetadataPath     = rootMetadataPath + "/mcp"
)

// RegisterMetadata serves RFC 9728 protected-resource metadata pointing MCP
// clients at the OAuth issuer. Some clients look it up at the origin, others at the path
// of the MCP endpoint, so both are served.
func RegisterMetadata(mux *http.ServeMux, publicURL, issuer string) {
	mux.Handle(rootMetadataPath, metadataHandler(publicURL, issuer))
	mux.Handle(MetadataPath, metadataHandler(publicURL+"/mcp", issuer))
}

func metadataHandler(resource, issuer string) http.Handler {
	return sdkauth.ProtectedResourceMetadataHandler(&oauthex.ProtectedResourceMetadata{
		Resource:               resource,
		AuthorizationServers:   []string{issuer},
		BearerMethodsSupported: []string{"header"},
		ScopesSupported:        []string{"openid", "profile", "email", "offline_access"},
		ResourceName:           "Tradstry",
	})
}
