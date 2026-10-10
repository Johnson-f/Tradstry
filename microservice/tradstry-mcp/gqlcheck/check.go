// Package gqlcheck validates GraphQL operations against the schema the Tradstry
// backend serves (backend/schema/graphql/schema.graphql), so tests catch a
// misspelt field or argument before it reaches a real server.
package gqlcheck

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"

	"github.com/vektah/gqlparser/v2"
	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/validator"
)

var schema = sync.OnceValues(func() (*ast.Schema, error) {
	_, file, _, _ := runtime.Caller(0)
	path := filepath.Join(filepath.Dir(file), "..", "..", "..", "backend", "schema", "graphql", "schema.graphql")
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read the backend schema: %w", err)
	}
	loaded, gqlErr := gqlparser.LoadSchema(&ast.Source{Name: "schema.graphql", Input: string(raw)})
	if gqlErr != nil {
		return nil, fmt.Errorf("parse the backend schema: %w", gqlErr)
	}
	return loaded, nil
})

// Document reports whether query is a valid operation against the schema.
func Document(query string) error {
	_, err := parse(query)
	return err
}

// Operation also checks that variables fit the operation's declared types.
func Operation(query string, variables map[string]any) error {
	doc, err := parse(query)
	if err != nil {
		return err
	}
	loaded, _ := schema()
	for _, op := range doc.Operations {
		if _, err := validator.VariableValues(loaded, op, variables); err != nil {
			return fmt.Errorf("variables for %s: %w", op.Name, err)
		}
	}
	return nil
}

func parse(query string) (*ast.QueryDocument, error) {
	loaded, err := schema()
	if err != nil {
		return nil, err
	}
	doc, errs := gqlparser.LoadQuery(loaded, query)
	if len(errs) > 0 {
		messages := make([]string, len(errs))
		for i, e := range errs {
			messages[i] = e.Message
		}
		return nil, fmt.Errorf("%s", strings.Join(messages, "; "))
	}
	return doc, nil
}
