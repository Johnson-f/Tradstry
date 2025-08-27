package services

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/Johnson-f/tradistry_backend/models"
	"github.com/gofiber/fiber/v2"
)

// SupabaseUserService handles user operations using Supabase
type SupabaseUserService struct {
	db *DatabaseService
}

// NewSupabaseUserService creates a new Supabase user service
func NewSupabaseUserService(db *DatabaseService) *SupabaseUserService {
	return &SupabaseUserService{
		db: db,
	}
}

// CreateUser creates a new user in Supabase
func (s *SupabaseUserService) CreateUser(ctx context.Context, req models.UserCreateRequest) (*models.User, error) {
	now := time.Now()
	
	user := models.User{
		Email:     req.Email,
		Username:  req.Username,
		FirstName: req.FirstName,
		LastName:  req.LastName,
		CreatedAt: now,
		UpdatedAt: now,
	}

	err := s.db.Insert(ctx, "users", user)
	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	// Fetch the created user to get the ID
	var createdUsers []models.User
	filters := map[string]interface{}{
		"email":      req.Email,
		"username":   req.Username,
		"created_at": now.Format(time.RFC3339),
	}
	
	err = s.db.Select(ctx, "users", "*", filters, &createdUsers)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch created user: %w", err)
	}

	if len(createdUsers) == 0 {
		return nil, fmt.Errorf("user was created but not found")
	}

	return &createdUsers[0], nil
}

// GetUserByID retrieves a user by ID
func (s *SupabaseUserService) GetUserByID(ctx context.Context, userID int64) (*models.User, error) {
	var users []models.User
	filters := map[string]interface{}{
		"id": userID,
	}

	err := s.db.Select(ctx, "users", "*", filters, &users)
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	if len(users) == 0 {
		return nil, fmt.Errorf("user not found")
	}

	return &users[0], nil
}

// GetUserByEmail retrieves a user by email
func (s *SupabaseUserService) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	var users []models.User
	filters := map[string]interface{}{
		"email": email,
	}

	err := s.db.Select(ctx, "users", "*", filters, &users)
	if err != nil {
		return nil, fmt.Errorf("failed to get user by email: %w", err)
	}

	if len(users) == 0 {
		return nil, fmt.Errorf("user not found")
	}

	return &users[0], nil
}

// GetUserByUsername retrieves a user by username
func (s *SupabaseUserService) GetUserByUsername(ctx context.Context, username string) (*models.User, error) {
	var users []models.User
	filters := map[string]interface{}{
		"username": username,
	}

	err := s.db.Select(ctx, "users", "*", filters, &users)
	if err != nil {
		return nil, fmt.Errorf("failed to get user by username: %w", err)
	}

	if len(users) == 0 {
		return nil, fmt.Errorf("user not found")
	}

	return &users[0], nil
}

// UpdateUser updates an existing user
func (s *SupabaseUserService) UpdateUser(ctx context.Context, userID int64, updates map[string]interface{}) (*models.User, error) {
	// First check if user exists
	_, err := s.GetUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Add updated_at timestamp
	updates["updated_at"] = time.Now()

	// Update the user
	filters := map[string]interface{}{
		"id": userID,
	}

	err = s.db.Update(ctx, "users", updates, filters)
	if err != nil {
		return nil, fmt.Errorf("failed to update user: %w", err)
	}

	// Return updated user
	return s.GetUserByID(ctx, userID)
}

// DeleteUser deletes a user
func (s *SupabaseUserService) DeleteUser(ctx context.Context, userID int64) error {
	// First check if user exists
	_, err := s.GetUserByID(ctx, userID)
	if err != nil {
		return err
	}

	filters := map[string]interface{}{
		"id": userID,
	}

	err = s.db.Delete(ctx, "users", filters)
	if err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}

	return nil
}

// GetAllUsers retrieves all users (with pagination support)
func (s *SupabaseUserService) GetAllUsers(ctx context.Context) ([]models.User, error) {
	var users []models.User
	filters := map[string]interface{}{} // No filters = get all

	err := s.db.Select(ctx, "users", "*", filters, &users)
	if err != nil {
		return nil, fmt.Errorf("failed to get all users: %w", err)
	}

	return users, nil
}

