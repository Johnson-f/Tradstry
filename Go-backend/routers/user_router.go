package routers

import (
	"github.com/Johnson-f/tradistry_backend/services"
	"github.com/gofiber/fiber/v2"
)

// UserRouter handles user-related routes
type UserRouter struct {
	userService services.UserServiceInterface
}

// NewUserRouter creates a new user router instance
func NewUserRouter(userService services.UserServiceInterface) *UserRouter {
	return &UserRouter{
		userService: userService,
	}
}

// SetupUserRoutes configures user routes
func (ur *UserRouter) SetupUserRoutes(api fiber.Router) {
	users := api.Group("/users")

	users.Post("/", ur.CreateUser)
	users.Get("/", ur.GetUsers)
	users.Get("/:id", ur.GetUser)
	users.Put("/:id", ur.UpdateUser)
	users.Delete("/:id", ur.DeleteUser)
}

// CreateUser handles user creation
func (ur *UserRouter) CreateUser(c *fiber.Ctx) error {
	return ur.userService.CreateUserHandler(c)
}

// GetUsers handles getting all users
func (ur *UserRouter) GetUsers(c *fiber.Ctx) error {
	return ur.userService.GetUsersHandler(c)
}

// GetUser handles getting a single user
func (ur *UserRouter) GetUser(c *fiber.Ctx) error {
	return ur.userService.GetUserHandler(c)
}

// UpdateUser handles user updates
func (ur *UserRouter) UpdateUser(c *fiber.Ctx) error {
	return ur.userService.UpdateUserHandler(c)
}

// DeleteUser handles user deletion
func (ur *UserRouter) DeleteUser(c *fiber.Ctx) error {
	return ur.userService.DeleteUserHandler(c)
}
