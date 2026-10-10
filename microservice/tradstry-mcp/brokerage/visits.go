package brokerage

import (
	"crypto/rand"
	"html/template"
	"net/http"
	"sync"
	"time"
)

const (
	portalLandingPath = "/brokerage/connected"
	oauthLandingPath  = "/brokerage/snaptrade-authorized"
	visitTTL          = 30 * time.Minute
)

// visit is one trip to SnapTrade. For the connection portal, SnapTrade sends
// the browser back to the portal landing page with the outcome, which the next
// finish_brokerage_connection call picks up. For SnapTrade OAuth the backend
// records the outcome against attemptID itself.
type visit struct {
	state        string
	attemptID    string
	subject      string
	workspaceID  string
	started      time.Time
	landed       bool
	status       string
	connectionID string
	errorCode    string
}

// visits lives in memory: if the server restarts mid-connection, the user just
// starts again from the chat.
type visits struct {
	mu      sync.Mutex
	byState map[string]*visit
	now     func() time.Time
}

func newVisits() *visits {
	return &visits{byState: map[string]*visit{}, now: time.Now}
}

// start records a new visit and returns its unguessable state, which rides in
// the portal's return URL. attemptID is set for SnapTrade OAuth visits.
func (v *visits) start(subject, workspaceID, attemptID string) string {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.prune()
	state := rand.Text()
	v.byState[state] = &visit{state: state, attemptID: attemptID, subject: subject, workspaceID: workspaceID, started: v.now()}
	return state
}

func (v *visits) land(state, status, connectionID, errorCode string) bool {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.prune()
	found, ok := v.byState[state]
	if !ok {
		return false
	}
	found.landed, found.status, found.connectionID, found.errorCode = true, status, connectionID, errorCode
	return true
}

// latest returns the most recent visit subject started for workspaceID.
func (v *visits) latest(subject, workspaceID string) (visit, bool) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.prune()
	var newest *visit
	for _, candidate := range v.byState {
		if candidate.subject == subject && candidate.workspaceID == workspaceID &&
			(newest == nil || candidate.started.After(newest.started)) {
			newest = candidate
		}
	}
	if newest == nil {
		return visit{}, false
	}
	return *newest, true
}

func (v *visits) forget(state string) {
	v.mu.Lock()
	defer v.mu.Unlock()
	delete(v.byState, state)
}

func (v *visits) prune() {
	cutoff := v.now().Add(-visitTTL)
	for state, candidate := range v.byState {
		if candidate.started.Before(cutoff) {
			delete(v.byState, state)
		}
	}
}

var landingPage = template.Must(template.New("landing").Parse(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tradstry</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#111}h1{font-size:1.4rem}p{color:#444;line-height:1.5}</style>
</head>
<body><h1>{{.Title}}</h1><p>{{.Body}}</p></body>
</html>`))

type page struct{ Title, Body string }

var backToChat = page{
	"You can go back to your chat",
	"Tell the assistant you're done and it will finish connecting your brokerage to Tradstry.",
}

// routes serves the pages SnapTrade returns the browser to.
func (v *visits) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET "+portalLandingPath, func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()
		status := query.Get("status")
		switch {
		case !v.land(query.Get("state"), status, query.Get("connection_id"), query.Get("error_code")):
			render(w, http.StatusNotFound, page{"This link has expired", "Ask the assistant in your chat to start connecting your brokerage again."})
		default:
			render(w, http.StatusOK, outcomePage(status == "SUCCESS", status == "ABANDONED"))
		}
	})
	mux.HandleFunc("GET "+oauthLandingPath, func(w http.ResponseWriter, r *http.Request) {
		status := r.URL.Query().Get("status")
		render(w, http.StatusOK, outcomePage(status == "authorized", status == "denied"))
	})
	return mux
}

func outcomePage(succeeded, cancelled bool) page {
	switch {
	case succeeded:
		return backToChat
	case cancelled:
		return page{"No brokerage was connected", backToChat.Body}
	}
	return page{"The brokerage did not connect", "Go back to your chat; the assistant can tell you what happened and try again."}
}

func render(w http.ResponseWriter, code int, p page) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(code)
	_ = landingPage.Execute(w, p)
}