// UserExists checks if a user exists by email or username
func (s *SupabaseUserService) UserExists(ctx context.Context, email, username string) (bool, error) {
	var users []models.User
	
	// Check by email
	emailFilters := map[string]interface{}{
		"email": email,
	}
	err := s.db.Select(ctx, "users", "id", emailFilters, &users)
	if err != nil {
		return false, fmt.Errorf("failed to check user existence by email: %w", err)
	}
	
	if len(users) > 0 {
		return true, nil
	}

	// Check by username
	usernameFilters := map[string]interface{}{
		"username": username,
	}
	err = s.db.Select(ctx, "users", "id", usernameFilters, &users)
	if err != nil {
		return false, fmt.Errorf("failed to check user existence by username: %w", err)
	}

	return len(users) > 0, nil
}

// HTTP Handler Methods for Fiber

// CreateUserHandler handles HTTP request for creating a user
func (s *SupabaseUserService) CreateUserHandler(c *fiber.Ctx) error {
	var req models.UserCreateRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	// Check if user already exists
	exists, err := s.UserExists(c.Context(), req.Email, req.Username)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to check user existence",
		})
	}

	if exists {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error": "User with this email or username already exists",
		})
	}

	user, err := s.CreateUser(c.Context(), req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create user",
		})
	}

	response := models.UserResponse{
		ID:        user.ID,
		Email:     user.Email,
		Username:  user.Username,
		FirstName: user.FirstName,
		LastName:  user.LastName,
		CreatedAt: user.CreatedAt,
	}

	return c.Status(fiber.StatusCreated).JSON(response)
}

// GetUsersHandler handles HTTP request for getting all users
func (s *SupabaseUserService) GetUsersHandler(c *fiber.Ctx) error {
	users, err := s.GetAllUsers(c.Context())
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to get users",
		})
	}

	var responses []models.UserResponse
	for _, user := range users {
		responses = append(responses, models.UserResponse{
			ID:        user.ID,
			Email:     user.Email,
			Username:  user.Username,
			FirstName: user.FirstName,
			LastName:  user.LastName,
			CreatedAt: user.CreatedAt,
		})
	}

	return c.JSON(responses)
}

// GetUserHandler handles HTTP request for getting a single user
func (s *SupabaseUserService) GetUserHandler(c *fiber.Ctx) error {
	idParam := c.Params("id")
	userID, err := strconv.ParseInt(idParam, 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid user ID",
		})
	}

	user, err := s.GetUserByID(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": "User not found",
		})
	}

	response := models.UserResponse{
		ID:        user.ID,
		Email:     user.Email,
		Username:  user.Username,
		FirstName: user.FirstName,
		LastName:  user.LastName,
		CreatedAt: user.CreatedAt,
	}

	return c.JSON(response)
}

// UpdateUserHandler handles HTTP request for updating a user
func (s *SupabaseUserService) UpdateUserHandler(c *fiber.Ctx) error {
	idParam := c.Params("id")
	userID, err := strconv.ParseInt(idParam, 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid user ID",
		})
	}

	var updates map[string]interface{}
	if err := c.BodyParser(&updates); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	user, err := s.UpdateUser(c.Context(), userID, updates)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update user",
		})
	}

	response := models.UserResponse{
		ID:        user.ID,
		Email:     user.Email,
		Username:  user.Username,
		FirstName: user.FirstName,
		LastName:  user.LastName,
		CreatedAt: user.CreatedAt,
	}

	return c.JSON(response)
}

// DeleteUserHandler handles HTTP request for deleting a user
func (s *SupabaseUserService) DeleteUserHandler(c *fiber.Ctx) error {
	idParam := c.Params("id")
	userID, err := strconv.ParseInt(idParam, 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid user ID",
		})
	}

	err = s.DeleteUser(c.Context(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to delete user",
		})
	}

	return c.Status(fiber.StatusNoContent).Send(nil)
}
