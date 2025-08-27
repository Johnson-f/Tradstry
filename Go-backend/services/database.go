package services

import (
	"context"
	"fmt"
	"log"

	"github.com/Johnson-f/tradistry_backend/config"
	"github.com/supabase-community/supabase-go"
)

// DatabaseService handles Supabase database operations
type DatabaseService struct {
	client *supabase.Client
	config *config.Config
}

// NewDatabaseService creates a new database service instance
func NewDatabaseService(cfg *config.Config) (*DatabaseService, error) {
	if cfg.Supabase.URL == "" || cfg.Supabase.AnonKey == "" {
		return nil, fmt.Errorf("supabase configuration is required")
	}

	client, err := supabase.NewClient(cfg.Supabase.URL, cfg.Supabase.AnonKey, &supabase.ClientOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to create supabase client: %w", err)
	}

	return &DatabaseService{
		client: client,
		config: cfg,
	}, nil
}

// GetClient returns the Supabase client
func (db *DatabaseService) GetClient() *supabase.Client {
	return db.client
}

// Insert inserts a record into the specified table
func (db *DatabaseService) Insert(ctx context.Context, table string, data interface{}) error {
	_, _, err := db.client.From(table).Insert(data, false, "", "", "").Execute()
	if err != nil {
		return fmt.Errorf("failed to insert into %s: %w", table, err)
	}
	return nil
}

// Select performs a select query on the specified table
func (db *DatabaseService) Select(ctx context.Context, table string, columns string, filters map[string]interface{}, result interface{}) error {
	query := db.client.From(table).Select(columns, "", false)
	
	// Apply filters
	for key, value := range filters {
		query = query.Eq(key, fmt.Sprintf("%v", value))
	}
	
	_, err := query.ExecuteTo(result)
	if err != nil {
		return fmt.Errorf("failed to select from %s: %w", table, err)
	}
	return nil
}

// Update updates records in the specified table
func (db *DatabaseService) Update(ctx context.Context, table string, data interface{}, filters map[string]interface{}) error {
	query := db.client.From(table).Update(data, "", "")
	
	// Apply filters
	for key, value := range filters {
		query = query.Eq(key, fmt.Sprintf("%v", value))
	}
	
	_, _, err := query.Execute()
	if err != nil {
		return fmt.Errorf("failed to update %s: %w", table, err)
	}
	return nil
}

// Delete deletes records from the specified table
func (db *DatabaseService) Delete(ctx context.Context, table string, filters map[string]interface{}) error {
	query := db.client.From(table).Delete("", "")
	
	// Apply filters
	for key, value := range filters {
		query = query.Eq(key, fmt.Sprintf("%v", value))
	}
	
	_, _, err := query.Execute()
	if err != nil {
		return fmt.Errorf("failed to delete from %s: %w", table, err)
	}
	return nil
}

// HealthCheck verifies the database connection
func (db *DatabaseService) HealthCheck(ctx context.Context) error {
	// Simple health check by trying to select from a system table
	var result []map[string]interface{}
	err := db.Select(ctx, "information_schema.tables", "table_name", map[string]interface{}{"table_schema": "public"}, &result)
	if err != nil {
		return fmt.Errorf("database health check failed: %w", err)
	}
	
	log.Printf("Database health check passed. Found %d tables", len(result))
	return nil
}
